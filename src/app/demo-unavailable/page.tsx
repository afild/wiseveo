import { Wrench } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Logo } from "@/components/logo"
import { Wordmark } from "@/components/wordmark"

/**
 * Cara da demo quando o provisionamento falha. Antes o visitante recebia o JSON
 * cru `{"error":"Internal server error"}` — que é a pior primeira impressão
 * possível de um produto financeiro.
 *
 * O botão é um formulário GET, e não um <Link>: além de recarregar a página
 * inteira (que é o que faz o middleware tentar provisionar de novo), evita o
 * prefetch — passar o mouse sobre um <Link> para "/" chegaria ao provisionamento
 * e criaria um visitante sem ninguém ter clicado em nada.
 */
export default async function DemoUnavailablePage() {
  const t = await getTranslations("demo.unavailable")

  return (
    <main className="flex min-h-svh w-full items-center justify-center bg-background p-6 md:p-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <div className="flex items-center gap-2">
            <Logo size={28} />
            <Wordmark className="text-xl" />
          </div>
        </div>

        <Card>
          <CardHeader className="items-center text-center">
            <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Wrench className="size-6" />
            </div>
            <CardTitle>{t("title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">{t("description")}</p>
            <form action="/" method="get">
              <Button type="submit" className="w-full">
                {t("retry")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
