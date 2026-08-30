import { cardTheme, toneColor, type CardTheme } from "./card-theme"
import { BaseCard } from "./base-card"
import type { CardBlock } from "@/features/ai/types/response.types"

/**
 * O card que a IA monta. Um só desenho para tudo — o dia inteiro lançamento a
 * lançamento, o retrato do mês, a comparação de categorias — porque quem decide
 * o conteúdo é quem escreveu o bloco, não este arquivo.
 *
 * Não há corte de itens aqui, e é de propósito: os cards antigos fatiavam em 3,
 * 4 ou 5 linhas para caber numa altura fixa. Agora a altura acompanha o
 * conteúdo, e o teto real é o do esquema (30 linhas), longe do que uma pessoa
 * lê numa imagem de celular.
 */
export function ComposedCard({
  block,
  audience,
  theme = cardTheme,
}: {
  block: CardBlock
  audience?: string
  theme?: CardTheme
}) {
  const rows = block.rows

  return (
    <BaseCard
      eyebrow={block.eyebrow ?? undefined}
      headline={block.headline}
      audience={audience}
      theme={theme}
      footer={block.footnote ?? undefined}
    >
      {block.highlight ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 26 }}>
          <div
            style={{
              color: theme.muted,
              fontSize: 15,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {block.highlight.label}
          </div>
          <div
            style={{
              color: toneColor(block.highlight.tone, theme),
              fontSize: 62,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: "-0.04em",
            }}
          >
            {block.highlight.value}
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {rows.map((row, index) => (
          <div
            key={`${row.label}-${index}`}
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 20,
              padding: "13px 16px",
              // Faixas alternadas: numa lista longa é o que deixa o olho seguir
              // a linha até o valor, do outro lado do card.
              backgroundColor: index % 2 === 0 ? theme.panelSoft : "transparent",
              borderRadius: 10,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
              <div
                style={{
                  color: theme.foreground,
                  fontSize: 20,
                  fontWeight: 600,
                  // Descrição comprida vira reticências em vez de empurrar a
                  // linha para baixo e desalinhar a coluna dos valores.
                  display: "block",
                  lineClamp: 1,
                }}
              >
                {row.label}
              </div>
              {row.detail ? (
                <div style={{ color: theme.muted, fontSize: 15 }}>{row.detail}</div>
              ) : null}
            </div>
            <div
              style={{
                color: toneColor(row.tone, theme),
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "-0.01em",
                flexShrink: 0,
              }}
            >
              {row.value}
            </div>
          </div>
        ))}
      </div>
    </BaseCard>
  )
}
