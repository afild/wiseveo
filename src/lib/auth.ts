import { SignJWT, jwtVerify } from "jose"
import { getSessionKey } from "./auth-secret"

const COOKIE_NAME = "session"

/**
 * @param key chave alternativa — só o Setup usa, para assinar a sessão com a chave
 * que passará a valer depois do reinício/redeploy (ver `futureSessionSource`).
 */
export async function createSessionToken(userId: string, key?: Uint8Array) {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key ?? (await getSessionKey()))
}

export async function verifySessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, await getSessionKey())
    return payload as { userId: string }
  } catch {
    return null
  }
}

export { COOKIE_NAME }
