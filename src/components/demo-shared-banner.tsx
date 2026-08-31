"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Eye, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { DEMO_FORK_PATH } from "@/lib/demo-shared"
import { hasSharedDemoMarker } from "@/lib/demo-shared-client"
import { isValidLeadEmail, isValidLeadName } from "@/lib/demo-lead"

// Sem escuta: mudança só reflete no próximo render, e isso basta — forkar
// navega para /dashboard. useSyncExternalStore dispensa setState em efeito
// (padrão de use-fitted-column-sizing.ts) e mantém a hidratação idêntica nos
// dois lados: no servidor não há cookie, então o snapshot do servidor é
// sempre `false`.
function subscribeNoop() {
  return () => {}
}

function getServerSnapshot() {
  return false
}

/**
 * Vitrine da demo compartilhada: pill flutuante avisando que a sessão é
 * só-leitura + o formulário que capta nome/e-mail para criar a cópia editável
 * (POST /api/demo/fork). Ausente em sessão normal e em sessão já "forkada" —
 * a claim (cookie-marcador) é quem decide, nunca a rota atual.
 */
export function DemoSharedBanner() {
  const t = useTranslations("demo.shared")
  const tCommon = useTranslations("common")
  const shared = React.useSyncExternalStore(subscribeNoop, hasSharedDemoMarker, getServerSnapshot)
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [forking, setForking] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)

  if (!shared) return null

  const isValid = isValidLeadName(name.trim()) && isValidLeadEmail(email.trim().toLowerCase())

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isValid || forking) return

    setErro(null)
    setForking(true)
    try {
      const res = await fetch(DEMO_FORK_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase() }),
      })
      if (res.ok) {
        // Mantém forking=true: a navegação troca a tela antes de qualquer novo render.
        window.location.assign("/dashboard")
        return
      }
      if (res.status === 401) {
        // Sessão expirada: recarregar reprovisiona uma sessão de vitrine nova.
        window.location.reload()
        return
      }
      if (res.status === 422) {
        setErro(t("emailInvalid"))
        toast.error(t("emailInvalid"))
      } else if (res.status === 429) {
        setErro(t("rateLimited"))
        toast.error(t("rateLimited"))
      } else {
        setErro(tCommon("genericError"))
        toast.error(tCommon("genericError"))
      }
    } catch {
      setErro(tCommon("genericError"))
      toast.error(tCommon("genericError"))
    }
    setForking(false)
  }

  return (
    <div className="above-mobile-nav pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4 md:bottom-4">
      <div className="pointer-events-auto flex max-w-full items-center gap-3 rounded-2xl border bg-card px-4 py-2 shadow-lg sm:rounded-full">
        <Eye className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p role="status" className="text-sm text-muted-foreground">
          {t("banner")}
        </p>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            if (!forking) setOpen(next)
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">{t("cta")}</Button>
          </DialogTrigger>
          <DialogContent
            showCloseButton={!forking}
            onInteractOutside={(event) => {
              if (forking) event.preventDefault()
            }}
          >
            <DialogHeader>
              <DialogTitle>{t("confirmTitle")}</DialogTitle>
              <DialogDescription>{t("confirmDescription")}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="demo-fork-name">{t("nameLabel")}</Label>
                <Input
                  id="demo-fork-name"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(event) => {
                    setErro(null)
                    setName(event.target.value)
                  }}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="demo-fork-email">{t("emailLabel")}</Label>
                <Input
                  id="demo-fork-email"
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(event) => {
                    setErro(null)
                    setEmail(event.target.value)
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{t("notice")}</p>
              {erro && (
                <p role="alert" className="text-sm text-destructive">
                  {erro}
                </p>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={!isValid || forking}
                aria-busy={forking}
              >
                {forking ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t("forking")}
                  </>
                ) : (
                  t("cta")
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
