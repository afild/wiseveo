import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { isSetupComplete } from "@/lib/setup-check"
import {
  createSupabaseManagementClient,
  SupabaseManagementError,
  type SupabaseManagementErrorCode,
  type SupabaseRegionSelection,
} from "@/features/setup/services/supabase-management"

type SetupErrorCode = SupabaseManagementErrorCode | "tokenRequired"

/**
 * Ponte do wizard para a Supabase Management API. Sem estado: cada chamada
 * traz o token pessoal no header Authorization (navegador → este servidor →
 * api.supabase.com); nada é gravado nem logado. Só existe enquanto o setup
 * não foi concluído.
 */

const PROJECT_REF = /^[a-z]{20}$/
const ORG_SLUG = /^[\w-]{1,64}$/
const REGION_CODE = /^[a-z0-9-]{2,32}$/
/** Senha gerada pelo wizard: URL-safe, entre 16 e 64 caracteres. */
const GENERATED_PASSWORD = /^[A-Za-z0-9_-]{16,64}$/

type Action = "inspect" | "create-project" | "project-status" | "reset-password" | "pooler"

export async function POST(req: Request) {
  if (isSetupComplete()) return new NextResponse(null, { status: 404 })

  const t = await getTranslations("api.setup")
  const fail = (code: SetupErrorCode, status = 400) =>
    NextResponse.json({ success: false, code, message: t(`errors.${code}`) }, { status })

  const token = extractBearer(req.headers.get("authorization"))
  if (!token) return fail("tokenRequired")

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return fail("providerError")
  }

  const action = body.action as Action
  const client = createSupabaseManagementClient(token)

  try {
    switch (action) {
      case "inspect": {
        const [organizations, projects, regions] = await Promise.all([
          client.listOrganizations(),
          client.listProjects(),
          client.getAvailableRegions().catch(() => ({ recommended: null, options: [] })),
        ])
        return NextResponse.json({ success: true, organizations, projects, regions })
      }

      case "create-project": {
        const organizationSlug = String(body.organizationSlug ?? "")
        const name = String(body.name ?? "wiseveo").trim().slice(0, 64) || "wiseveo"
        const dbPassword = String(body.dbPassword ?? "")
        const regionSelection = parseRegionSelection(body.regionSelection)
        if (!ORG_SLUG.test(organizationSlug) || !GENERATED_PASSWORD.test(dbPassword) || !regionSelection) {
          return fail("providerError")
        }
        const created = await client.createProject({ organizationSlug, name, dbPassword, regionSelection })
        return NextResponse.json({ success: true, ref: created.ref, status: created.status })
      }

      case "project-status": {
        const ref = String(body.ref ?? "")
        if (!PROJECT_REF.test(ref)) return fail("providerError")
        const project = await client.getProject(ref)
        return NextResponse.json({ success: true, status: project.status })
      }

      case "reset-password": {
        const ref = String(body.ref ?? "")
        const password = String(body.password ?? "")
        if (!PROJECT_REF.test(ref) || !GENERATED_PASSWORD.test(password)) return fail("providerError")
        await client.updateDatabasePassword(ref, password)
        return NextResponse.json({ success: true })
      }

      case "pooler": {
        const ref = String(body.ref ?? "")
        if (!PROJECT_REF.test(ref)) return fail("providerError")
        const pooler = await client.getPoolerConfig(ref)
        return NextResponse.json({ success: true, pooler })
      }

      default:
        return fail("providerError")
    }
  } catch (error) {
    if (error instanceof SupabaseManagementError) {
      const status = error.code === "invalidToken" ? 401 : error.code === "rateLimited" ? 429 : 502
      // Nunca logar o token; o detalhe já vem sem segredos (mensagem da API).
      console.error(`[SETUP][supabase:${action}] ${error.code} (${error.status})`)
      return fail(error.code, status)
    }
    console.error(`[SETUP][supabase:${action}] unexpected`, error instanceof Error ? error.message : "")
    return fail("providerError", 502)
  }
}

function extractBearer(header: string | null): string | null {
  if (!header) return null
  const match = header.match(/^Bearer\s+(\S+)$/i)
  const token = match?.[1]?.trim() ?? ""
  return token.length >= 8 && token.length <= 512 ? token : null
}

function parseRegionSelection(value: unknown): SupabaseRegionSelection | null {
  if (!value || typeof value !== "object") return null
  const { type, code } = value as { type?: unknown; code?: unknown }
  if ((type !== "specific" && type !== "smartGroup") || typeof code !== "string" || !REGION_CODE.test(code)) {
    return null
  }
  return { type, code }
}
