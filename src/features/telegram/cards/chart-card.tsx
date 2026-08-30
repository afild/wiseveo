import { cardTheme, toneColor, type CardTheme } from "./card-theme"
import { BaseCard } from "./base-card"
import type { ChartBlock } from "@/features/ai/types/response.types"

/**
 * O gráfico de barras do card.
 *
 * Barras HORIZONTAIS, e não colunas, por uma razão prática: o rótulo de uma
 * categoria financeira ("Alimentação", "Moradia") não cabe embaixo de uma
 * coluna estreita, e girar texto não existe no motor de desenho. Deitada, cada
 * barra tem o nome de um lado, o valor do outro, e a comparação continua óbvia.
 *
 * O comprimento sai do campo `weight`, que é só peso relativo — o que a pessoa
 * LÊ é o `value`, que veio formatado das ferramentas. Se o modelo errar o peso,
 * a barra fica um pouco torta; nenhum número errado aparece escrito.
 */
export function ChartCard({
  block,
  audience,
  theme = cardTheme,
}: {
  block: ChartBlock
  audience?: string
  theme?: CardTheme
}) {
  const max = Math.max(...block.bars.map((bar) => bar.weight), 0)

  return (
    <BaseCard
      headline={block.title ?? ""}
      audience={audience}
      theme={theme}
      footer={block.footnote ?? undefined}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {block.bars.map((bar, index) => {
          // Barra com 0% de largura desaparece e some da leitura; 2% mantém o
          // traço visível para o item que existe mas é pequeno perto do maior.
          const ratio = max > 0 ? Math.max(0.02, bar.weight / max) : 0.02
          const color = toneColor(bar.tone, theme)

          return (
            <div
              key={`${bar.label}-${index}`}
              style={{ display: "flex", flexDirection: "column", gap: 6 }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 16,
                }}
              >
                <div
                  style={{
                    color: theme.foreground,
                    fontSize: 19,
                    fontWeight: 600,
                    display: "block",
                    lineClamp: 1,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {bar.label}
                </div>
                <div style={{ color, fontSize: 20, fontWeight: 700, flexShrink: 0 }}>
                  {bar.value}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  width: "100%",
                  height: 12,
                  borderRadius: 999,
                  backgroundColor: theme.panelSoft,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: `${Math.round(ratio * 100)}%`,
                    height: 12,
                    borderRadius: 999,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </BaseCard>
  )
}
