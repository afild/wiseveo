"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UserPlus, Eye, EyeOff, CheckCircle2, KeyRound } from "lucide-react"

export interface SetupIdentitySummary {
  name: string
  email: string
  provider: "password" | "google"
}

interface AdminStepProps {
  admin: { name: string; email: string; password: string; confirmPassword: string }
  onAdminChange: (field: string, value: string) => void
  onNext: () => void
  onBack: () => void
  /** Conta criada na página de cadastro (primeiro acesso): o passo vira só confirmação. */
  identity?: SetupIdentitySummary
}

function GoogleMark() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="size-4">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

export function AdminStep({
 admin, onAdminChange, onNext, onBack, identity }: AdminStepProps) {
  const t = useTranslations("setup.admin")
  const tc = useTranslations("setup.common")
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Primeiro acesso: a conta já foi criada na página de cadastro — só confirma.
  if (identity) {
    return (
      <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
        <div className="text-center">
          <div className="inline-flex p-3 rounded-xl bg-primary/10 border border-primary/20 mb-3">
            <UserPlus className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-2xl font-bold">{t("title")}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{t("identity.subtitle")}</p>
        </div>

        <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
          <div className="flex items-center gap-2 text-positive font-medium text-sm">
            <CheckCircle2 className="size-4" />
            {t("identity.ready")}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">{t("nameLabel")}</dt>
            <dd className="font-medium">{identity.name}</dd>
            <dt className="text-muted-foreground">{t("emailLabel")}</dt>
            <dd className="font-medium">{identity.email}</dd>
            <dt className="text-muted-foreground">{t("identity.signInWith")}</dt>
            <dd className="font-medium flex items-center gap-1.5">
              {identity.provider === "google" ? <GoogleMark /> : <KeyRound className="size-4 text-muted-foreground" />}
              {identity.provider === "google" ? t("identity.google") : t("identity.password")}
            </dd>
          </dl>
          <p className="text-xs text-muted-foreground">{t("identity.hint")}</p>
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onBack} className="flex-1">
            {tc("back")}
          </Button>
          <Button onClick={onNext} className="flex-1">
            {tc("next")}
          </Button>
        </div>
      </div>
    )
  }

  const validate = () => {
    const newErrors: Record<string, string> = {}
    if (!admin.name.trim()) newErrors.name = t("errors.nameRequired")
    if (!admin.email.trim()) newErrors.email = t("errors.emailRequired")
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.email))
      newErrors.email = t("errors.emailInvalid")
    if (!admin.password) newErrors.password = t("errors.passwordRequired")
    else if (admin.password.length < 6)
      newErrors.password = t("errors.passwordMin")
    if (admin.password !== admin.confirmPassword)
      newErrors.confirmPassword = t("errors.passwordMismatch")

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (validate()) onNext()
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="text-center">
        <div className="inline-flex p-3 rounded-xl bg-primary/10 border border-primary/20 mb-3">
          <UserPlus className="w-6 h-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("subtitle")}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="admin-name">{t("nameLabel")}</Label>
          <Input
            id="admin-name"
            value={admin.name}
            onChange={(e) => onAdminChange("name", e.target.value)}
            placeholder={t("namePlaceholder")}
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="admin-email">{t("emailLabel")}</Label>
          <Input
            id="admin-email"
            type="email"
            value={admin.email}
            onChange={(e) => onAdminChange("email", e.target.value)}
            placeholder={t("emailPlaceholder")}
          />
          {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="admin-password">{t("passwordLabel")}</Label>
          <div className="relative">
            <Input
              id="admin-password"
              type={showPassword ? "text" : "password"}
              value={admin.password}
              onChange={(e) => onAdminChange("password", e.target.value)}
              placeholder={t("passwordPlaceholder")}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="admin-confirm">{t("confirmPasswordLabel")}</Label>
          <Input
            id="admin-confirm"
            type={showPassword ? "text" : "password"}
            value={admin.confirmPassword}
            onChange={(e) => onAdminChange("confirmPassword", e.target.value)}
            placeholder={t("confirmPasswordPlaceholder")}
          />
          {errors.confirmPassword && (
            <p className="text-xs text-destructive">{errors.confirmPassword}</p>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack} className="flex-1">
          {tc("back")}
        </Button>
        <Button onClick={handleNext} className="flex-1">
          {tc("next")}
        </Button>
      </div>
    </div>
  )
}
