import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { createSessionToken, COOKIE_NAME } from "@/lib/auth"
import { exchangeCodeForTokens, decodeIdToken, GOOGLE_INVITE_COOKIE, isGoogleConfigured } from "@/lib/google-auth"
import {
  getInitialUserAccess,
  isActiveUser,
  isBootstrapAdminEmail,
  normalizeEmail,
  PENDING_APPROVAL_PATH,
} from "@/lib/user-approval"
import { acceptInvitationForUser, peekInvitation } from "@/features/settings/services/invitations-service"
import { isPublicSignupEnabled } from "@/lib/public-signup"
import { isSetupComplete } from "@/lib/setup-check"
import { encodeSetupIdentity, setSetupIdentityCookie } from "@/lib/setup-identity"
import { getAppUrl } from "@/lib/app-url"

export async function GET(request: NextRequest) {
  const appUrl = getAppUrl(request)

  if (!isGoogleConfigured()) {
    return NextResponse.redirect(`${appUrl}/login?error=google_not_configured`)
  }

  const { searchParams } = request.nextUrl
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  // User denied consent or error
  if (error) {
    return NextResponse.redirect(`${appUrl}/login?error=google_denied`)
  }

  // Validate state (CSRF protection)
  const savedState = request.cookies.get("google_oauth_state")?.value
  if (!state || !savedState || state !== savedState) {
    return NextResponse.redirect(`${appUrl}/login?error=invalid_state`)
  }

  if (!code) {
    return NextResponse.redirect(`${appUrl}/login?error=no_code`)
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, appUrl)
    const userInfo = decodeIdToken(tokens.id_token)
    const normalizedEmail = normalizeEmail(userInfo.email)

    // PRIMEIRO ACESSO (ainda sem banco): a conta Google vira a identidade do
    // administrador; nada é gravado — segue para o Setup Wizard com o cookie.
    if (!isSetupComplete()) {
      const identity = await encodeSetupIdentity({
        name: userInfo.name || normalizedEmail,
        email: normalizedEmail,
        provider: "google",
        googleId: userInfo.sub,
        photo: userInfo.picture || null,
      })
      const response = NextResponse.redirect(`${appUrl}/setup`)
      setSetupIdentityCookie(response, identity)
      response.cookies.set("google_oauth_state", "", { httpOnly: true, maxAge: 0, path: "/" })
      return response
    }

    // Convite (aceite via Google): só vale para usuário NOVO; quem já tem conta
    // entra normalmente e o convite fica de fora (sem mesclar contas).
    const inviteToken = request.cookies.get(GOOGLE_INVITE_COOKIE)?.value ?? null
    const invitation = inviteToken ? await peekInvitation(inviteToken) : null

    // Find or create user
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { googleId: userInfo.sub },
          { email: normalizedEmail },
        ],
      },
    })

    if (user) {
      const bootstrapAdmin = isBootstrapAdminEmail(user.email)

      // Vincula a conta Google (só identidade). Tokens da Agenda NÃO são gravados
      // aqui — vêm apenas do fluxo api/calendar/connect-google; os já existentes
      // ficam intactos.
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: user.googleId || userInfo.sub,
          photo: user.photo || userInfo.picture || null,
          ...(bootstrapAdmin
            ? {
                role: "SUPERADMIN",
                status: "ACTIVE",
              }
            : {}),
        },
      })
    } else if (invitation && inviteToken) {
      // Membro convidado: já ativo, dentro da conta de quem convidou, sem plano
      // de contas próprio (usa o do dono).
      user = await prisma.user.create({
        data: {
          name: userInfo.name,
          email: normalizedEmail,
          googleId: userInfo.sub,
          photo: userInfo.picture || null,
          role: invitation.role,
          status: "ACTIVE",
          dataOwnerId: invitation.dataOwnerId,
        },
      })
      await acceptInvitationForUser({ token: inviteToken, userId: user.id })
    } else {
      // Instância privada (WISEVEO_PUBLIC_SIGNUP=false): Google não cria conta nova
      // sem convite — só entra quem já existe.
      if (!isPublicSignupEnabled()) {
        return NextResponse.redirect(`${appUrl}/login?error=signup_disabled`)
      }

      const initialAccess = getInitialUserAccess(normalizedEmail)
      const userCount = await prisma.user.count()
      const isFirstUser = userCount === 0

      // Create new user (no password); identity only, no calendar tokens
      user = await prisma.user.create({
        data: {
          name: userInfo.name,
          email: normalizedEmail,
          googleId: userInfo.sub,
          photo: userInfo.picture || null,
          role: isFirstUser ? "SUPERADMIN" : initialAccess.role,
          status: isFirstUser ? "ACTIVE" : initialAccess.status,
        },
      })

      const { initializeUserData } = await import("@/lib/user-init")
      await initializeUserData(user.id)
    }

    if (!isActiveUser(user.status)) {
      const response = NextResponse.redirect(`${appUrl}${PENDING_APPROVAL_PATH}`)

      response.cookies.set("google_oauth_state", "", {
        httpOnly: true,
        maxAge: 0,
        path: "/",
      })
      response.cookies.set(GOOGLE_INVITE_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" })

      return response
    }

    // Create session
    const token = await createSessionToken(user.id)

    const response = NextResponse.redirect(`${appUrl}/dashboard`)

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    })

    // Clear OAuth state cookie
    response.cookies.set("google_oauth_state", "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
    })
    response.cookies.set(GOOGLE_INVITE_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" })

    return response
  } catch (err) {
    console.error("[Google OAuth callback] error:", err)
    return NextResponse.redirect(`${appUrl}/login?error=google_failed`)
  }
}
