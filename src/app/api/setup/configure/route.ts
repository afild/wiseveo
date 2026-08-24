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
import { COOKIE_NAME, createSessionToken } from "@/lib/auth"
import { deriveSessionKey, futureSessionSource } from "@/lib/auth-secret"
import { applySessionLocaleCookie } from "@/i18n/session-locale"
import { resolveAppLocale } from "@/i18n/config"
import { INSTALL_LOCALE_ENV } from "@/i18n/install-locale"
import { cookies } from "next/headers"
import { canAccessSetup } from "@/lib/setup-access"
import { clearSetupIdentityCookie, decodeSetupIdentity, SETUP_IDENTITY_COOKIE } from "@/lib/setup-identity"
import { redactConnectionUrl } from "@/features/setup/lib/connection-url"
import { encryptSecret, futureSecretsSource } from "@/lib/secret-cipher"
import { aiKeySettingName } from "@/features/ai/services/ai-config.service"
import {
  fetchBotIdentity,
  isValidBotTokenFormat,
  registerTelegramWebhook,
  resolveWebhookBaseUrl,
  TELEGRAM_SETTING_KEYS,
} from "@/features/telegram/services/telegram-config.service"
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
    // Banco com dados: as migrações são puladas e a estrutura fica intocada — o
    // Telegram então NÃO pode ser gravado agora (a tabela `app_settings` só entra
    // pelo "Preparar meu banco", com confirmação). A tela final explica.
    let existingSchema = false
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

      existingSchema = result.skippedExistingSchema === true

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
    // Guardado fora do bloco: é com ele que a sessão do administrador é assinada no fim.
    let adminUserId: string | null = null
    // Telegram no wizard: "connected" quando o token virou configuração cifrada e o
    // webhook foi registrado; "deferred" quando ficou para Configurações → Integrações
    // (banco existente sem `app_settings`, URL sem HTTPS, ou o Telegram recusou).
    let telegramResult: { connected: boolean; deferred: boolean } | undefined
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
      adminUserId = userId

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

      // Telegram "cole só o token": só em banco NOVO (a migração inicial acabou de
      // criar `app_settings`). Falha aqui nunca derruba o setup — vira "conecte
      // depois em Configurações". Cifrado com a chave que valerá após o redeploy
      // (a URL recém-conectada), como a sessão do administrador logo abaixo.
      const botToken = typeof integrations?.telegram?.botToken === "string" ? integrations.telegram.botToken.trim() : ""
      if (integrations?.telegram?.enabled) {
        if (!botToken || existingSchema) {
          // Ligado sem token (ou banco existente): também merece o aviso na tela
          // final — silêncio pareceria "deu certo".
          telegramResult = { connected: false, deferred: true }
        } else {
          telegramResult = await connectTelegramDuringSetup(client, botToken, databaseUrl, req)
        }
      }

      // Chave OpenAI do wizard: em banco NOVO vai CIFRADA para `app_settings`
      // (mesmo cofre do Telegram) — nada de variável no painel. Banco existente
      // segue no caminho antigo (env), pela regra de ouro: estrutura intocada.
      const openaiKey = typeof integrations?.openai?.apiKey === "string" ? integrations.openai.apiKey.trim() : ""
      if (integrations?.openai?.enabled && openaiKey && !existingSchema) {
        try {
          const settingKey = aiKeySettingName("openai")
          const value = encryptSecret(openaiKey, futureSecretsSource(databaseUrl))
          await client.appSetting.upsert({
            where: { key: settingKey },
            create: { key: settingKey, value },
            update: { value },
          })
        } catch (e) {
          console.error("[SETUP] OpenAI key storage skipped:", e instanceof Error ? e.message : String(e))
        }
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

    // 3. Variáveis de ambiente da instalação — o mínimo que a hospedagem precisa
    //    guardar. `AUTH_SECRET` NÃO entra: a chave de sessão é calculada a partir da
    //    própria `DATABASE_URL` (src/lib/auth-secret.ts). O idioma também não: quem
    //    instala leva o cookie `NEXT_LOCALE` desta resposta, e onde há arquivo a env
    //    é gravada de graça (`fileOnlyEnvVars`).
    const envVars: Array<{ key: string; value: string }> = [
      { key: "WISEVEO_SETUP_COMPLETE", value: "true" },
      { key: "DATABASE_URL", value: databaseUrl },
    ]
    const fileOnlyEnvVars: Array<{ key: string; value: string }> = [
      { key: INSTALL_LOCALE_ENV, value: chosenLocale },
    ]
    if (integrations?.google?.enabled) {
      envVars.push({ key: "GOOGLE_CLIENT_ID", value: String(integrations.google.clientId ?? "") })
      envVars.push({ key: "GOOGLE_CLIENT_SECRET", value: String(integrations.google.clientSecret ?? "") })
    }
    // Telegram e OpenAI não entram mais nas variáveis em banco novo: vivem
    // cifrados em `app_settings`, gravados acima. Banco existente (estrutura
    // intocada no setup) ainda recebe a chave OpenAI pelo caminho antigo.
    if (integrations?.openai?.enabled && existingSchema) {
      envVars.push({ key: "OPENAI_API_KEY", value: String(integrations.openai.apiKey ?? "") })
    }

    // 4. Crachá do administrador — assinado com a chave que passará a valer DEPOIS
    //    do reinício/redeploy (a URL do banco recém-conectada). Sem isto a sessão
    //    morreria justamente na virada e a pessoa cairia no login em vez do dashboard.
    const sessionToken = adminUserId
      ? await createSessionToken(adminUserId, await deriveSessionKey(futureSessionSource(databaseUrl)))
      : null

    /** Sessão + idioma escolhido + limpeza do cookie de identidade do primeiro acesso. */
    const finishResponse = (body: Record<string, unknown>) => {
      const response = NextResponse.json(body)
      if (sessionToken) {
        response.cookies.set(COOKIE_NAME, sessionToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 7,
          path: "/",
        })
      }
      applySessionLocaleCookie(response, { locale: chosenLocale })
      clearSetupIdentityCookie(response)
      return response
    }

    if (mode === "manual-env") {
      // Vercel & cia: sem arquivo gravável nem reinício. Devolvemos as duas variáveis
      // para a pessoa colar no painel da hospedagem; o app volta configurado depois do
      // redeploy — e já logado. (Único momento em que a URL do banco volta ao navegador.)
      console.log("[SETUP] Read-only host: returning env vars for manual configuration")
      return finishResponse({
        success: true,
        mode,
        hosting: detectHostingProvider(),
        envVars,
        migrations: migrationsSummary,
        telegram: telegramResult,
      })
    }

    // 4. Self-host: grava .env.local
    console.log("[SETUP] Generating .env.local...")
    let envContent = `\n# --- Gerado automaticamente pelo Setup Wizard ---\n`
    for (const { key, value } of [...envVars, ...fileOnlyEnvVars]) envContent += `${key}="${value}"\n`

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

    // Hospedagem com Passenger (cPanel, Hostinger e afins) reinicia o app sozinha
    // quando `tmp/restart.txt` é tocado — melhor esforço: onde não vale, a tela
    // continua pedindo o reinício e esperando o app voltar.
    if (mode === "restart-required") {
      try {
        const tmpDir = path.resolve(process.cwd(), "tmp")
        fs.mkdirSync(tmpDir, { recursive: true })
        fs.writeFileSync(path.join(tmpDir, "restart.txt"), "")
        console.log("[SETUP] Touched tmp/restart.txt (Passenger-style restart)")
      } catch {
        // Sem permissão ou outro modelo de hospedagem: segue com o reinício manual.
      }
    }

    console.log(`[SETUP] Setup completed successfully (mode=${mode})`)

    // Set a cookie so the login page knows to redirect to settings onboarding
    const response = finishResponse({ success: true, mode, migrations: migrationsSummary, telegram: telegramResult })
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

