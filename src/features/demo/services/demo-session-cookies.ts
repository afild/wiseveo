import type { NextResponse } from "next/server"
import { COOKIE_NAME, createSessionToken } from "@/lib/auth"
import { DEMO_SHARED_MARKER_COOKIE } from "@/lib/demo-shared"
import { FRESH_SESSION_COOKIE } from "@/lib/client-session-reset"

/**
 * Monta os cookies de sessão da demo num lugar só (entrada e fork usam a
 * MESMA montagem — cópias separadas divergiriam em silêncio):
 * - sessão de 24h, com a marca demoShared quando é a vitrine;
 * - wiseveo-fresh-session, para o cliente limpar filtros herdados do visitante
 *   anterior no mesmo navegador — a ENTRADA grava (pessoa NOVA no navegador);
 *   o FORK não (`freshSession: false`): é a MESMA pessoa continuando, período/
 *   filtros/cache de moeda seguem válidos para o mesmo dataset;
 * - o marcador NÃO-httpOnly da vitrine (o banner lê), criado no modo
 *   compartilhado e APAGADO ao virar cópia própria.
 * O cookie de idioma NÃO entra aqui: só a entrada o define (o fork precisa
 * preservar o idioma que a pessoa já escolheu).
 */
export async function applyDemoSessionCookies(
  response: NextResponse,
  {
    userId,
    demoShared,
    freshSession = true,
  }: {
    userId: string
    demoShared: boolean
    /** Grava o marcador wiseveo-fresh-session. Padrão: sim (a ENTRADA); o fork passa false. */
    freshSession?: boolean
  },
): Promise<void> {
  const token = await createSessionToken(userId, undefined, {
    demoShared,
  })
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // 24h: casa com STALE_HOURS=25 da faxina — a sessão não deve sobreviver
    // ao usuário que ela aponta.
    maxAge: 60 * 60 * 24,
  })
  if (freshSession) {
    response.cookies.set(FRESH_SESSION_COOKIE, "1", {
      httpOnly: false,
      maxAge: 60 * 60 * 24,
      sameSite: "lax",
      path: "/",
    })
  }
  if (demoShared) {
    response.cookies.set(DEMO_SHARED_MARKER_COOKIE, "1", {
      httpOnly: false,
      maxAge: 60 * 60 * 24,
      sameSite: "lax",
      path: "/",
    })
  } else {
    response.cookies.set(DEMO_SHARED_MARKER_COOKIE, "", { maxAge: 0, path: "/" })
  }
}
