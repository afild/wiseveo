import { NextResponse } from "next/server"
import { execSync } from "child_process"
import fs from "fs"
import path from "path"
import crypto from "crypto"
import bcrypt from "bcryptjs"
import { getTranslations } from "next-intl/server"
import { PrismaClient } from "@/generated/prisma_new/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { initializeUserData } from "@/lib/user-init"
import { resolveAppLocale } from "@/i18n/config"
import { INSTALL_LOCALE_ENV } from "@/i18n/install-locale"

export async function POST(req: Request) {
  const t = await getTranslations("api.setup")

  try {
    const payload = await req.json()
    const { databaseUrl, useExistingData, admin, locale, integrations } = payload

    if (!databaseUrl || !admin?.email || !admin?.password) {
      return NextResponse.json({ success: false, message: t("missingFields") }, { status: 400 })
    }

    // Idioma escolhido no wizard vira o padrão da instalação (env) e a
    // preferência inicial do admin. Payload não é confiável → valida.
    const chosenLocale = resolveAppLocale(locale)

    // 1. Run migrations via CLI
    try {
      console.log("[SETUP] Running database migrations...")
      execSync("npx prisma migrate deploy", {
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: "pipe",
      })
    } catch (e: any) {
      console.error("[SETUP] Migration error:", e.stdout?.toString(), e.stderr?.toString())
      return NextResponse.json({ success: false, message: t("migrationFailed") }, { status: 500 })
    }

    // 2. Insert admin user and initialize data using a scoped Prisma Client
    console.log("[SETUP] Connecting to database to create admin user...")
    const pool = new Pool({ connectionString: databaseUrl })
    const adapter = new PrismaPg(pool)
    const client = new PrismaClient({ adapter })

    try {
      const hashedPassword = await bcrypt.hash(admin.password, 10)
      const userId = crypto.randomUUID()

      // Create the superadmin user
      await client.user.create({
        data: {
          id: userId,
          name: admin.name,
          email: admin.email,
          passwordHash: hashedPassword,
          role: "SUPERADMIN",
          status: "ACTIVE",
          preferencesJson: { locale: chosenLocale },
        },
      })

      // Initialize the default chart of accounts unless reusing an existing database
      if (!useExistingData) {
        console.log("[SETUP] Initializing default chart of accounts...")
        await initializeUserData(client, userId)
      }
    } catch (e: any) {
      console.error("[SETUP] Error creating user/data:", e)
      return NextResponse.json(
        { success: false, message: t("adminCreationFailed", { message: e.message }) },
        { status: 500 },
      )
    } finally {
      await client.$disconnect()
      await pool.end()
    }

    // 3. Prepare ENV content
    console.log("[SETUP] Generating .env.local...")
    const authSecret = crypto.randomBytes(32).toString("base64")
    
    let envContent = `\n# --- Gerado automaticamente pelo Setup Wizard ---\n`
    envContent += `WISEVEO_SETUP_COMPLETE="true"\n`
    envContent += `${INSTALL_LOCALE_ENV}="${chosenLocale}"\n`
    envContent += `DATABASE_URL="${databaseUrl}"\n`
    envContent += `AUTH_SECRET="${authSecret}"\n`
    
    if (integrations?.google?.enabled) {
      envContent += `GOOGLE_CLIENT_ID="${integrations.google.clientId}"\n`
      envContent += `GOOGLE_CLIENT_SECRET="${integrations.google.clientSecret}"\n`
    }
    
    if (integrations?.telegram?.enabled) {
      envContent += `TELEGRAM_BOT_TOKEN="${integrations.telegram.botToken}"\n`
      envContent += `TELEGRAM_BOT_USERNAME="${integrations.telegram.botUsername}"\n`
      envContent += `TELEGRAM_WEBHOOK_SECRET="${integrations.telegram.webhookSecret}"\n`
    }

    if (integrations?.openai?.enabled) {
      envContent += `OPENAI_API_KEY="${integrations.openai.apiKey}"\n`
    }

    // Write to .env.local
    const envPath = path.resolve(process.cwd(), ".env.local")
    
    // Check if file exists to append or create new
    if (fs.existsSync(envPath)) {
      fs.appendFileSync(envPath, envContent)
    } else {
      fs.writeFileSync(envPath, envContent)
    }

    console.log("[SETUP] Setup completed successfully!")

    // Set a cookie so the login page knows to redirect to settings onboarding
    const response = NextResponse.json({ success: true })
    response.cookies.set("wiseveo-new-setup", "true", {
      path: "/",
      maxAge: 60 * 60, // 1 hour
    })
    
    return response
  } catch (error: any) {
    console.error("[SETUP] Fatal error:", error)
    return NextResponse.json(
      { success: false, message: error.message || t("unknownError") },
      { status: 500 }
    )
  }
}
