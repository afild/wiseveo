import { SignJWT, jwtVerify } from "jose"
import { getSessionKey } from "./auth-secret"

const COOKIE_NAME = "session"

export type SessionPayload = { userId: string; demoShared?: boolean }

/**
 * @param key chave alternativa — só o Setup usa, para assinar a sessão com a chave
 * que passará a valer depois do reinício/redeploy (ver `futureSessionSource`).
 * @param opts.demoShared marca a sessão compartilhada da demo (vitrine, sem escrita —
 * ver `isBlockedSharedWrite` em `demo-shared.ts`). Quem não usa `key` mas quer `opts`
 * chama `createSessionToken(id, undefined, opts)` — o `undefined` do meio é a chave.
 */
export async function createSessionToken(
  userId: string,
  key?: Uint8Array,
  opts?: { demoShared?: boolean },
): Promise<string> {
  return new SignJWT({
    userId,
    ...(opts?.demoShared ? { demoShared: true } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key ?? (await getSessionKey()))
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, await getSessionKey())
    return { userId: String(payload.userId), demoShared: payload.demoShared === true }
  } catch {
    return null
  }
}

export { COOKIE_NAME }
