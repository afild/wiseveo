import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth"
import createMiddleware from "next-intl/middleware"
import { routing } from "./i18n/routing"
import { isSetupComplete } from "@/lib/setup-check"

const publicRoutes = ["/login", "/signup", "/cadastro-pendente"]
// Página de aceite de convite (/convite/<token>) é pública por prefixo.
const publicPrefixes = ["/convite/"]
const intlMiddleware = createMiddleware(routing)

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ─── Setup Wizard Gate ─────────────────────────────────────────────
  const setupComplete = isSetupComplete()

  // Setup NOT complete → redirect everything to /setup (except setup routes and API)
  if (!setupComplete && !pathname.startsWith("/setup")) {
    return NextResponse.redirect(new URL("/setup", request.url))
  }

  // Setup IS complete → block access to /setup wizard
  if (setupComplete && pathname.startsWith("/setup")) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // If we're on /setup and setup is not complete, let it through
  if (!setupComplete && pathname.startsWith("/setup")) {
    return NextResponse.next()
  }

  // ─── Normal Auth Flow (only runs after setup is complete) ──────────
  const token = request.cookies.get(COOKIE_NAME)?.value
  const session = token ? await verifySessionToken(token) : null
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true"

  // Convite: quem já está logado é levado ao dashboard; quem não está vê a página.
  if (publicPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    if (isDemoMode) return NextResponse.redirect(new URL("/dashboard", request.url))
    return session ? NextResponse.redirect(new URL("/dashboard", request.url)) : NextResponse.next()
  }

  // Em modo demo, usuário não autenticado cai no provisionamento
  if (isDemoMode && !session) {
    return NextResponse.redirect(new URL("/api/demo/provision", request.url))
  }

  // Usuário logado tentando acessar login/signup → redireciona para dashboard
  if (session && publicRoutes.includes(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  // Usuário logado acessando raiz → redireciona para dashboard
  if (session && pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  // Usuário NÃO logado acessando raiz → redireciona para login
  if (!session && pathname === "/") {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // Usuário NÃO logado acessando rotas protegidas → redireciona para login
  if (!session && !publicRoutes.includes(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Match all paths except api, _next/static, _next/image, favicon.ico, and static files
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)",
  ],
}
