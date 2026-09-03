import bcrypt from "bcryptjs"
import { SignJWT, jwtVerify } from "jose"
import { prisma } from "@/lib/prisma"
import { getOverrideKey } from "@/lib/auth-secret"
import { bumpPinFailure, mergeUserPreferenceKey, type PreferencesExecutor } from "@/features/settings/services/user-preferences-write"
import { SecurityError } from "../lib/http"
import { readOwnerClosing } from "./read-owner-closing"

export const PIN_RE = /^\d{4}$/
export const PIN_LOCK_AFTER = 5
export const PIN_LOCK_MINUTES = 15
export const OVERRIDE_TTL_SECONDS = 120
const OVERRIDE_PURPOSE = "date-closing-override"

const NO_FAILURES = { pinFailures: { count: 0, lockedUntil: null } }

export async function setPin(executor: PreferencesExecutor, ownerId: string, pin: string): Promise<void> {
  if (!PIN_RE.test(pin)) throw new SecurityError("pinInvalid", 400)
  const pinHash = await bcrypt.hash(pin, 10)
  await mergeUserPreferenceKey(executor, ownerId, "dateClosing", {
    pinHash, pinUpdatedAt: new Date().toISOString(), pinFailures: { count: 0, lockedUntil: null },
  })
}

export type VerifyPinResult =
  | { ok: true }
  | { ok: false; reason: "pinNotSet" }
  | { ok: false; reason: "locked"; lockedUntil: string }
  | { ok: false; reason: "invalid"; attemptsLeft: number }

/**
 * Ordem fixa: bloqueado? → incrementa → compara. Acerto zera o contador.
 * O incremento vem ANTES da comparação de propósito: rajada de palpites em paralelo não corre mais
 * rápido que o contador. Se a linha do dono não existir, `bumpPinFailure` lança e o erro sobe —
 * dono sumido é falha de verdade, não PIN errado.
 *
 * O bloqueio VENCIDO não é zerado aqui. Zerar num UPDATE à parte reabria exatamente a corrida que o
 * contador atômico fecha: vários pedidos liam o mesmo bloqueio vencido, cada um mandava zerar e
 * contar, e `zera₁, conta₁, zera₂, conta₂, …` deixava o contador preso em 1. Hoje a expiração é
 * decidida dentro da própria instrução travada de `bumpPinFailure`.
 *
 * @param now SÓ PARA TESTES. Nunca alimentar com horário vindo de requisição: é o mesmo instante que
 * decide se o bloqueio venceu, então um corpo de POST poderia dissolver o bloqueio. Em produção fica
 * sempre no padrão (relógio do servidor).
 */
export async function verifyPin(ownerId: string, pin: string, now: Date = new Date()): Promise<VerifyPinResult> {
  const closing = await readOwnerClosing(prisma, ownerId, null)
  if (!closing.pinHash) return { ok: false, reason: "pinNotSet" }
  const lockedUntil = closing.pinFailures.lockedUntil
  if (lockedUntil && new Date(lockedUntil) > now) return { ok: false, reason: "locked", lockedUntil }

  const failure = await bumpPinFailure(prisma, ownerId, PIN_LOCK_AFTER, PIN_LOCK_MINUTES, now)
  const matches = PIN_RE.test(pin) && (await bcrypt.compare(pin, closing.pinHash))
  if (!matches) {
    if (failure.lockedUntil) return { ok: false, reason: "locked", lockedUntil: failure.lockedUntil }
    return { ok: false, reason: "invalid", attemptsLeft: Math.max(0, PIN_LOCK_AFTER - failure.count) }
  }
  await mergeUserPreferenceKey(prisma, ownerId, "dateClosing", NO_FAILURES)
  return { ok: true }
}

export async function issueOverrideToken(claims: { ownerId: string; userId: string }): Promise<{ token: string; expiresAt: string }> {
  const expiresAt = new Date(Date.now() + OVERRIDE_TTL_SECONDS * 1000).toISOString()
  const token = await new SignJWT({ purpose: OVERRIDE_PURPOSE, ownerId: claims.ownerId, userId: claims.userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${OVERRIDE_TTL_SECONDS}s`)
    .sign(await getOverrideKey())
  return { token, expiresAt }
}

export async function verifyOverrideToken(token: string): Promise<{ ownerId: string; userId: string } | null> {
  try {
    // Algoritmo fixo: sem isto, um token HS512 assinado com a MESMA chave também passaria.
    const { payload } = await jwtVerify(token, await getOverrideKey(), { algorithms: ["HS256"] })
    if (payload.purpose !== OVERRIDE_PURPOSE) return null
    if (typeof payload.ownerId !== "string" || typeof payload.userId !== "string") return null
    if (typeof payload.iat !== "number" || typeof payload.exp !== "number") return null
    return { ownerId: payload.ownerId, userId: payload.userId }
  } catch {
    return null
  }
}
