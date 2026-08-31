import { NextResponse } from "next/server"
import { createSessionToken, COOKIE_NAME } from "@/lib/auth"
import { DEMO_DEFAULT_LOCALE, LOCALE_COOKIE_NAME } from "@/i18n/config"
import { FRESH_SESSION_COOKIE } from "@/lib/client-session-reset"
import { DEMO_UNAVAILABLE_PATH } from "@/lib/demo-routes"
import { provisionDemoVisitor } from "@/features/demo/services/provision-demo-visitor.service"

export const dynamic = 'force-dynamic'
// Increase max duration for provisioning (Vercel Hobby allows up to 60s on API routes)
export const maxDuration = 60

export async function GET(request: Request) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    // i18n-ignore: guarda interna (rota só existe com demo mode ligado), nunca chega a um usuário real
    return NextResponse.json({ error: "Demo mode is disabled" }, { status: 403 })
  }

  try {
    const { userId } = await provisionDemoVisitor()

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
    // Visitante anônimo não deve receber JSON cru: quando o provisionamento falha
    // (banco fora do ar, sem espaço, em manutenção) ele vai para uma página que
    // explica e oferece tentar de novo. O middleware deixa esse caminho passar.
    return NextResponse.redirect(new URL(DEMO_UNAVAILABLE_PATH, request.url))
  }
}
