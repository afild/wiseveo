"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Eye } from "lucide-react"
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
import { hasSharedDemoMarker } from "@/lib/demo-shared-client"
import { isValidLeadEmail, isValidLeadName } from "@/lib/demo-lead"

// Sem escuta: a claim não muda durante a vida do componente (forkar navega para
// /dashboard). useSyncExternalStore dispensa setState em efeito (padrão de
// use-fitted-column-sizing.ts) e mantém a hidratação idêntica nos dois lados —
// no servidor não há cookie, então o snapshot do servidor é sempre `false`.
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
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [forking, setForking] = React.useState(false)

  if (!shared) return null

  const valido = isValidLeadName(name.trim()) && isValidLeadEmail(email.trim().toLowerCase())

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valido || forking) return

    setForking(true)
    try {
      const res = await fetch("/api/demo/fork", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase() }),
      })
      if (res.ok) {
        // Mantém forking=true: a navegação troca a tela antes de qualquer novo render.
        window.location.assign("/dashboard")
        return
      }
      if (res.status === 422) {
        toast.error(t("emailInvalid"))
      } else if (res.status === 429) {
        toast.error(t("rateLimited"))
      } else {
        toast.error(tCommon("genericError"))
      }
    } catch {
      toast.error(tCommon("genericError"))
    }
    setForking(false)
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-full border bg-card px-4 py-2 shadow-lg">
        <Eye className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm text-muted-foreground">{t("banner")}</span>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm">{t("cta")}</Button>
          </DialogTrigger>
          <DialogContent>
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
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="demo-fork-email">{t("emailLabel")}</Label>
                <Input
                  id="demo-fork-email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">{t("notice")}</p>
              <Button type="submit" className="w-full" disabled={!valido || forking}>
                {forking ? t("forking") : t("cta")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
