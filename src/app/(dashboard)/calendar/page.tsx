import { startOfMonth, endOfMonth } from "date-fns"
import { getTranslations } from "next-intl/server"
import { getDefaultUserId } from "@/features/transactions/services/get-default-user-id"
import { getCalendarStatement } from "@/features/calendar/services/get-calendar-statement"
import { CalendarPageClient } from "@/features/calendar/components/calendar-page-client"
import { prisma } from "@/lib/prisma"
import { getSessionUserId } from "@/lib/session"
import { startOfUTCDay, endOfUTCDay } from "@/lib/financial"

export default async function CalendarPage() {
  const userId = await getDefaultUserId()

  if (!userId) {
    const t = await getTranslations("common")
    return (
      <div className="flex items-center justify-center h-96 px-4 md:px-6">
        <p className="text-muted-foreground">
          {t("noUserFound")}
        </p>
      </div>
    )
  }

  const now = new Date()
  const from = startOfUTCDay(startOfMonth(now))
  const to = endOfUTCDay(endOfMonth(now))

  // Dados financeiros são do DONO (userId); a conexão com o Google Calendar é da
  // PESSOA logada — o mesmo id que sync-google/clear-google/connect-google usam.
  const sessionUserId = await getSessionUserId()
  const [calendarData, user] = await Promise.all([
    getCalendarStatement(userId, from, to),
    prisma.user.findUnique({
      where: { id: sessionUserId ?? userId },
      select: { googleRefreshToken: true },
    }),
  ])

  const { isGoogleConfigured } = await import("@/lib/google-auth")
  const googleConfigured = isGoogleConfigured()

  return (
    <CalendarPageClient
      initialData={calendarData}
      hasGoogleCalendar={!!user?.googleRefreshToken}
      isGoogleConfigured={googleConfigured}
    />
  )
}
