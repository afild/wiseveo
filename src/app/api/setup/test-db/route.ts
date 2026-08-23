import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import { getSessionUserId } from "@/lib/session"
import { canAccessSetup } from "@/lib/setup-access"
import { decodeSetupIdentity, SETUP_IDENTITY_COOKIE } from "@/lib/setup-identity"
import { testDatabaseConnection } from "@/features/setup/services/db-connection.service"
import { redactConnectionUrl } from "@/features/setup/lib/connection-url"

/**
 * E-mail de quem está instalando — o mesmo que o Finalizar usa para gravar o
 * administrador: primeiro acesso vem do cookie de identidade (Google/cadastro);
 * reconfigurando, do SUPERADMIN logado. Nunca do payload (não é confiável).
 */
async function resolveAdminEmail(): Promise<string | null> {
  const cookieStore = await cookies()
  const identity = await decodeSetupIdentity(cookieStore.get(SETUP_IDENTITY_COOKIE)?.value)
  if (identity) return identity.email
  try {
    const userId = await getSessionUserId()
    if (!userId) return null
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
    return user?.email ?? null
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  // Depois da instalação só o SUPERADMIN logado (Reconfigurar) usa esta rota: sem
  // isso qualquer pessoa poderia usá-la como proxy para conectar em bancos arbitrários.
  if (!(await canAccessSetup())) return new NextResponse(null, { status: 404 })

  const t = await getTranslations("api.setup")
  try {
    const { connectionString } = await req.json()

    if (!connectionString || typeof connectionString !== "string") {
      return NextResponse.json(
        { success: false, code: "connectionStringRequired", message: t("connectionStringRequired") },
        { status: 400 },
      )
    }

    const result = await testDatabaseConnection(connectionString, { adminEmail: await resolveAdminEmail() })

    if (!result.ok) {
      const message =
        result.code === "unknown"
          ? t("errors.unknownDetail", { message: redactConnectionUrl(result.detail) })
          : t(`errors.${result.code}`)
      return NextResponse.json({ success: false, code: result.code, message })
    }

    return NextResponse.json({
      success: true,
      hasData: result.hasData,
      lookupEmail: result.lookupEmail,
      owner: result.owner,
      knownEmails: result.knownEmails,
      audit: result.audit,
      schemaCheck: result.schemaCheck,
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : ""
    return NextResponse.json(
      { success: false, code: "unknown", message: t("errors.unknownDetail", { message: redactConnectionUrl(detail) }) },
      { status: 500 },
    )
  }
}
