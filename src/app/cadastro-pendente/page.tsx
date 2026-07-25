import Link from "next/link"
import { Clock3 } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Logo } from "@/components/logo"
import { Wordmark } from "@/components/wordmark"

export default async function CadastroPendentePage() {
  const t = await getTranslations("auth")

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
              <Clock3 className="size-6" />
            </div>
            <CardTitle>{t("cadastroPendente.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              {t("cadastroPendente.description")}
            </p>
            <Button asChild className="w-full">
              <Link href="/login">{t("cadastroPendente.backToLogin")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
