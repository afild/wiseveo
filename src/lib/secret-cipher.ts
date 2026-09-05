import crypto from "crypto"

/**
 * Cifra dos segredos guardados no banco (`app_settings`): token do bot do Telegram
 * e, adiante, chaves de provedores de IA. AES-256-GCM — autenticada: valor adulterado
 * não decifra "errado", decifra NADA.
 *
 * A chave segue a mesma filosofia da chave de sessão (`src/lib/auth-secret.ts`):
 * derivada de `AUTH_SECRET` → `DATABASE_URL` → fallback de dev, com um RÓTULO PRÓPRIO
 * (nunca reutilizar o rótulo da sessão — chaves diferentes para fins diferentes).
 * Quem tem a URL do banco já tem os dados; derivar dela não abre brecha nova.
 *
 * Consequência conhecida: trocar a senha do banco (ou passar a definir AUTH_SECRET)
 * muda a chave e os segredos gravados deixam de decifrar. O app trata isso como
 * "não configurado" e pede para colar de novo — nunca quebra.
 *
 * `node:crypto` de propósito: este módulo roda só em rotas/serviços do servidor,
 * nunca no middleware.
 */

const DERIVATION_LABEL = "wiseveo-secrets-key-v1"
const DEV_FALLBACK = "fallback-secret-change-me"
const VERSION = "v1"

/** De onde a chave nasce hoje: env explícita → URL do banco → fallback de dev. */
export function secretCipherSource(env: NodeJS.ProcessEnv = process.env): string {
  return env.AUTH_SECRET || env.DATABASE_URL || DEV_FALLBACK
}

/**
 * Fonte que VAI valer depois que o Setup terminar (a URL recém-conectada) — o par de
 * `futureSessionSource`: o wizard grava segredos que só serão lidos após o redeploy.
 */
export function futureSecretsSource(databaseUrl: string, env: NodeJS.ProcessEnv = process.env): string {
  return env.AUTH_SECRET || databaseUrl
}

function deriveKey(label: string, source: string): Buffer {
  return crypto.createHash("sha256").update(`${label}:${source}`).digest()
}

/**
 * A cifra em si, com o rótulo explícito. Outros usos que precisem guardar segredo no
 * banco (ex.: os tokens da Agenda, em `src/lib/google-token-cipher.ts`) reaproveitam
 * ESTAS funções com um rótulo próprio, em vez de reimplementar AES.
 *
 * Rótulo diferente = chave diferente: quem lê um cofre não lê o outro. Nunca passar
 * aqui o rótulo da sessão nem o de outro uso.
 */
export function encryptWithLabel(label: string, plain: string, source: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(label, source), iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(":")
}

/** `null` para QUALQUER falha (chave trocada, rótulo errado, valor adulterado, formato estranho). */
export function decryptWithLabel(label: string, payload: string, source: string): string | null {
  try {
    const [version, ivPart, tagPart, dataPart] = payload.split(":")
    if (version !== VERSION || !ivPart || !tagPart || !dataPart) return null
    const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(label, source), Buffer.from(ivPart, "base64url"))
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"))
    return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

/** Formato do envelope desta cifra, para distinguir de um valor legado gravado em claro. */
export function looksEncrypted(value: string): boolean {
  const parts = value.split(":")
  return parts.length === 4 && parts[0] === VERSION && !!parts[1] && !!parts[2] && !!parts[3]
}

/** `v1:<iv>:<tag>:<dados>` em base64url — autocontido para decifrar depois. */
export function encryptSecret(plain: string, source: string = secretCipherSource()): string {
  return encryptWithLabel(DERIVATION_LABEL, plain, source)
}

/** `null` para QUALQUER falha (chave trocada, valor adulterado, formato estranho). */
export function decryptSecret(payload: string, source: string = secretCipherSource()): string | null {
  return decryptWithLabel(DERIVATION_LABEL, payload, source)
}
