"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Logo } from "@/components/logo"
import { Wordmark } from "@/components/wordmark"
import { LocaleSwitcher } from "@/components/locale-switcher"
import { Loader2, MailX, UserPlus } from "lucide-react"

type InviteStatus = "ok" | "invalid" | "expired" | "accepted" | "revoked"

interface InviteAcceptFormProps {
  token: string
  status: InviteStatus
  inviterName: string | null
  /** Pista do e-mail convidado (c••••••@example.com) — nunca o endereço inteiro. */
  maskedEmail: string | null
  showGoogle: boolean
}

function GoogleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="size-5">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

/**
 * Aceite de convite: "<Fulano> convidou você para a conta WISEVEO dele".
 * Nome + senha (ou Google) → entra direto no dashboard, já dentro da conta.
 *
 * O campo de e-mail começa VAZIO de propósito: o convite é preso a um endereço, e
 * quem tem só o link não deve descobrir qual é — a tela dá apenas uma pista.
 */
export function InviteAcceptForm({ token, status, inviterName, maskedEmail, showGoogle }: InviteAcceptFormProps) {
  const t = useTranslations("invite")
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const passwordMismatch = confirm.length > 0 && password !== confirm
  // Sem isto, uma senha curta apenas deixava o botão cinza, sem explicar nada — e esta
  // é a primeira tela da pessoa no sistema, sem ninguém a quem perguntar.
  const passwordTooShort = password.length > 0 && password.length < 8
  const canSubmit = name.trim().length > 0 && email.trim().length > 0 && password.length >= 8 && password === confirm

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/invitations/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setError(data.message || t("errors.generic"))
        return
      }
      router.push("/dashboard")
      router.refresh()
    } catch {
      setError(t("errors.generic"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Logo size={28} />
            <Wordmark className="text-xl" />
          </div>
          <LocaleSwitcher />
        </div>

        <Card>
          <CardContent className="pt-6">
            {status !== "ok" ? (
              <div className="flex flex-col items-center gap-3 text-center py-4">
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                  <MailX className="size-6 text-destructive" />
                </div>
                <h1 className="text-lg font-semibold">{t(`unusable.${status}.title`)}</h1>
                <p className="text-sm text-muted-foreground">{t(`unusable.${status}.desc`)}</p>
                <Button asChild variant="outline" className="mt-2">
                  <a href="/login">{t("goToLogin")}</a>
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
                    <UserPlus className="size-6 text-primary" />
                  </div>
                  <h1 className="text-lg font-semibold">
                    {t.rich("title", { name: inviterName ?? "", strong: (chunks) => <strong>{chunks}</strong> })}
                  </h1>
                  <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
                </div>

                {error && (
                  <div className="rounded-md bg-destructive/10 p-3 text-center text-sm text-destructive">{error}</div>
                )}

                <form onSubmit={handleSubmit}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="invite-name">{t("name")}</FieldLabel>
                      <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="invite-email">{t("email")}</FieldLabel>
                      <Input
                        id="invite-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        required
                      />
                      {maskedEmail && <p className="text-xs text-muted-foreground">{t("emailHint", { masked: maskedEmail })}</p>}
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="invite-password">{t("password")}</FieldLabel>
                      <Input
                        id="invite-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        minLength={8}
                        aria-invalid={passwordTooShort}
                        aria-describedby="invite-password-hint"
                        required
                      />
                      <p
                        id="invite-password-hint"
                        className={passwordTooShort ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
                      >
                        {t("passwordHint")}
                      </p>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="invite-confirm">{t("confirmPassword")}</FieldLabel>
                      <Input
                        id="invite-confirm"
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        autoComplete="new-password"
                        aria-invalid={passwordMismatch}
                        required
                      />
                      {passwordMismatch && <p className="text-xs text-destructive">{t("errors.passwordMismatch")}</p>}
                    </Field>
                    <Field>
                      <Button type="submit" className="w-full cursor-pointer" disabled={!canSubmit || submitting}>
                        {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                        {t("accept")}
                      </Button>
                    </Field>
                    {showGoogle && (
                      <>
                        <FieldSeparator>{t("or")}</FieldSeparator>
                        <Field>
                          <Button asChild variant="outline" type="button" className="w-full cursor-pointer">
                            <a href={`/api/auth/google?invite=${encodeURIComponent(token)}`}>
                              <GoogleIcon />
                              {t("continueWithGoogle")}
                            </a>
                          </Button>
                        </Field>
                      </>
                    )}
                  </FieldGroup>
                </form>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
