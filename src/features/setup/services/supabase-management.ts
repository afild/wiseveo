/**
 * Cliente fino da Supabase Management API (https://api.supabase.com/v1) para o
 * Setup Wizard "criar/conectar meu banco". O token pessoal (`sbp_…`) chega no
 * header da requisição do navegador, vive só no escopo da chamada e NUNCA é
 * persistido nem logado. Erros viram códigos estáveis (as rotas traduzem).
 *
 * Endpoints (spec OpenAPI oficial, 2026-08): GET /organizations, GET/POST
 * /projects, GET /projects/available-regions, GET /projects/{ref},
 * PATCH /projects/{ref}/database/password, GET /projects/{ref}/config/database/pooler.
 */

export const SUPABASE_API_BASE = "https://api.supabase.com/v1"

export type SupabaseManagementErrorCode =
  | "invalidToken"
  | "forbidden"
  | "rateLimited"
  | "projectLimit"
  | "providerError"

export class SupabaseManagementError extends Error {
  constructor(
    public readonly code: SupabaseManagementErrorCode,
    public readonly status: number,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = "SupabaseManagementError"
  }
}

export interface SupabaseOrganization {
  slug: string
  name: string
}

export type SupabaseProjectStatus =
  | "INACTIVE"
  | "ACTIVE_HEALTHY"
  | "ACTIVE_UNHEALTHY"
  | "COMING_UP"
  | "UNKNOWN"
  | "GOING_DOWN"
  | "INIT_FAILED"
  | "REMOVED"
  | "RESTORING"
  | "UPGRADING"
  | "PAUSING"
  | "RESTORE_FAILED"
  | "RESTARTING"
  | "PAUSE_FAILED"
  | "RESIZING"
  | (string & {})

export interface SupabaseProject {
  ref: string
  name: string
  region: string
  status: SupabaseProjectStatus
  organizationSlug: string
}

export type SupabaseRegionSelection =
  | { type: "specific"; code: string }
  | { type: "smartGroup"; code: string }

export interface SupabaseRegionOption {
  type: "specific" | "smartGroup"
  code: string
  name: string
}

export interface SupabaseAvailableRegions {
  recommended: SupabaseRegionOption | null
  options: SupabaseRegionOption[]
}

export interface SupabasePoolerConfig {
  dbUser: string
  dbHost: string
  dbPort: number
  dbName: string
  poolMode: "transaction" | "session" | string
}

export interface CreateProjectInput {
  organizationSlug: string
  name: string
  dbPassword: string
  regionSelection: SupabaseRegionSelection
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export function createSupabaseManagementClient(token: string, fetchImpl: FetchLike = fetch) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetchImpl(`${SUPABASE_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    })

    if (!res.ok) throw await toError(res)
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  return {
    async listOrganizations(): Promise<SupabaseOrganization[]> {
      const rows = await request<Array<{ slug: string; name: string }>>("/organizations")
      return rows.map((o) => ({ slug: o.slug, name: o.name }))
    },

    async listProjects(): Promise<SupabaseProject[]> {
      const rows = await request<
        Array<{ ref: string; name: string; region: string; status: string; organization_slug: string }>
      >("/projects")
      return rows.map((p) => ({
        ref: p.ref,
        name: p.name,
        region: p.region,
        status: p.status,
        organizationSlug: p.organization_slug,
      }))
    },

    async getAvailableRegions(): Promise<SupabaseAvailableRegions> {
      const data = await request<{
        recommendations?: {
          smartGroup?: { name: string; code: string; type?: string }
          specific?: Array<{ name: string; code: string; type?: string }>
        }
      }>("/projects/available-regions")
      const smart = data.recommendations?.smartGroup
      const recommended: SupabaseRegionOption | null = smart
        ? { type: "smartGroup", code: smart.code, name: smart.name }
        : null
      const specific: SupabaseRegionOption[] = (data.recommendations?.specific ?? []).map((r) => ({
        type: "specific",
        code: r.code,
        name: r.name,
      }))
      return { recommended, options: recommended ? [recommended, ...specific] : specific }
    },

    async createProject(input: CreateProjectInput): Promise<{ ref: string; status: string }> {
      const data = await request<{ ref: string; status: string }>("/projects", {
        method: "POST",
        body: JSON.stringify({
          name: input.name,
          organization_slug: input.organizationSlug,
          db_pass: input.dbPassword,
          region_selection: input.regionSelection,
        }),
      })
      return { ref: data.ref, status: data.status }
    },

    async getProject(ref: string): Promise<SupabaseProject> {
      const p = await request<{
        ref: string
        name: string
        region: string
        status: string
        organization_slug: string
      }>(`/projects/${encodeURIComponent(ref)}`)
      return { ref: p.ref, name: p.name, region: p.region, status: p.status, organizationSlug: p.organization_slug }
    },

    async updateDatabasePassword(ref: string, password: string): Promise<void> {
      await request<{ message: string }>(`/projects/${encodeURIComponent(ref)}/database/password`, {
        method: "PATCH",
        body: JSON.stringify({ password }),
      })
    },

    /** Config do pooler (Supavisor) do banco PRIMÁRIO; preferência por transaction mode. */
    async getPoolerConfig(ref: string): Promise<SupabasePoolerConfig> {
      const rows = await request<
        Array<{
          database_type: string
          db_user: string
          db_host: string
          db_port: number
          db_name: string
          pool_mode: string
        }>
      >(`/projects/${encodeURIComponent(ref)}/config/database/pooler`)
      const primary = rows.filter((r) => r.database_type === "PRIMARY")
      const chosen = primary.find((r) => r.pool_mode === "transaction") ?? primary[0] ?? rows[0]
      if (!chosen) throw new SupabaseManagementError("providerError", 200, "pooler config empty")
      return {
        dbUser: chosen.db_user,
        dbHost: chosen.db_host,
        dbPort: chosen.db_port,
        dbName: chosen.db_name,
        poolMode: chosen.pool_mode,
      }
    },
  }
}

export type SupabaseManagementClient = ReturnType<typeof createSupabaseManagementClient>

async function toError(res: Response): Promise<SupabaseManagementError> {
  let detail = ""
  try {
    const body = (await res.json()) as { message?: string; error?: string }
    detail = String(body.message ?? body.error ?? "")
  } catch {
    // corpo não-JSON: segue sem detalhe
  }
  const lower = detail.toLowerCase()
  const looksLikeLimit = /limit|quota|exceed|maximum|free plan|free tier/.test(lower)

  if (res.status === 401) return new SupabaseManagementError("invalidToken", 401)
  if (res.status === 402) return new SupabaseManagementError("projectLimit", 402, detail)
  if (res.status === 403) return new SupabaseManagementError(looksLikeLimit ? "projectLimit" : "forbidden", 403, detail)
  if (res.status === 429) return new SupabaseManagementError("rateLimited", 429)
  if (looksLikeLimit) return new SupabaseManagementError("projectLimit", res.status, detail)
  return new SupabaseManagementError("providerError", res.status, detail.slice(0, 200))
}
