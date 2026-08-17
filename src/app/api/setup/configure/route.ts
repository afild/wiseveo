import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import crypto from "crypto"
import bcrypt from "bcryptjs"
import { getTranslations } from "next-intl/server"
import { PrismaClient } from "@/generated/prisma_new/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Client, Pool } from "pg"
import { initializeUserData } from "@/lib/user-init"
import { resolveAppLocale } from "@/i18n/config"
import { INSTALL_LOCALE_ENV } from "@/i18n/install-locale"
import { isSetupComplete } from "@/lib/setup-check"
import { redactConnectionUrl } from "@/features/setup/lib/connection-url"
import { applyPrismaMigrations, loadMigrationFiles } from "@/features/setup/services/prisma-migrations.service"
import { detectHostingProvider, detectSetupPersistence } from "@/features/setup/services/setup-environment"

// Nada que saia daqui em log pode conter a senha do banco.
const redact = (value: unknown) => redactConnectionUrl(String(value ?? ""))

/** Aplicar migrações + criar admin pode passar de 1 min em bancos remotos. */
export const maxDuration = 300

export async function POST(req: Request) {
  // Instalação concluída → o wizard (e esta rota) não existem mais. Sem isso,
  // qualquer pessoa poderia recriar um SUPERADMIN e reescrever o .env.local.
  if (isSetupComplete()) return new NextResponse(null, { status: 404 })

  const t = await getTranslations("api.setup")

  try {
    const payload = await req.json()
    const { databaseUrl, useExistingData, admin, locale, integrations } = payload

    if (!databaseUrl || typeof databaseUrl !== "string" || !admin?.email || !admin?.password) {
      return NextResponse.json({ success: false, message: t("missingFields") }, { status: 400 })
    }

    // Idioma escolhido no wizard vira o padrão da instalação (env) e a
    // preferência inicial do admin. Payload não é confiável → valida.
    const chosenLocale = resolveAppLocale(locale)
    const mode = detectSetupPersistence()

    // 1. Migrações — direto pelo pg, sem `npx prisma` (o CLI não existe em produção
    //    nem na Vercel; era isso que deixava o botão em "Configurando…" para sempre).
    console.log(`[SETUP] Applying database migrations (mode=${mode})...`)
    const migrationClient = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10000 })
    let migrationsSummary: { applied: number; alreadyApplied: number }
    try {
      await migrationClient.connect()
      const result = await applyPrismaMigrations(migrationClient, loadMigrationFiles())
      if (!result.ok) {
        console.error(`[SETUP] Migration ${result.migration} failed:`, redact(result.detail))
        return NextResponse.json(
          {
            success: false,
            code: result.code,
            message: t("errors.migrationFailed", { migration: result.migration, message: redact(result.detail) }),
          },
          { status: 500 },
        )
      }
      migrationsSummary = { applied: result.applied.length, alreadyApplied: result.alreadyApplied }
      console.log(
        result.skippedExistingSchema
          ? "[SETUP] Existing WISEVEO schema detected: migrations skipped"
          : `[SETUP] Migrations: ${result.applied.length} applied, ${result.alreadyApplied} already there`,
      )
    } catch (e: any) {
      console.error("[SETUP] Migration connection error:", redact(e?.message ?? e))
      return NextResponse.json({ success: false, message: t("migrationFailed") }, { status: 500 })
    } finally {
      await migrationClient.end().catch(() => {})
    }

    // 2. Admin (SUPERADMIN) — em banco reaproveitado o e-mail pode já existir:
    //    quem roda o wizard controla o servidor, então promovemos e trocamos a senha.
    console.log("[SETUP] Connecting to database to create admin user...")
    const pool = new Pool({ connectionString: databaseUrl })
    const adapter = new PrismaPg(pool)
    const client = new PrismaClient({ adapter })

    try {
      const hashedPassword = await bcrypt.hash(admin.password, 10)
      const email = String(admin.email).trim().toLowerCase()
      const existing = await client.user.findUnique({ where: { email }, select: { id: true } })
      const userId = existing?.id ?? crypto.randomUUID()

      await client.user.upsert({
        where: { email },
        create: {
          id: userId,
          name: admin.name,
          email,
          passwordHash: hashedPassword,
          role: "SUPERADMIN",
          status: "ACTIVE",
          preferencesJson: { locale: chosenLocale },
        },
        update: {
          name: admin.name || undefined,
          passwordHash: hashedPassword,
          role: "SUPERADMIN",
          status: "ACTIVE",
        },
      })

      // Initialize the default chart of accounts unless reusing an existing database
      if (!useExistingData && !existing) {
        console.log("[SETUP] Initializing default chart of accounts...")
        await initializeUserData(client, userId)
      }
    } catch (e: any) {
      console.error("[SETUP] Error creating user/data:", redact(e?.message ?? e))
      return NextResponse.json(
        { success: false, message: t("adminCreationFailed", { message: redact(e?.message) }) },
        { status: 500 },
      )
    } finally {
      await client.$disconnect()
      await pool.end()
    }

    // 3. Variáveis de ambiente da instalação
    const authSecret = crypto.randomBytes(32).toString("base64")
    const envVars: Array<{ key: string; value: string }> = [
      { key: "WISEVEO_SETUP_COMPLETE", value: "true" },
      { key: INSTALL_LOCALE_ENV, value: chosenLocale },
      { key: "DATABASE_URL", value: databaseUrl },
      { key: "AUTH_SECRET", value: authSecret },
    ]
    if (integrations?.google?.enabled) {
      envVars.push({ key: "GOOGLE_CLIENT_ID", value: String(integrations.google.clientId ?? "") })
      envVars.push({ key: "GOOGLE_CLIENT_SECRET", value: String(integrations.google.clientSecret ?? "") })
    }
    if (integrations?.telegram?.enabled) {
      envVars.push({ key: "TELEGRAM_BOT_TOKEN", value: String(integrations.telegram.botToken ?? "") })
      envVars.push({ key: "TELEGRAM_BOT_USERNAME", value: String(integrations.telegram.botUsername ?? "") })
      envVars.push({ key: "TELEGRAM_WEBHOOK_SECRET", value: String(integrations.telegram.webhookSecret ?? "") })
    }
    if (integrations?.openai?.enabled) {
      envVars.push({ key: "OPENAI_API_KEY", value: String(integrations.openai.apiKey ?? "") })
    }

    if (mode === "manual-env") {
      // Vercel & cia: sem arquivo gravável nem reinício. Devolvemos as variáveis
      // para a pessoa colar no painel da hospedagem; o app volta configurado
      // depois do redeploy. (Único momento em que os segredos voltam ao navegador.)
      console.log("[SETUP] Read-only host: returning env vars for manual configuration")
      return NextResponse.json({
        success: true,
        mode,
        hosting: detectHostingProvider(),
        envVars,
        migrations: migrationsSummary,
      })
    }

    // 4. Self-host: grava .env.local
    console.log("[SETUP] Generating .env.local...")
    let envContent = `\n# --- Gerado automaticamente pelo Setup Wizard ---\n`
    for (const { key, value } of envVars) envContent += `${key}="${value}"\n`

    const envPath = path.resolve(process.cwd(), ".env.local")
    if (fs.existsSync(envPath)) {
      fs.appendFileSync(envPath, envContent)
    } else {
      fs.writeFileSync(envPath, envContent, { mode: 0o600 })
    }
    // Só o dono do processo lê o arquivo com os segredos (no-op no Windows).
    try {
      fs.chmodSync(envPath, 0o600)
    } catch {
      // Sistemas de arquivos sem permissões POSIX: segue sem bloquear a instalação.
    }

    console.log(`[SETUP] Setup completed successfully (mode=${mode})`)

    // Set a cookie so the login page knows to redirect to settings onboarding
    const response = NextResponse.json({ success: true, mode, migrations: migrationsSummary })
    response.cookies.set("wiseveo-new-setup", "true", {
      path: "/",
      maxAge: 60 * 60, // 1 hour
    })

    return response
  } catch (error: any) {
    console.error("[SETUP] Fatal error:", redact(error?.message ?? error))
    return NextResponse.json(
      { success: false, message: redact(error?.message) || t("unknownError") },
      { status: 500 }
    )
  }
}
