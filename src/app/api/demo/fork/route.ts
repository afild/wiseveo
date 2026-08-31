import { NextResponse } from "next/server"
import { cookies, headers } from "next/headers"
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth"
import { LOCALE_COOKIE_NAME } from "@/i18n/config"
import { prisma } from "@/lib/prisma"
import { provisionDemoVisitor } from "@/features/demo/services/provision-demo-visitor.service"
import { applyDemoSessionCookies } from "@/features/demo/services/demo-session-cookies"
import { createForkRateLimiter } from "@/lib/fork-rate-limit"
import { isValidLeadEmail, MAX_LEAD_FIELD } from "@/lib/demo-lead"

export const dynamic = "force-dynamic"
// provisionDemoVisitor custa até 55s (ver o contrato no serviço).
export const maxDuration = 60

const allowFork = createForkRateLimiter({ max: 3, windowMs: 10 * 60_000 })

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    // i18n-ignore: guarda interna (rota só existe com demo mode ligado)
    return NextResponse.json({ error: "Demo mode is disabled" }, { status: 403 })
  }
  const token = (await cookies()).get(COOKIE_NAME)?.value
  const session = token ? await verifySessionToken(token) : null
  if (!session) {
    // i18n-ignore: máquina-a-máquina; o cliente trata pelo status
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!session.demoShared) {
    // Já tem cópia própria: idempotente, nada a fazer.
    return NextResponse.json({ ok: true, alreadyForked: true })
  }

  // Sem nome + e-mail válidos, não edita (decisão do dono, 30/08/2026).
  const body = await request.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, MAX_LEAD_FIELD) : ""
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, MAX_LEAD_FIELD) : ""
  if (name.length < 2 || !isValidLeadEmail(email)) {
    // i18n-ignore: o cliente traduz pelo código
    return NextResponse.json({ error: "invalidLead" }, { status: 422 })
  }

  const ip = ((await headers()).get("x-forwarded-for") ?? "?").split(",")[0].trim()
  if (!allowFork(ip, Date.now())) {
    // i18n-ignore: o cliente traduz pelo status 429
    return NextResponse.json({ error: "rateLimited" }, { status: 429 })
  }

  let userId: string
  try {
    ;({ userId } = await provisionDemoVisitor())
  } catch (error) {
    // Contrato do serviço: Error cru é do chamador. Banco fora do ar/cheio:
    // resposta limpa, o cliente mostra o toast genérico.
    console.error("Demo fork provisioning failed:", error)
    // i18n-ignore: máquina-a-máquina
    return NextResponse.json({ error: "internalError" }, { status: 500 })
  }

  // Lead na tabela demo_leads — EXCLUSIVA do banco da demo (prisma/demo/, fora
  // do schema; nunca alcança o app/banco pessoal). Sem FK para users: o lead
  // sobrevive quando a faxina apaga a cópia. Falha aqui não nega a cópia que a
  // pessoa acabou de pedir: registra alto e segue.
  const locale = (await cookies()).get(LOCALE_COOKIE_NAME)?.value ?? null
  try {
    await prisma.$executeRaw`
      INSERT INTO demo_leads (name, email, locale, forked_user_id)
      VALUES (${name}, ${email}, ${locale}, ${userId})`
  } catch (error) {
    console.error("demo_leads insert failed:", error)
  }

  const response = NextResponse.json({ ok: true })
  // Mesma pessoa continuando: freshSession false preserva período/filtros/moeda.
  await applyDemoSessionCookies(response, { userId, demoShared: false, freshSession: false })
  return response
}
