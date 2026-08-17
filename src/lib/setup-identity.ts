import { SignJWT, jwtVerify } from "jose"
import type { NextResponse } from "next/server"

/**
 * Identidade do PRIMEIRO ACESSO: a pessoa cria a conta (e-mail+senha ou Google)
 * ANTES de existir banco. Os dados viajam neste cookie httpOnly (assinado com o
 * mesmo segredo da sessão) até o Setup Wizard concluir — aí viram o SUPERADMIN
 * no banco recém-conectado e o cookie é apagado.
 *
 * Só carrega afirmações da própria pessoa sobre ela mesma (nome, e-mail, hash da
 * senha ou id do Google): numa instalação ainda não configurada qualquer visitante
 * pode rodar o wizard por definição, então não há privilégio a escalar aqui.
 * Tokens OAuth NÃO entram no cookie (o Google Agenda é reconectado depois, nas
 * Configurações).
 */

export const SETUP_IDENTITY_COOKIE = "wiseveo-setup-identity"
const MAX_AGE_SECONDS = 60 * 60 * 2 // 2 h: tempo de sobra para configurar

export type SetupIdentityProvider = "password" | "google"

export interface SetupIdentity {
  name: string
  email: string
  provider: SetupIdentityProvider
  /** bcrypt — só quando provider = "password". */
  passwordHash?: string
  /** `sub` do Google — só quando provider = "google". */
  googleId?: string
  photo?: string | null
}

const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "fallback-secret-change-me")

export async function encodeSetupIdentity(identity: SetupIdentity): Promise<string> {
  return new SignJWT({ ...identity })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret)
}

export async function decodeSetupIdentity(token: string | undefined | null): Promise<SetupIdentity | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret)
    const p = payload as Partial<SetupIdentity>
    if (typeof p.name !== "string" || typeof p.email !== "string") return null
    if (p.provider !== "password" && p.provider !== "google") return null
    if (p.provider === "password" && typeof p.passwordHash !== "string") return null
    if (p.provider === "google" && typeof p.googleId !== "string") return null
    return {
      name: p.name,
      email: p.email,
      provider: p.provider,
      passwordHash: p.passwordHash,
      googleId: p.googleId,
      photo: typeof p.photo === "string" ? p.photo : null,
    }
  } catch {
    return null
  }
}

export function setSetupIdentityCookie(response: NextResponse, token: string) {
  response.cookies.set(SETUP_IDENTITY_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  })
}

export function clearSetupIdentityCookie(response: NextResponse) {
  response.cookies.set(SETUP_IDENTITY_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" })
}
