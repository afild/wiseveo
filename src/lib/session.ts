import { cookies } from "next/headers"
import { verifySessionToken, COOKIE_NAME, type SessionPayload } from "./auth"

/** Payload completo da sessão (userId + demoShared). */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifySessionToken(token)
}

export async function getSessionUserId(): Promise<string | null> {
  return (await getSession())?.userId ?? null
}
