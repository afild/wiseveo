import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { isSuperAdminSession } from "@/lib/setup-access"
import { AI_PROVIDER_IDS, type AiProviderId } from "@/features/ai/lib/catalog"
import { testAiProvider } from "@/features/ai/services/llm.service"

export const dynamic = "force-dynamic"

/**
 * Botão "Testar" da tela de IA: uma chamada mínima ao provedor com a chave
 * informada (antes de salvar) ou a guardada. A chave chega no corpo (HTTPS),
 * nunca volta na resposta nem entra em log.
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
      model?: unknown
      apiKey?: unknown
      baseUrl?: unknown
    } | null
    if (!isProviderId(body?.provider)) {
      return NextResponse.json({ success: false, message: t("invalidProvider") }, { status: 400 })
    }

    const result = await testAiProvider({
      provider: body.provider,
      model: typeof body.model === "string" ? body.model : undefined,
      apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
      baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
    })

    if (!result.ok) {
      // Código estável do serviço → mensagem traduzida aqui (regra da casa).
      const message =
        result.code === "needsModel" ? t("testNeedsModel") : t("testFailed", { message: result.detail })
      return NextResponse.json(
        { success: false, code: result.code, message },
        { status: result.code === "needsModel" ? 400 : 502 },
      )
    }
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error("[AI SETTINGS] test unexpected:", error)
    const tErrors = await getTranslations("api.errors")
    return NextResponse.json({ success: false, message: tErrors("internalError") }, { status: 500 })
  }
}
