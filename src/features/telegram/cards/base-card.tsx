import type { ReactNode } from "react"
import { CARD_FAMILY, CARD_SIZE, cardTheme, type CardTheme } from "./card-theme"
import { CardLogo } from "./card-logo"

interface BaseCardProps {
  eyebrow?: string
  headline: string
  /** Primeiro nome de quem pediu — o card é para uma pessoa, não para "o usuário". */
  audience?: string
  theme?: CardTheme
  children: ReactNode
  footer?: ReactNode
}

/**
 * O envelope de todo card.
 *
 * Duas coisas saíram daqui e valem o registro: a caixinha com a letra "A" no
 * canto (um "avatar" decorativo que não era inicial de ninguém nem marca — a
 * marca começa com W) e a altura fixa, que cortava conteúdo em silêncio.
 *
 * O `eyebrow` é CONTEXTO (período, conta, categoria) e o `headline` é o
 * ASSUNTO. Quando quem chama põe a data nos dois, o card fica dizendo a mesma
 * coisa duas vezes, uma embaixo da outra.
 */
export function BaseCard({
  eyebrow,
  headline,
  audience,
  theme = cardTheme,
  children,
  footer,
}: BaseCardProps) {
  return (
    <div
      style={{
        width: "100%",
        minHeight: CARD_SIZE.minHeight,
        display: "flex",
        flexDirection: "column",
        background: `linear-gradient(135deg, ${theme.gradientStart} 0%, ${theme.gradientEnd} 100%)`,
        color: theme.foreground,
        fontFamily: CARD_FAMILY, // i18n-ignore: identificador de fonte, não é texto de UI
        padding: 38,
        position: "relative",
      }}
    >
      {/* Brilho decorativo do canto. */}
      <div
        style={{
          position: "absolute",
          top: -120,
          right: -120,
          width: 340,
          height: 340,
          borderRadius: "100%",
          background: `radial-gradient(circle, ${theme.accent}${theme.glow} 0%, transparent 70%)`,
          display: "flex",
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 24,
          marginBottom: 26,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
          {eyebrow ? (
            <div
              style={{
                color: theme.accent,
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              {eyebrow}
            </div>
          ) : null}
          <div
            style={{
              color: theme.foreground,
              fontSize: 34,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            {headline}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            flexShrink: 0,
            gap: 6,
          }}
        >
          <CardLogo theme={theme} />
          {audience ? (
            <div style={{ color: theme.muted, fontSize: 14, fontWeight: 600 }}>{audience}</div>
          ) : null}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>{children}</div>

      {footer ? (
        <div
          style={{
            display: "flex",
            marginTop: 18,
            paddingTop: 16,
            borderTop: `1px solid ${theme.border}`,
            color: theme.muted,
            fontSize: 17,
            lineHeight: 1.4,
          }}
        >
          {footer}
        </div>
      ) : null}
    </div>
  )
}
