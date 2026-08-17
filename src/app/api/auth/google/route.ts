import { NextResponse } from "next/server"
import { generateState, getGoogleAuthUrl, GOOGLE_INVITE_COOKIE, isGoogleConfigured } from "@/lib/google-auth"

export async function GET(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

  if (!isGoogleConfigured()) {
    return NextResponse.redirect(`${appUrl}/login?error=google_not_configured`)
  }

  const state = generateState()
  const authUrl = getGoogleAuthUrl(state)

  const response = NextResponse.redirect(authUrl)

  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10, // 10 minutes
    path: "/",
  })

  // Aceite de convite via Google: o token do convite viaja num cookie curto e
  // é consumido pelo callback (vincula o novo usuário à conta de quem convidou).
  const invite = new URL(request.url).searchParams.get("invite")
  if (invite && /^[A-Za-z0-9_-]{16,128}$/.test(invite)) {
    response.cookies.set(GOOGLE_INVITE_COOKIE, invite, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 10,
      path: "/",
    })
  }

  return response
}
