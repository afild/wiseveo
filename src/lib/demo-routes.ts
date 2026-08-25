/**
 * Páginas que NÃO existem na instalação de demonstração — a página responde
 * 404, então nenhum menu (desktop ou celular) pode oferecer o caminho.
 *
 * Lista única para o menu lateral e o do celular não saírem de sincronia: quem
 * desligar uma página na demo acrescenta o caminho aqui e os dois obedecem.
 */
export const DEMO_DISABLED_ROUTES: string[] = ["/advisor"]

export function isDemoDisabledRoute(href: string): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true" && DEMO_DISABLED_ROUTES.includes(href)
}
