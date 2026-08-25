import crypto from "node:crypto"
import {
  deleteAppSettings,
  readAppSecrets,
  writeAppSecrets,
} from "@/features/settings/services/app-settings-service"

/**
 * A chave do despertador: o segredo que a rota do tique exige.
 *
 * Fica no mesmo cofre cifrado dos outros segredos (`app_settings`). Diferente do
 * token do bot, este PRECISA ser visto uma vez — o dono cola a URL num serviço
 * externo de despertador. Por isso a tela mostra o endereço completo no momento
 * em que ele é gerado, e nunca mais: depois disso só resta gerar um novo, o que
 * invalida o anterior na hora.
 *
 * Sem segredo guardado nem variável de ambiente, a rota recusa TUDO — fechada
 * por padrão, como o webhook do Telegram.
 */

export const TICK_SECRET_KEY = "notifications.tickSecret"

export async function getStoredTickSecret(): Promise<string | null> {
  const secrets = await readAppSecrets([TICK_SECRET_KEY])
  return secrets.get(TICK_SECRET_KEY) ?? null
}

/** Gera e guarda um segredo novo, devolvendo-o em claro UMA vez. */
export async function rotateTickSecret(): Promise<string> {
  const secret = crypto.randomBytes(32).toString("base64url")
  await writeAppSecrets({ [TICK_SECRET_KEY]: secret })
  return secret
}

export async function clearTickSecret(): Promise<void> {
  await deleteAppSettings([TICK_SECRET_KEY])
}

export interface TickSecretStatus {
  configured: boolean
  /** "db" = gerado na tela; "env" = variável de ambiente da hospedagem. */
  source: "db" | "env" | null
}

function envTickSecrets(env: NodeJS.ProcessEnv = process.env): string[] {
  return [env.WISEVEO_TICK_SECRET, env.CRON_SECRET].filter(
    (value): value is string => typeof value === "string" && value.trim() !== "",
  )
}

export async function getTickSecretStatus(): Promise<TickSecretStatus> {
  const stored = await getStoredTickSecret().catch(() => null)
  if (stored) return { configured: true, source: "db" }
  if (envTickSecrets().length > 0) return { configured: true, source: "env" }
  return { configured: false, source: null }
}

/** Comparação de tempo constante — evita descobrir o segredo caractere a caractere. */
function matches(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/**
 * Aceita o segredo no cabeçalho `Authorization: Bearer …` (preferido) ou em
 * `?key=…`. O parâmetro existe porque metade dos despertadores gratuitos só
 * sabe abrir uma URL — sem ele, quem não é técnico desiste na primeira tela.
 */
export async function isAuthorizedTick(request: Request): Promise<boolean> {
  const header = request.headers.get("authorization") ?? ""
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : ""
  const queryKey = new URL(request.url).searchParams.get("key")?.trim() ?? ""
  const candidates = [bearer, queryKey].filter((value) => value !== "")
  if (candidates.length === 0) return false

  const expected: string[] = []
  const stored = await getStoredTickSecret().catch(() => null)
  if (stored) expected.push(stored)
  expected.push(...envTickSecrets())
  if (expected.length === 0) return false

  return candidates.some((candidate) => expected.some((value) => matches(candidate, value)))
}
