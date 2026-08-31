// Limitador MELHOR-ESFORÇO em memória (por instância de função). Não é a
// defesa principal — robô não faz POST; é só válvula contra abuso manual.
export function createForkRateLimiter(cfg: { max: number; windowMs: number }) {
  const hits = new Map<string, number[]>()
  return (ip: string, now: number): boolean => {
    const janela = (hits.get(ip) ?? []).filter((t) => now - t < cfg.windowMs)
    if (janela.length >= cfg.max) {
      hits.set(ip, janela)
      return false
    }
    janela.push(now)
    hits.set(ip, janela)
    return true
  }
}
