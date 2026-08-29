import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { isSuperAdminSession } from "@/lib/setup-access"
import { AI_PROVIDER_IDS, type AiProviderId } from "@/features/ai/lib/catalog"
import {
  ModelCatalogError,
  listProviderModels,
} from "@/features/ai/services/model-catalog.service"

export const dynamic = "force-dynamic"

/**
 * "Quais modelos a minha chave tem?" — pergunta feita ao provedor, não à lista
 * escrita no código. POST, e não GET, porque a chave pode vir digitada e ainda
 * não salva: no corpo ela viaja pelo HTTPS e some; numa URL ficaria no histórico
 * do navegador e no log do servidor. A chave nunca volta na resposta.
 */
async function guard(): Promise<boolean> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return false
  return isSuperAdminSession()
}

function isProviderId(value: unknown): value is AiProviderId {
  return typeof value === "string" && (AI_PROVIDER_IDS as string[]).includes(value)
}

export async function POST(req: Request) {
  if (!(await guard())) return new NextResponse(null, { status: 404 })
  const t = await getTranslations("api.aiSettings")

  try {
    const body = (await req.json().catch(() => null)) as {
      provider?: unknown
      apiKey?: unknown
      baseUrl?: unknown
    } | null

    if (!isProviderId(body?.provider)) {
      return NextResponse.json({ success: false, message: t("invalidProvider") }, { status: 400 })
    }

    const models = await listProviderModels(body.provider, {
      apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
      baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
    })

    return NextResponse.json({ success: true, data: { models } })
  } catch (error) {
    if (error instanceof ModelCatalogError) {
      const message =
        error.code === "noCredentials"
          ? t("modelsNoCredentials")
          : t("modelsFailed", { message: error.detail ?? "" })
      return NextResponse.json(
        { success: false, code: error.code, message },
        { status: error.code === "noCredentials" ? 400 : 502 },
      )
    }
    console.error("[AI SETTINGS] models unexpected:", error)
    const tErrors = await getTranslations("api.errors")
    return NextResponse.json({ success: false, message: tErrors("internalError") }, { status: 500 })
  }
}
