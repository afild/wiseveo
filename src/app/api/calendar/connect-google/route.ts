import { NextResponse } from "next/server"
import { generateState, getGoogleCalendarAuthUrl, isGoogleConfigured } from "@/lib/google-auth"
import { getSessionUserId } from "@/lib/session"
import { getAppUrl } from "@/lib/app-url"

export async function GET(request: Request) {
  const appUrl = getAppUrl(request)

  if (!isGoogleConfigured()) {
    return NextResponse.redirect(`${appUrl}/calendar?error=google_not_configured`)
  }

  const userId = await getSessionUserId()

  if (!userId) {
    return NextResponse.redirect(`${appUrl}/login`)
  }

  const state = generateState()
  const authUrl = getGoogleCalendarAuthUrl(state, appUrl)

  const response = NextResponse.redirect(authUrl)

  response.cookies.set("google_calendar_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  })

  return response
}
