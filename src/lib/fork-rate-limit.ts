// Limitador MELHOR-ESFORÇO em memória (por instância de função). Não é a
// defesa principal — robô não faz POST; é só válvula contra abuso manual.
// Confiança no primeiro salto assume que a Vercel termina a conexão (o
// x-forwarded-for que ela injeta é confiável); fora dela (self-host sem
// proxy na frente) o cabeçalho é controlado pelo cliente e o limitador
// vira só um freio de boa-fé, não uma defesa.
export function createForkRateLimiter(cfg: { max: number; windowMs: number }) {
  const hits = new Map<string, number[]>()
  let proximaFaxina = 0
  return (ip: string, now: number): boolean => {
    // Varre o mapa uma vez por janela: sem isto, cada IP distinto deixa uma
    // chave para sempre na instância.
    if (now >= proximaFaxina) {
      for (const [chave, ts] of hits) {
        if (ts.every((t) => now - t >= cfg.windowMs)) hits.delete(chave)
      }
      proximaFaxina = now + cfg.windowMs
    }
    const janela = (hits.get(ip) ?? []).filter((t) => now - t < cfg.windowMs)
    if (janela.length >= cfg.max) return false
    janela.push(now)
    hits.set(ip, janela)
    return true
  }
}
