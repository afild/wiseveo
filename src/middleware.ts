import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth"
import createMiddleware from "next-intl/middleware"
import { routing } from "./i18n/routing"
import { isSetupComplete } from "@/lib/setup-check"
import { DEMO_UNAVAILABLE_PATH } from "@/lib/demo-routes"
import { isBlockedSharedWrite } from "@/lib/demo-shared"

const publicRoutes = ["/login", "/signup", "/cadastro-pendente"]
// Página de aceite de convite (/convite/<token>) é pública por prefixo: quem foi
// convidado ainda não tem conta, então não pode cair no login antes de aceitar.
const publicPrefixes = ["/convite/"]
const intlMiddleware = createMiddleware(routing)

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ─── /api ────────────────────────────────────────────────────────
  // Até aqui o matcher EXCLUÍA "api": nenhuma rota /api passava pelo middleware. O
  // matcher agora inclui /api/:path* só para a cerca de escrita abaixo alcançar
  // estas rotas — o resto do contrato tem de continuar idêntico ao de antes (cron,
  // webhook, provisionamento, fork): sem o gate de setup, que redirecionaria para
  // /login numa instalação ainda não configurada, e sem qualquer outro redireciono
  // de auth. Por isso o bloco fica ANTES do gate de setup e recalcula, sozinho, o
  // mínimo de token+isDemoMode que a cerca precisa.
  if (pathname.startsWith("/api")) {
    const token = request.cookies.get(COOKIE_NAME)?.value
    const session = token ? await verifySessionToken(token) : null
    const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true"

    // Sessão-vitrine não escreve. A decisão é por método+claim (isBlockedSharedWrite)
    // para cobrir as rotas /api e TAMBÉM as server actions de orçamento, que POSTam
    // na própria página e nunca passariam por uma lista de rotas /api.
    if (isDemoMode && isBlockedSharedWrite(request.method, pathname, session?.demoShared)) {
      // i18n-ignore: o cliente traduz pelo código
      return NextResponse.json({ error: "demoForkRequired" }, { status: 409 })
    }
    return NextResponse.next()
  }

  // ─── Setup Wizard Gate ─────────────────────────────────────────────
  const setupComplete = isSetupComplete()

  // Instalação NÃO configurada: a porta de entrada é sempre o /login (que mostra
  // "Configurar agora"); o wizard fica acessível em /setup; o resto volta ao login.
  if (!setupComplete) {
    if (pathname.startsWith("/setup") || pathname === "/login") return NextResponse.next()
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const token = request.cookies.get(COOKIE_NAME)?.value
  const session = token ? await verifySessionToken(token) : null
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true"

  // Sessão-vitrine não escreve. A decisão é por método+claim (isBlockedSharedWrite)
  // para cobrir as rotas /api (tratadas acima) e TAMBÉM as server actions de
  // orçamento, que POSTam na própria página e nunca passariam por uma lista de
  // rotas /api.
  if (isDemoMode && isBlockedSharedWrite(request.method, pathname, session?.demoShared)) {
    // i18n-ignore: o cliente traduz pelo código
    return NextResponse.json({ error: "demoForkRequired" }, { status: 409 })
  }

  // Instalação configurada: /setup só para quem está logado (a página confere se
  // é SUPERADMIN — "Reconfigurar"); anônimo vai para o login.
  if (pathname.startsWith("/setup")) {
    if (isDemoMode) return NextResponse.redirect(new URL("/dashboard", request.url))
    return session ? NextResponse.next() : NextResponse.redirect(new URL("/login", request.url))
  }

  // ─── Normal Auth Flow (only runs after setup is complete) ──────────

  // Convite: quem já está logado vai para o dashboard; quem não está vê a página.
  if (publicPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    if (isDemoMode) return NextResponse.redirect(new URL("/dashboard", request.url))
    return session ? NextResponse.redirect(new URL("/dashboard", request.url)) : NextResponse.next()
  }

  // Página de "demo indisponível", para onde o provisionamento manda quando
  // falha. Precisa ser alcançável SEM sessão, e a decisão tem de vir antes das
  // duas regras abaixo: a do provisionamento (que devolveria o visitante ao erro
  // que acabou de acontecer, em laço) e a que manda anônimo para o login.
  if (isDemoMode && pathname === DEMO_UNAVAILABLE_PATH) {
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
    // Match all paths except _next/static, _next/image, favicon.ico, and static files
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)",
    // /api também passa (necessário para a cerca de escrita da sessão-vitrine
    // alcançar estas rotas — ver bloco "/api" acima).
    "/api/:path*",
  ],
}
