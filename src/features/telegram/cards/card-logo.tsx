import { cardTheme, type CardTheme } from "./card-theme"

/**
 * A marca WISEVEO dentro do card.
 *
 * É a MESMA geometria congelada de `src/components/logo.tsx` (Brand Book,
 * cap. 04): W em 5,20 13,36 24,15 35,36 43,20, estrela em (35.5, 8), grade 48,
 * traço 4,5, pontas arredondadas. O componente da aplicação não serve aqui
 * porque pinta por classe do Tailwind, e o motor do card não tem CSS — as cores
 * entram diretas, na versão escura da marca, que é o fundo deste card.
 */
export function CardLogo({ size = 34, theme = cardTheme }: { size?: number; theme?: CardTheme }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <polyline
        points="5,20 13,36 24,15 35,36 43,20"
        fill="none"
        stroke={theme.accent}
        strokeWidth={4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="35.5" cy="8" r="3.5" fill={theme.accentSoft} />
    </svg>
  )
}
