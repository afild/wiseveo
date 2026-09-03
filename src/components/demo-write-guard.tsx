"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { DEMO_FORK_PATH, DEMO_FORK_REQUIRED_HEADER } from "@/lib/demo-shared"
import { installFetchInterceptor } from "@/lib/fetch-interceptors"
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
 * Interceptor global de escrita da vitrine + janela de "crie sua cópia".
 * Ausente em sessão normal e em sessão já "forkada" — a claim (cookie-marcador)
 * é quem decide, nunca a rota atual. Não há cliente central de fetch (98
 * chamadas cruas em 45 arquivos), então um host único embrulha window.fetch e
 * este componente só registra um handler nele: qualquer
 * tentativa de escrita (inclusive as server actions de orçamento, que POSTam
 * na própria página) volta 409 + DEMO_FORK_REQUIRED_HEADER do middleware, e é
 * aqui que a janela abre — no momento em que a pessoa TENTA editar, não antes.
 */
export function DemoWriteGuard() {
  const t = useTranslations("demo.shared")
  const tCommon = useTranslations("common")
  const shared = React.useSyncExternalStore(subscribeNoop, hasSharedDemoMarker, getServerSnapshot)
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [forking, setForking] = React.useState(false)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!shared) return
    // Registra um handler no host único de fetch (src/lib/fetch-interceptors.ts) em vez de
    // embrulhar window.fetch aqui: o cleanup antigo restaurava o fetch anterior e apagaria o
    // embrulho do fechamento de datas. Ordem 10 = primeiro da fila; na vitrine a cerca
    // responde 409 antes de qualquer 423. Toda tentativa de escrita da vitrine volta 409 +
    // cabeçalho; aí a janela assume e a resposta original é descartada com uma promise que
    // NUNCA resolve — quem chamou fica pendurado de propósito, porque sair da janela SEMPRE
    // recarrega/navega (tela limpa).
    return installFetchInterceptor(
      {
        after: async (res) => {
          if (res.status === 409 && res.headers.get(DEMO_FORK_REQUIRED_HEADER) === "1") {
            setOpen(true)
            return new Promise<Response>(() => {})
          }
          return null
        },
      },
      10,
    )
  }, [shared])

  if (!shared) return null

  const isValid = isValidLeadName(name.trim()) && isValidLeadEmail(email.trim().toLowerCase())

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isValid || forking) return

    setErrorMsg(null)
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
        setErrorMsg(t("emailInvalid"))
        toast.error(t("emailInvalid"))
      } else if (res.status === 429) {
        setErrorMsg(t("rateLimited"))
        toast.error(t("rateLimited"))
      } else {
        setErrorMsg(tCommon("genericError"))
        toast.error(tCommon("genericError"))
      }
    } catch {
      setErrorMsg(tCommon("genericError"))
      toast.error(tCommon("genericError"))
    }
    setForking(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (forking) return
        if (!next) {
          // Fechar (X, escape, clique fora) SEMPRE recarrega: garante tela limpa,
          // já que a tentativa de escrita original ficou pendurada de propósito.
          window.location.reload()
          return
        }
        setOpen(next)
      }}
    >
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
                setErrorMsg(null)
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
                setErrorMsg(null)
                setEmail(event.target.value)
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("notice")}</p>
          {errorMsg && (
            <p role="alert" className="text-sm text-destructive">
              {errorMsg}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={forking}
              onClick={() => window.location.reload()}
            >
              {t("keepExploring")}
            </Button>
            <Button type="submit" disabled={!isValid || forking} aria-busy={forking}>
              {forking ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("forking")}
                </>
              ) : (
                t("cta")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
