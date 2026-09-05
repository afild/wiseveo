import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Logo } from "@/components/logo"
import { Wordmark } from "@/components/wordmark"
import { RichText } from "@/features/legal/components/rich-text"
import { PRIVACY_SECTION_IDS } from "@/features/legal/lib/privacy-sections"

/**
 * Política de privacidade: página PÚBLICA, sem sessão, igual nas duas instalações
 * (app e demo). O Google exige que o endereço esteja no ar e alcançável sem login para
 * publicar o app na tela de consentimento, e é para cá que o consentimento aponta.
 *
 * O texto inteiro vem dos arquivos de tradução (`legal.privacy`), nos três idiomas,
 * como qualquer outro texto do app. A ordem das seções vem de `PRIVACY_SECTION_IDS`.
 * O middleware libera esta rota antes de qualquer regra de sessão ou de demo.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.privacy")
  return {
    title: `${t("title")} · WISEVEO`,
    description: t("metaDescription"),
  }
}

export default async function PrivacidadePage() {
  const t = await getTranslations("legal.privacy")
  const tLegal = await getTranslations("legal")

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10 md:py-16">
      <div className="mb-10 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2" aria-label="WISEVEO">
          <Logo size={28} />
          <Wordmark className="text-xl" />
        </Link>
        <Link href="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          {tLegal("backHome")}
        </Link>
      </div>

      <header className="space-y-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("effectiveDate")}</p>
      </header>

      <p className="mt-6 text-base leading-relaxed text-muted-foreground">{t("intro")}</p>

      <div className="mt-10 space-y-10 text-sm leading-relaxed text-muted-foreground md:text-base">
        {PRIVACY_SECTION_IDS.map((id, index) => (
          <section key={id} className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-foreground">
              {index + 1}. {t(`sections.${id}.title`)}
            </h2>
            <RichText body={t(`sections.${id}.body`)} />
          </section>
        ))}
      </div>

      <footer className="mt-16 flex items-center justify-between gap-4 border-t pt-6 text-sm text-muted-foreground">
        <Wordmark />
        <Link href="/" className="underline-offset-4 hover:underline">
          {tLegal("backHome")}
        </Link>
      </footer>
    </main>
  )
}