/**
 * Conecta o bot durante o Finalizar (banco novo): valida o token (getMe), grava o
 * trio cifrado em `app_settings` e registra o webhook. Qualquer tropeço devolve
 * `deferred` — a pessoa conecta depois em Configurações → Integrações, e o setup
 * segue em frente. O token nunca entra em log.
 */
async function connectTelegramDuringSetup(
  client: PrismaClient,
  botToken: string,
  databaseUrl: string,
  req: Request,
): Promise<{ connected: boolean; deferred: boolean }> {
  const deferred = { connected: false, deferred: true }
  try {
    if (!isValidBotTokenFormat(botToken)) return deferred

    const identity = await fetchBotIdentity(botToken)
    if (!identity.ok) return deferred

    const baseUrl = resolveWebhookBaseUrl(req)
    if (!baseUrl || !baseUrl.startsWith("https://")) return deferred

    const cipherSource = futureSecretsSource(databaseUrl)
    const webhookSecret = crypto.randomBytes(32).toString("base64url")
    const entries: Record<string, string> = {
      [TELEGRAM_SETTING_KEYS.botToken]: botToken,
      [TELEGRAM_SETTING_KEYS.botUsername]: identity.botUsername,
      [TELEGRAM_SETTING_KEYS.webhookSecret]: webhookSecret,
    }
    for (const [key, plain] of Object.entries(entries)) {
      const value = encryptSecret(plain, cipherSource)
      await client.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } })
    }

    const registration = await registerTelegramWebhook({ token: botToken, webhookSecret, baseUrl })
    if (!registration.ok) {
      // Nada pela metade: sem webhook, os segredos gravados saem também.
      await client.appSetting
        .deleteMany({ where: { key: { in: Object.keys(entries) } } })
        .catch(() => {})
      console.error("[SETUP] Telegram setWebhook failed:", registration.description)
      return deferred
    }

    console.log("[SETUP] Telegram bot connected")
    return { connected: true, deferred: false }
  } catch (e) {
    console.error("[SETUP] Telegram connection skipped:", e instanceof Error ? e.message : String(e))
    return deferred
  }
}
