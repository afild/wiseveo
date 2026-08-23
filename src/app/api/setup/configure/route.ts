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
import { cookies } from "next/headers"
import { canAccessSetup } from "@/lib/setup-access"
import { clearSetupIdentityCookie, decodeSetupIdentity, SETUP_IDENTITY_COOKIE } from "@/lib/setup-identity"
import { redactConnectionUrl } from "@/features/setup/lib/connection-url"
import { applyPrismaMigrations, loadMigrationFiles } from "@/features/setup/services/prisma-migrations.service"
import { detectHostingProvider, detectSetupPersistence } from "@/features/setup/services/setup-environment"
import { checkUsersSchema } from "@/features/setup/lib/schema-check"
import { readUsersColumns } from "@/features/setup/services/db-connection.service"

// Nada que saia daqui em log pode conter a senha do banco.
const redact = (value: unknown) => redactConnectionUrl(String(value ?? ""))

/** Aplicar migrações + criar admin pode passar de 1 min em bancos remotos. */
export const maxDuration = 300

export async function POST(req: Request) {
  // Instalação concluída → só o SUPERADMIN logado (Reconfigurar) chega aqui. Sem
  // isso, qualquer pessoa poderia recriar um SUPERADMIN e reescrever o .env.local.
  if (!(await canAccessSetup())) return new NextResponse(null, { status: 404 })

  const t = await getTranslations("api.setup")

  try {
    const payload = await req.json()
    const { databaseUrl, useExistingData, admin, locale, integrations } = payload

    // Primeiro acesso: a conta do administrador veio da página de cadastro
    // (cookie assinado) — nome, e-mail e senha/Google saem DELE, não do payload.
    // Reconfiguração (SUPERADMIN logado): sem cookie, vale o payload como antes.
    const cookieStore = await cookies()
    const identity = await decodeSetupIdentity(cookieStore.get(SETUP_IDENTITY_COOKIE)?.value)

    const adminInput = identity
      ? { name: identity.name, email: identity.email }
      : { name: String(admin?.name ?? ""), email: String(admin?.email ?? "") }
    const adminPassword: string | null = identity ? null : typeof admin?.password === "string" ? admin.password : null

    if (!databaseUrl || typeof databaseUrl !== "string" || !adminInput.email || (!identity && !adminPassword)) {
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

      if (result.skippedExistingSchema) {
        // Banco com dados: ou ele na íntegra, ou nada. O modelo padrão renomearia e
        // reatribuiria o que colidir com os códigos compartilhados — recusado aqui,
        // não só na tela. Nada foi gravado até este ponto.
        if (useExistingData !== true) {
          return NextResponse.json(
            {
              success: false,
              code: "templateNotAllowedOnExistingData",
              message: t("errors.templateNotAllowedOnExistingData"),
            },
            { status: 400 },
          )
        }
        // Estrutura: o upsert do admin e o login leem `users` inteira; coluna faltando
        // (ex.: google_id) quebraria o primeiro acesso depois de "concluído".
        let columns: string[]
        try {
          columns = await readUsersColumns(migrationClient)
        } catch (e: unknown) {
          const detail = e instanceof Error ? e.message : String(e)
          console.error("[SETUP] Users schema check failed:", redact(detail))
          return NextResponse.json(
            { success: false, code: "unknown", message: t("errors.unknownDetail", { message: redact(detail) }) },
            { status: 500 },
          )
        }
        const schema = checkUsersSchema(columns)
        if (!schema.ok) {
          return NextResponse.json(
            {
              success: false,
              code: "schemaIncompatible",
              message: t("errors.schemaIncompatible", { columns: schema.missingColumns.join(", ") }),
            },
            { status: 400 },
          )
        }
      }
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
      // Senha: do cadastro (já em hash) ou do payload (reconfiguração); Google: sem senha, com googleId.
      const passwordHash =
        identity?.provider === "password"
          ? (identity.passwordHash as string)
          : adminPassword
            ? await bcrypt.hash(adminPassword, 10)
            : null
      const googleId = identity?.provider === "google" ? identity.googleId : undefined
      const photo = identity?.photo ?? undefined
      const email = adminInput.email.trim().toLowerCase()
      const name = adminInput.name.trim() || email
      const existing = await client.user.findUnique({ where: { email }, select: { id: true } })
      const userId = existing?.id ?? crypto.randomUUID()

      await client.user.upsert({
        where: { email },
        create: {
          id: userId,
          name,
          email,
          passwordHash,
          googleId,
          photo,
          role: "SUPERADMIN",
          status: "ACTIVE",
          preferencesJson: { locale: chosenLocale },
        },
        update: {
          name,
          ...(passwordHash ? { passwordHash } : {}),
          ...(googleId ? { googleId } : {}),
          ...(photo ? { photo } : {}),
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
      const response = NextResponse.json({
        success: true,
        mode,
        hosting: detectHostingProvider(),
        envVars,
        migrations: migrationsSummary,
      })
      clearSetupIdentityCookie(response)
      return response
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
    clearSetupIdentityCookie(response)

    return response
  } catch (error: any) {
    console.error("[SETUP] Fatal error:", redact(error?.message ?? error))
    return NextResponse.json(
      { success: false, message: redact(error?.message) || t("unknownError") },
      { status: 500 }
    )
  }
}
