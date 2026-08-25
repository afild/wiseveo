import type { CardData, TelegramTranslator } from "../types/telegram.types"
import { BaseCard } from "./base-card"
import { cardTheme, toneColor } from "./card-theme"

export function SummaryCard({ data, t }: { data: CardData; t: TelegramTranslator }) {
  const items = (data.items ?? []).slice(0, 3)

  return (
    <BaseCard eyebrow={data.eyebrow} headline={data.headline} footer={data.insight}>
      <div style={{ display: "flex", flexDirection: "row", gap: 30, flex: 1 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            minWidth: 0,
          }}
        >
          <div style={{ color: cardTheme.muted, fontSize: 16, fontWeight: 600, marginBottom: 8, letterSpacing: "0.05em", textTransform: "uppercase" }}>{data.valueLabel ?? t("cards.totalResult")}</div>
          <div
            style={{
              color: data.value?.startsWith("(") ? cardTheme.negative : cardTheme.foreground,
              fontSize: 64,
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: "-0.04em",
            }}
          >
            {data.value ?? "0,00"}
          </div>
          {data.trend ? (
            <div
              style={{
                display: "flex",
                marginTop: 20,
                alignSelf: "flex-start",
                padding: "10px 16px",
                borderRadius: 12,
                backgroundColor: cardTheme.panel,
                border: `1px solid ${cardTheme.border}`,
                color: cardTheme.accent,
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: "-0.01em",
              }}
            >
              {data.trend}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 320,
            gap: 12,
            justifyContent: "center",
          }}
        >
          {items.map((item) => (
            <div
              key={`${item.label}-${item.value}`}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                padding: "14px 18px",
                borderRadius: 16,
                backgroundColor: cardTheme.panelSoft,
                border: `1px solid ${cardTheme.border}`,
              }}
            >
              <div style={{ color: cardTheme.muted, fontSize: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.02em" }}>{item.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <div style={{ color: toneColor(item.tone), fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>{item.value}</div>
                {item.detail ? (
                  <div style={{ color: cardTheme.muted, fontSize: 13, fontWeight: 500 }}>{item.detail}</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </BaseCard>
  )
}
