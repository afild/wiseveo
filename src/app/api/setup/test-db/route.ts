import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { isSetupComplete } from "@/lib/setup-check"
import { testDatabaseConnection } from "@/features/setup/services/db-connection.service"
import { redactConnectionUrl } from "@/features/setup/lib/connection-url"

export async function POST(req: Request) {
  // Depois da instalação esta rota deixa de existir: sem isso qualquer pessoa
  // poderia usá-la como proxy para conectar em bancos arbitrários.
  if (isSetupComplete()) return new NextResponse(null, { status: 404 })

  const t = await getTranslations("api.setup")
  try {
    const { connectionString } = await req.json()

    if (!connectionString || typeof connectionString !== "string") {
      return NextResponse.json(
        { success: false, code: "connectionStringRequired", message: t("connectionStringRequired") },
        { status: 400 },
      )
    }

    const result = await testDatabaseConnection(connectionString)

    if (!result.ok) {
      const message =
        result.code === "unknown"
          ? t("errors.unknownDetail", { message: redactConnectionUrl(result.detail) })
          : t(`errors.${result.code}`)
      return NextResponse.json({ success: false, code: result.code, message })
    }

    return NextResponse.json({ success: true, hasData: result.hasData, audit: result.audit })
  } catch (error) {
    const detail = error instanceof Error ? error.message : ""
    return NextResponse.json(
      { success: false, code: "unknown", message: t("errors.unknownDetail", { message: redactConnectionUrl(detail) }) },
      { status: 500 },
    )
  }
}
