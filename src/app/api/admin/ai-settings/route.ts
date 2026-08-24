import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { isSuperAdminSession } from "@/lib/setup-access"
import {
  AppSettingsError,
  readAppSettingsStructure,
} from "@/features/settings/services/app-settings-service"
import { AI_PROVIDER_IDS, type AiProviderId } from "@/features/ai/lib/catalog"
import {
  getAiConfig,
  getAiStatusSummary,
  saveAiBudget,
  saveAiModels,
  saveAiProviderKey,
  saveCompatibleBaseUrl,
  type AiModelChoice,
} from "@/features/ai/services/ai-config.service"
import { getMonthUsage, invalidateAiBudgetCache } from "@/features/ai/services/ai-usage.service"

export const dynamic = "force-dynamic"

/**
 * Tela "Inteligência artificial" (Configurações → Integrações). A IA é da
 * INSTALAÇÃO: só o SUPERADMIN configura; na demo a rota nem existe. Chaves nunca
 * voltam em resposta — a tela só vê "configurada: sim/não, de onde veio".
 */
async function guard(): Promise<boolean> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return false
  return isSuperAdminSession()
}

async function snapshot() {
  const [structure, summary, usage] = await Promise.all([
    readAppSettingsStructure(),
    getAiStatusSummary(),
    getMonthUsage(),
  ])
  return { structure, ...summary, usage }
}

export async function GET() {
  if (!(await guard())) return new NextResponse(null, { status: 404 })
  try {
    return NextResponse.json({ success: true, data: await snapshot() })
  } catch (error) {
    return unexpectedError(error)
  }
}

function isProviderId(value: unknown): value is AiProviderId {
  return typeof value === "string" && (AI_PROVIDER_IDS as string[]).includes(value)
}

function parseModelChoice(value: unknown): AiModelChoice | null {
  if (!value || typeof value !== "object") return null
  const { provider, model } = value as { provider?: unknown; model?: unknown }
  if (!isProviderId(provider) || typeof model !== "string" || !model.trim()) return null
  return { provider, model: model.trim() }
}

export async function PUT(req: Request) {
  if (!(await guard())) return new NextResponse(null, { status: 404 })
  const t = await getTranslations("api.aiSettings")

  try {
    const body = (await req.json().catch(() => null)) as {
      keys?: Record<string, unknown>
      compatibleBaseUrl?: unknown
      models?: { fast?: unknown; smart?: unknown }
      budget?: { monthlyLimitUsd?: unknown }
    } | null
    if (!body) {
      return NextResponse.json({ success: false, message: t("invalidPayload") }, { status: 400 })
    }

    // 1. Chaves (string = gravar; null = remover). Valida TUDO antes de gravar
    //    QUALQUER coisa: pedido inválido não pode deixar meia configuração no banco.
    if (body.keys) {
      const entries = Object.entries(body.keys)
      for (const [provider, value] of entries) {
        if (!isProviderId(provider) || (value !== null && typeof value !== "string")) {
          return NextResponse.json({ success: false, message: t("invalidProvider") }, { status: 400 })
        }
      }
      for (const [provider, value] of entries) {
        await saveAiProviderKey(
          provider as AiProviderId,
          typeof value === "string" && value.trim() ? value.trim() : null,
        )
      }
    }

    // 2. Endereço do endpoint compatível
    if (body.compatibleBaseUrl !== undefined) {
      const url = typeof body.compatibleBaseUrl === "string" ? body.compatibleBaseUrl.trim() : ""
      if (url && !/^https?:\/\//.test(url)) {
        return NextResponse.json({ success: false, message: t("invalidUrl") }, { status: 400 })
      }
      await saveCompatibleBaseUrl(url || null)
    }

    // 3. Modelos dos dois níveis
    if (body.models !== undefined) {
      const fast = parseModelChoice(body.models?.fast)
      const smart = parseModelChoice(body.models?.smart)
      if (!fast || !smart) {
        return NextResponse.json({ success: false, message: t("invalidModels") }, { status: 400 })
      }
      const config = await getAiConfig()
      for (const choice of [fast, smart]) {
        const ok =
          choice.provider === "compatible" ? Boolean(config.compatibleBaseUrl) : Boolean(config.keys[choice.provider])
        if (!ok) {
          return NextResponse.json(
            { success: false, message: t("providerNotConfigured") },
            { status: 400 },
          )
        }
      }
      await saveAiModels({ fast, smart })
    }

    // 4. Teto mensal (null = sem teto)
    if (body.budget !== undefined) {
      const limit = body.budget?.monthlyLimitUsd
      if (limit !== null && (typeof limit !== "number" || !Number.isFinite(limit) || limit < 0)) {
        return NextResponse.json({ success: false, message: t("invalidBudget") }, { status: 400 })
      }
      await saveAiBudget(limit === null ? null : limit)
      invalidateAiBudgetCache()
    }

    console.log("[AI SETTINGS] Updated by the owner")
    return NextResponse.json({ success: true, data: await snapshot() })
  } catch (error) {
    if (error instanceof AppSettingsError && error.code === "tableMissing") {
      return NextResponse.json({ success: false, code: "notPrepared", message: t("notPrepared") }, { status: 409 })
    }
    return unexpectedError(error)
  }
}

async function unexpectedError(error: unknown) {
  console.error("[AI SETTINGS] unexpected:", error)
  const tErrors = await getTranslations("api.errors")
  return NextResponse.json({ success: false, message: tErrors("internalError") }, { status: 500 })
}
