import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = 'force-dynamic'
// Cada phantom agora arrasta ~2.650 linhas em cascata (eram ~350 antes do dataset
// realista). Sem um teto de duração explícito, uma execução longa é cortada no meio
// e — como cada delete é try/catch — o corte passa despercebido: o cron "sucede"
// tendo apagado menos usuários do que o dia criou, e a base cresce sem parar.
export const maxDuration = 60

export async function GET(request: Request) {
  // Guard: only run in demo environment — no-op in the real app project
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    // i18n-ignore: endpoint de cron interno (Vercel Cron), resposta nunca é renderizada em UI
    return NextResponse.json({ skipped: true, reason: "Demo mode is disabled" }, { status: 200 })
  }

  // Security: Vercel Cron sends Authorization header with CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Delete phantom users created more than 25 hours ago.
    // Window is 25h to ensure users are cleaned up on the daily cron cycle
    // (Vercel Hobby only allows daily cron jobs).
    // Safety double-guard: email MUST start with "demo_" — never touches real users.
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000)

    // Individual delete + try/catch per user (not a single deleteMany): one user
    // whose delete fails (e.g. FK Restrict on a shared lookup row) must never
    // abort the whole batch — that bug is why the cron never deleted anything.
    const stale = await prisma.user.findMany({
      where: {
        email: {
          startsWith: 'demo_'
        },
        createdAt: {
          lt: twentyFiveHoursAgo
        }
      },
      select: { id: true },
      // ~2.650 linhas em cascata por usuário: 40 é o que cabe com folga em 60s.
      // O cron roda diariamente; se a fila crescer além disso, é sinal de que a
      // limpeza precisa de mais de uma execução por dia, não de um lote maior.
      take: 40
    })

    let deletedCount = 0
    let failedCount = 0
    const errors: string[] = []

    for (const u of stale) {
      try {
        await prisma.user.delete({ where: { id: u.id } })
        deletedCount++
      } catch (error) {
        failedCount++
        if (errors.length < 5) {
          errors.push((error as Error).message)
        }
      }
    }

    return NextResponse.json({
      success: true,
      deletedCount,
      failedCount,
      errors
    })
  } catch (error) {
    console.error("Cron Cleanup Error:", error)
    // i18n-ignore: endpoint de cron interno (Vercel Cron), resposta nunca é renderizada em UI
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
