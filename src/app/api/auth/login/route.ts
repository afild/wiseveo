import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import bcrypt from "bcryptjs"
import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import { createSessionToken, COOKIE_NAME } from "@/lib/auth"
import {
  isActiveUser,
  normalizeEmail,
  PENDING_APPROVAL_PATH,
} from "@/lib/user-approval"
import { isSetupComplete } from "@/lib/setup-check"
import { applySessionLocaleCookie } from "@/i18n/session-locale"

export async function POST(request: NextRequest) {
  const t = await getTranslations("api.auth")

  // Primeiro acesso (sem banco): não há conta para entrar — a pessoa cria a do
  // administrador na aba "Criar conta" e segue para o Setup Wizard.
  if (!isSetupComplete()) {
    return NextResponse.json({ success: false, code: "firstAccess", message: t("firstAccess") }, { status: 409 })
  }

  try {
    const { email, password } = await request.json()
    const normalizedEmail = typeof email === "string" ? normalizeEmail(email) : ""

    if (!normalizedEmail || !password) {
      return NextResponse.json(
        { success: false, message: t("emailPasswordRequired") },
        { status: 400 }
      )
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })

    if (!user) {
      return NextResponse.json(
        { success: false, message: t("invalidCredentials") },
        { status: 401 }
      )
    }

    if (!user.passwordHash) {
      if (!isActiveUser(user.status)) {
        return NextResponse.json(
          {
            success: true,
            message: t("pendingApprovalLogin"),
            redirectTo: PENDING_APPROVAL_PATH,
          },
          { status: 200 }
        )
      }

      return NextResponse.json(
        { success: false, message: t("googleAccountRequired") },
        { status: 401 }
      )
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash)

    if (!passwordMatch) {
      return NextResponse.json(
        { success: false, message: t("invalidCredentials") },
        { status: 401 }
      )
    }

    if (!isActiveUser(user.status)) {
      return NextResponse.json(
        {
          success: true,
          message: t("pendingApprovalLogin"),
          redirectTo: PENDING_APPROVAL_PATH,
        },
        { status: 200 }
      )
    }

    const token = await createSessionToken(user.id)
    const isNewSetup = request.cookies.has("wiseveo-new-setup")
    const redirectTo = isNewSetup ? "/configuracoes?onboarding=true" : undefined

    const response = NextResponse.json(
      { success: true, message: t("loginSuccess"), redirectTo },
      { status: 200 }
    )

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 dias
      path: "/",
    })

    // O idioma salvo no perfil acompanha a pessoa neste navegador.
    applySessionLocaleCookie(response, user.preferencesJson)

    if (isNewSetup) {
      response.cookies.delete("wiseveo-new-setup")
    }

    return response
  } catch {
    const tErrors = await getTranslations("api.errors")
    return NextResponse.json(
      { success: false, message: tErrors("internalError") },
      { status: 500 }
    )
  }
}
