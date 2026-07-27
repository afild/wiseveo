import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = 'force-dynamic'

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
      take: 200
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
