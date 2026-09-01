/**
 * Páginas que NÃO existem na instalação de demonstração — a página responde
 * 404, então nenhum menu (desktop ou celular) pode oferecer o caminho.
 *
 * Lista única para o menu lateral e o do celular não saírem de sincronia: quem
 * desligar uma página na demo acrescenta o caminho aqui e os dois obedecem.
 */
// Vazia hoje: o Advisor ganhou uma versão ilustrativa na demo (roteiro fixo,
// sem IA). A lista fica porque é o único ponto que desliga páginas na demo.
export const DEMO_DISABLED_ROUTES: string[] = []

/**
 * Para onde o visitante vai quando o provisionamento falha (banco fora do ar,
 * sem espaço, em manutenção). Precisa ser constante porque três arquivos
 * dependem de ela ser a MESMA: a rota que redireciona, a página que atende e o
 * middleware, que tem de deixar este caminho passar sem sessão — senão o
 * visitante volta ao provisionamento que acabou de falhar, em laço.
 */
export const DEMO_UNAVAILABLE_PATH = "/demo-unavailable"

export function isDemoDisabledRoute(href: string): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true" && DEMO_DISABLED_ROUTES.includes(href)
}
