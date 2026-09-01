import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth"
import createMiddleware from "next-intl/middleware"
import { routing } from "./i18n/routing"
import { isSetupComplete } from "@/lib/setup-check"
import { DEMO_UNAVAILABLE_PATH } from "@/lib/demo-routes"
import { isBlockedSharedWrite, DEMO_FORK_REQUIRED_HEADER } from "@/lib/demo-shared"

const publicRoutes = ["/login", "/signup", "/cadastro-pendente"]
// Página de aceite de convite (/convite/<token>) é pública por prefixo: quem foi
// convidado ainda não tem conta, então não pode cair no login antes de aceitar.
const publicPrefixes = ["/convite/"]
const intlMiddleware = createMiddleware(routing)

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true"

  // /api nunca passou pelo middleware: fora da demo, a única razão de ele ver /api
  // (a cerca de escrita abaixo) não existe — devolve na hora, sem nem ler sessão.
  const isApi = pathname.startsWith("/api")
  if (isApi && !isDemoMode) return NextResponse.next()

  const token = request.cookies.get(COOKIE_NAME)?.value
  const session = token ? await verifySessionToken(token) : null

  // Cerca ÚNICA da sessão-vitrine: pega /api E as server actions de orçamento
  // (POST na própria página). Fica ANTES do gate de setup de propósito — o gate
  // redirecionaria /api para /login em instalação não configurada. Isso é seguro
  // porque isSetupComplete() (src/lib/setup-check.ts) já retorna true sempre que
  // NEXT_PUBLIC_DEMO_MODE==="true" — a cerca nunca precisa disparar dentro da
  // janela "!setupComplete", que só existe fora da demo.
  if (isDemoMode && isBlockedSharedWrite(request.method, pathname, session?.demoShared)) {
    // i18n-ignore: o cliente detecta pelo status/cabeçalho; o corpo é código de máquina
    return NextResponse.json(
      { error: "demoForkRequired" },
      { status: 409, headers: { [DEMO_FORK_REQUIRED_HEADER]: "1" } },
    )
  }
  // /api atendido: o resto do middleware (setup gate, redirects de auth) NUNCA
  // se aplica a /api — contrato histórico do matcher antigo.
  if (isApi) return NextResponse.next()

  // ─── Setup Wizard Gate ─────────────────────────────────────────────
  const setupComplete = isSetupComplete()

  // Instalação NÃO configurada: a porta de entrada é sempre o /login (que mostra
  // "Configurar agora"); o wizard fica acessível em /setup; o resto volta ao login.
  if (!setupComplete) {
    if (pathname.startsWith("/setup") || pathname === "/login") return NextResponse.next()
    return NextResponse.redirect(new URL("/login", request.url))
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
    // alcançar estas rotas — ver `isApi` no corpo acima). O `startsWith("/api")` do
    // corpo e este `/api/:path*` combinam de propósito com o lookahead `(?!api...)`
    // do primeiro padrão: um caminho de página que começa com "api" sem barra (ex.:
    // /apiary) não casa com NENHUM dos dois — igual a antes desta tarefa.
    "/api/:path*",
  ],
}
