import type { Metadata } from "next"
import type { CSSProperties } from "react"
import { Figtree, JetBrains_Mono, Manrope } from "next/font/google"
import { cn } from "@/lib/utils"
import { AppProviders } from "@/components/app-providers"
import { getUserAppearanceSettings } from "@/features/settings/services/user-settings-service"
import { getSettingsUserId } from "@/features/settings/services/get-settings-user-id"
import {
  buildThemeBootstrapScript,
  getThemeStyleAttributes,
  mergeThemePreferences,
  type ThemePreferences,
} from "@/lib/theme-preferences"
import { NextIntlClientProvider } from "next-intl"
import { getMessages, getLocale, getTranslations } from "next-intl/server"
import { getIntlLocale } from "@/i18n/format"
import { ZodLocaleSync } from "@/components/zod-locale-sync"
import "./globals.css"

// Trio tipográfico da marca (Brand Book cap. 6): Figtree = texto/UI,
// Manrope = display/títulos/KPIs, JetBrains Mono = só código e IDs.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
})

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata")

  return {
    // Nome da marca: literal, idêntico em todos os idiomas (não é chave i18n)
    title: "WISEVEO",
    description: t("description"),
  }
}

async function getInitialThemePreferences(): Promise<ThemePreferences> {
  // During setup wizard, DB is not available yet — use defaults
  if (process.env.WISEVEO_SETUP_COMPLETE !== "true") {
    return mergeThemePreferences()
  }

  const userId = await getSettingsUserId()

  if (!userId) {
    return mergeThemePreferences()
  }

  return getUserAppearanceSettings(userId)
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const initialThemePreferences = await getInitialThemePreferences()
  const messages = await getMessages()
  const locale = await getLocale()

  const htmlClassName =
    initialThemePreferences.themeMode === "system"
      ? undefined
      : initialThemePreferences.themeMode
  const htmlStyle =
    initialThemePreferences.themeMode === "system"
      ? undefined
      : (getThemeStyleAttributes(
          initialThemePreferences,
          initialThemePreferences.themeMode,
        ) as CSSProperties)

  return (
    <html
      lang={getIntlLocale(locale)}
      suppressHydrationWarning
      // Variáveis do next/font ficam no <html>: o --font-sans dos presets e do
      // preflight do Tailwind resolve neste nível — no <body> o var() quebra.
      className={cn(
        figtree.variable,
        manrope.variable,
        jetbrainsMono.variable,
        htmlClassName,
      )}
      style={htmlStyle}
    >
      <body suppressHydrationWarning className="antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: buildThemeBootstrapScript(initialThemePreferences, "wiseveo-theme"),
          }}
        />
        <div id="wiseveo-app-root" className="contents">
          <AppProviders initialThemePreferences={initialThemePreferences}>
            <NextIntlClientProvider messages={messages}>
              <ZodLocaleSync />
              {children}
            </NextIntlClientProvider>
          </AppProviders>
        </div>
      </body>
    </html>
  )
}
