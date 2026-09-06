import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { exchangeCalendarCodeForTokens, GOOGLE_DRIVE_FILE_SCOPE, isGoogleConfigured } from "@/lib/google-auth"
import { purposeOf, type GoogleOAuthPurpose } from "@/lib/google-oauth-state"
import { encryptGoogleToken } from "@/lib/google-token-cipher"
import { mergeUserPreferenceKey } from "@/features/settings/services/user-preferences-write"
import { getSessionUserId } from "@/lib/session"
import { getAppUrl } from "@/lib/app-url"

/**
 * Volta do Google para DOIS consentimentos: a Agenda (state cru) e o Drive do backup
 * (state com sufixo `.backup`). O propósito decide só para onde a pessoa volta e se
 * `preferences_json.backup.driveGrantedAt` é gravado; a troca do code e a gravação
 * cifrada dos tokens são as mesmas, porque existe um único conjunto de tokens por pessoa
 * e o pedido do Drive é incremental (cobre a Agenda também).
 */
function destination(appUrl: string, purpose: GoogleOAuthPurpose, code: string | null): string {
  if (purpose === "backup") {
    return `${appUrl}/configuracoes?tab=integrations&backup=${code ?? "connected"}`
  }
  return code ? `${appUrl}/calendar?error=${code}` : `${appUrl}/calendar`
}

export async function GET(request: NextRequest) {
  const appUrl = getAppUrl(request)
  const { searchParams } = request.nextUrl
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  // Lido antes da checagem de CSRF de propósito: só escolhe o destino do redirecionamento
  // (inclusive nos erros), não concede nada. A validação do state continua sendo igualdade
  // estrita, e nada é gravado antes dela.
  const purpose = purposeOf(state)

  if (!isGoogleConfigured()) {
    return NextResponse.redirect(destination(appUrl, purpose, "google_not_configured"))
  }
  if (error) {
    return NextResponse.redirect(destination(appUrl, purpose, "google_denied"))
  }

  // Validate state (CSRF): o cookie guarda o state inteiro, sufixo incluído.
  const savedState = request.cookies.get("google_calendar_oauth_state")?.value
  if (!state || !savedState || state !== savedState) {
    return NextResponse.redirect(destination(appUrl, purpose, "invalid_state"))
  }
  if (!code) {
    return NextResponse.redirect(destination(appUrl, purpose, "no_code"))
  }

  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.redirect(`${appUrl}/login`)
  }

  try {
    const tokens = await exchangeCalendarCodeForTokens(code, appUrl)

    await prisma.user.update({
      where: { id: userId },
      data: {
        // Cifrados: dão acesso ao calendário (e agora ao Drive) da pessoa e nunca vão em
        // claro para o banco (ver src/lib/google-token-cipher.ts).
        googleAccessToken: encryptGoogleToken(tokens.access_token),
        googleRefreshToken: tokens.refresh_token ? encryptGoogleToken(tokens.refresh_token) : undefined,
        googleTokenExpiresAt: new Date(
          Date.now() + tokens.expires_in * 1000,
        ),
      },
    })

    let outcome: string | null = null
    if (purpose === "backup") {
      const granted = (tokens.scope ?? "").split(" ").includes(GOOGLE_DRIVE_FILE_SCOPE)
      if (granted) {
        await mergeUserPreferenceKey(prisma, userId, "backup", { driveGrantedAt: new Date().toISOString() })
      } else {
        outcome = "scope_missing"
      }
    }

    const response = NextResponse.redirect(destination(appUrl, purpose, outcome))

    // Clear OAuth state cookie
    response.cookies.set("google_calendar_oauth_state", "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
    })

    return response
  } catch (err) {
    console.error("[Google Calendar OAuth callback] error:", err)
    return NextResponse.redirect(destination(appUrl, purpose, "google_failed"))
  }
}
