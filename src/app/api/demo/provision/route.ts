import { NextResponse } from "next/server"
import crypto from "crypto"
import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import { initializeUserData } from "@/lib/user-init"
import { createSessionToken, COOKIE_NAME } from "@/lib/auth"
import { getDemoDataset } from "@/lib/demo-data/generate-demo-dataset"
import { materializeDataset } from "@/lib/demo-data/materialize"
import { DEMO_DEFAULT_LOCALE, LOCALE_COOKIE_NAME } from "@/i18n/config"
import { FRESH_SESSION_COOKIE } from "@/lib/client-session-reset"

export const dynamic = 'force-dynamic'
// Increase max duration for provisioning (Vercel Hobby allows up to 60s on API routes)
export const maxDuration = 60

export async function GET(request: Request) {
  const t = await getTranslations("api.errors")

  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    // i18n-ignore: guarda interna (rota só existe com demo mode ligado), nunca chega a um usuário real
    return NextResponse.json({ error: "Demo mode is disabled" }, { status: 403 })
  }

  try {
    const demoId = crypto.randomUUID()
    // Short prefix: 8 hex chars from the UUID (without hyphens)
    const userPrefix = demoId.replace(/-/g, "").slice(0, 8)
    const userId = `demo_${demoId}`

    // All provisioning in a single Prisma transaction for atomicity and performance
    await prisma.$transaction(async (tx) => {
      // 1. Create phantom user
      await tx.user.create({
        data: {
          id: userId,
          name: "Demo Visitor", // i18n-ignore: nome padrão do usuário demo provisionado automaticamente — dado semente, não copy de UI
          email: `${userId}@wiseveo.demo`,
          status: "ACTIVE",
          role: "USER",
          // Demo nasce em inglês (mesmo valor gravado no cookie abaixo, para getUserLocale concordar)
          preferencesJson: { locale: DEMO_DEFAULT_LOCALE },
        },
      })

      // 2. Initialize Chart of Accounts — isolated codes per phantom user
      const accountIds = await initializeUserData(tx, userId, userPrefix)
      const checkingAccountId = accountIds["CHECKING"]

      if (!checkingAccountId) {
        // i18n-ignore: mensagem interna de Error, só logada (console.error), nunca exibida ao usuário
        throw new Error("Failed to resolve checking account ID for demo user")
      }

      // 3. Recuperar os grupos recém-criados e reconstruir o offset do phantom.
      //    user-init.ts monta `phantomCode = 1_000_000 + slotOffset + originalCode`, com
      //    slotOffset arbitrário (derivado do prefixo). NÃO dá para usar `code % 1000`:
      //    isso só devolveria o originalCode quando slotOffset fosse múltiplo de 1000.
      //    Como o conjunto é sempre base+100 … base+900, o offset é `min(code) - 100`.
      const groups: Array<{ id: string; code: number }> = await tx.categoryGroup.findMany({
        where: { userId },
        select: { id: true, code: true },
      })
      const groupCodeOffset = Math.min(...groups.map((g) => g.code)) - 100
      const groupUuidByCode: Record<number, string> = {}
      for (const g of groups) groupUuidByCode[g.code - groupCodeOffset] = g.id

      const expectedGroupCodes = [100, 200, 300, 400, 500, 600, 700, 800, 900]
      if (
        groups.length !== expectedGroupCodes.length ||
        expectedGroupCodes.some((code) => !groupUuidByCode[code])
      ) {
        // i18n-ignore: mensagem interna de Error, só logada (console.error), nunca exibida ao usuário
        throw new Error("Demo provisioning: unexpected category group set for phantom user")
      }

      // 4. Reservar um bloco de ids de payee (Payee.id é Int global, sem autoincrement).
      //    O lock precisa acontecer DENTRO desta transação para o MAX+1 ser seguro
      //    contra provisionamentos concorrentes.
      // i18n-ignore: string SQL bruta, não é texto de UI
      await tx.$executeRaw`LOCK TABLE payees IN EXCLUSIVE MODE`
      const maxPayee = await tx.payee.aggregate({ _max: { id: true } })
      const payeeIdBase = (maxPayee._max.id ?? 0) + 1

      // 5. Materializar o dataset determinístico no namespace deste usuário
      const rows = materializeDataset(getDemoDataset(), {
        userId,
        prefix: userPrefix,
        accountIds,
        groupUuidByCode,
        groupCodeOffset,
        payeeIdBase,
        now: new Date(),
      })

      // 6. Bulk insert — ordem respeita as FKs (payees antes de transactions/recurring)
      await tx.payee.createMany({ data: rows.payees })
      await tx.transaction.createMany({ data: rows.transactions })
      await tx.recurringTransaction.createMany({ data: rows.recurring })
      await tx.budget.createMany({ data: rows.budgets })

      // 7. Saldos iniciais das contas
      for (const [accountId, balance] of Object.entries(rows.accountBalances)) {
        if (balance !== 0) {
          await tx.account.update({ where: { id: Number(accountId) }, data: { balance } })
        }
      }
    }, {
      timeout: 55_000, // 55s (below Vercel's 60s maxDuration)
    })

    // 8. Create session token (outside DB transaction)
    const token = await createSessionToken(userId)

    // 9. Redirect to dashboard with session cookie
    const url = new URL("/dashboard", request.url)
    const response = NextResponse.redirect(url)

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 hours (aligned with daily cron cleanup)
      path: "/",
    })

    // 10. Todo demo novo nasce em inglês — sobrescreve qualquer cookie de idioma que o
    //     navegador já tivesse. NÃO httpOnly: o LocaleMenu regrava este cookie via
    //     document.cookie (mesmos atributos de applyUserLocale); httpOnly criaria um
    //     cookie duplicado e o seletor de idioma pareceria quebrado.
    response.cookies.set(LOCALE_COOKIE_NAME, DEMO_DEFAULT_LOCALE, {
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    })

    // 11. Marcador de "sessão nova" (legível por JS): o cliente o consome no primeiro
    //     mount e limpa períodos/filtros herdados do visitante anterior no mesmo
    //     navegador (ver src/lib/client-session-reset.ts). Mesma vida da sessão para
    //     não expirar antes de ser consumido (aba suspensa antes de hidratar etc.).
    response.cookies.set(FRESH_SESSION_COOKIE, "1", {
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
      path: "/",
    })

    return response
  } catch (error) {
    console.error("Error provisioning demo user:", error)
    return NextResponse.json({ error: t("internalError") }, { status: 500 })
  }
}
