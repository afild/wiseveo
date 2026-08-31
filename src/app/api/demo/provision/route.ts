import { NextResponse } from "next/server"
import { DEMO_DEFAULT_LOCALE, LOCALE_COOKIE_NAME } from "@/i18n/config"
import { DEMO_UNAVAILABLE_PATH } from "@/lib/demo-routes"
import { provisionDemoVisitor } from "@/features/demo/services/provision-demo-visitor.service"
import { getVitrineUserId } from "@/features/demo/services/vitrine.service"
import { applyDemoSessionCookies } from "@/features/demo/services/demo-session-cookies"

export const dynamic = 'force-dynamic'
// Increase max duration for provisioning (Vercel Hobby allows up to 60s on API routes)
export const maxDuration = 60

export async function GET(request: Request) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    // i18n-ignore: guarda interna (rota só existe com demo mode ligado), nunca chega a um usuário real
    return NextResponse.json({ error: "Demo mode is disabled" }, { status: 403 })
  }

  try {
    // 1. Vitrine: todo visitante cai no MESMO usuário, sem escrever no banco.
    //    Sem vitrine (banco recém-criado, seed ainda não rodou), degrada para o
    //    provisionamento clássico — a demo continua no ar, só que cara.
    const vitrineId = await getVitrineUserId()
    const shared = vitrineId !== null
    const userId = vitrineId ?? (await provisionDemoVisitor()).userId

    // 2. Redirect para o dashboard com os cookies de sessão (sessão, fresh-session
    //    e o marcador da vitrine — ver applyDemoSessionCookies).
    const response = NextResponse.redirect(new URL("/dashboard", request.url))
    await applyDemoSessionCookies(response, { userId, demoShared: shared })

    // 3. Todo demo novo nasce em inglês — sobrescreve qualquer cookie de idioma que o
    //    navegador já tivesse. NÃO httpOnly: o LocaleMenu regrava este cookie via
    //    document.cookie (mesmos atributos de applyUserLocale); httpOnly criaria um
    //    cookie duplicado e o seletor de idioma pareceria quebrado.
    response.cookies.set(LOCALE_COOKIE_NAME, DEMO_DEFAULT_LOCALE, {
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    })

    return response
  } catch (error) {
    console.error("Error provisioning demo user:", error)
    // Visitante anônimo não deve receber JSON cru: quando o provisionamento falha
    // (banco fora do ar, sem espaço, em manutenção) ele vai para uma página que
    // explica e oferece tentar de novo. O middleware deixa esse caminho passar.
    return NextResponse.redirect(new URL(DEMO_UNAVAILABLE_PATH, request.url))
  }
}
