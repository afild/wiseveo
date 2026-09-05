import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { exchangeCalendarCodeForTokens, isGoogleConfigured } from "@/lib/google-auth"
import { encryptGoogleToken } from "@/lib/google-token-cipher"
import { getSessionUserId } from "@/lib/session"
import { getAppUrl } from "@/lib/app-url"

export async function GET(request: NextRequest) {
  const appUrl = getAppUrl(request)

  if (!isGoogleConfigured()) {
    return NextResponse.redirect(`${appUrl}/calendar?error=google_not_configured`)
  }

  const { searchParams } = request.nextUrl
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  if (error) {
    return NextResponse.redirect(`${appUrl}/calendar?error=google_denied`)
  }

  // Validate state (CSRF)
  const savedState = request.cookies.get("google_calendar_oauth_state")?.value
  if (!state || !savedState || state !== savedState) {
    return NextResponse.redirect(`${appUrl}/calendar?error=invalid_state`)
  }

  if (!code) {
    return NextResponse.redirect(`${appUrl}/calendar?error=no_code`)
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
        // Cifrados: dão acesso ao calendário da pessoa e nunca vão em claro para o banco
        // (ver src/lib/google-token-cipher.ts).
        googleAccessToken: encryptGoogleToken(tokens.access_token),
        googleRefreshToken: tokens.refresh_token ? encryptGoogleToken(tokens.refresh_token) : undefined,
        googleTokenExpiresAt: new Date(
          Date.now() + tokens.expires_in * 1000,
        ),
      },
    })

    const response = NextResponse.redirect(`${appUrl}/calendar`)

    // Clear OAuth state cookie
    response.cookies.set("google_calendar_oauth_state", "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
    })

    return response
  } catch (err) {
    console.error("[Google Calendar OAuth callback] error:", err)
    return NextResponse.redirect(`${appUrl}/calendar?error=google_failed`)
  }
}
