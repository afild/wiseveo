"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldSeparator,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Logo } from "@/components/logo"
import { Wordmark } from "@/components/wordmark"
import { useLoginForm } from "../hooks/useLoginForm"
import { useSignupForm } from "../hooks/useSignupForm"
import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { LocaleSwitcher } from "@/components/locale-switcher"

function GoogleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="size-5">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

function LoginTabContent({ showGoogle }: { showGoogle: boolean }) {
  const t = useTranslations("auth")
  const {
    formData,
    errors,
    touched,
    isSubmitting,
    serverError,
    successMessage,
    handleChange,
    handleBlur,
    handleSubmit,
  } = useLoginForm()

  return (
    <div className="flex flex-col gap-4 pt-4">
      {successMessage && (
        <div className="rounded-md bg-positive/10 p-3 text-center text-sm text-positive">
          {successMessage}
        </div>
      )}
      {serverError && (
        <div className="rounded-md bg-destructive/10 p-3 text-center text-sm text-destructive">
          {serverError}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="login-email">{t("email")}</FieldLabel>
            <Input
              id="login-email"
              type="email"
              placeholder="m@example.com"
              required
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              onBlur={() => handleBlur("email")}
            />
            {touched.email && errors.email && (
              <FieldDescription className="text-destructive">
                {errors.email}
              </FieldDescription>
            )}
          </Field>
          <Field>
            <div className="flex items-center">
              <FieldLabel htmlFor="login-password">{t("password")}</FieldLabel>
              <a
                href="#"
                className="ml-auto text-sm underline-offset-4 hover:underline"
              >
                {t("login.forgotPassword")}
              </a>
            </div>
            <Input
              id="login-password"
              type="password"
              required
              value={formData.password}
              onChange={(e) => handleChange("password", e.target.value)}
              onBlur={() => handleBlur("password")}
            />
            {touched.password && errors.password && (
              <FieldDescription className="text-destructive">
                {errors.password}
              </FieldDescription>
            )}
          </Field>
          <Field>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? t("login.loggingIn") : t("login.button")}
            </Button>
          </Field>
          {showGoogle && (
            <>
              <FieldSeparator>{t("orContinueWith")}</FieldSeparator>
              <Field>
                <Button
                  variant="outline"
                  type="button"
                  className="w-full"
                  onClick={() => {
                    window.location.href = "/api/auth/google"
                  }}
                >
                  <GoogleIcon />
                  {t("google")}
                </Button>
              </Field>
            </>
          )}
        </FieldGroup>
      </form>
    </div>
  )
}

function SignupTabContent({ showGoogle }: { showGoogle: boolean }) {
  const t = useTranslations("auth")
  const {
    formData,
    confirmPassword,
    errors,
    touched,
    isSubmitting,
    serverError,
    successMessage,
    handleChange,
    handleConfirmPasswordChange,
    handleBlur,
    handleSubmit,
  } = useSignupForm()

  return (
    <div className="flex flex-col gap-4 pt-4">
      {successMessage && (
        <div className="rounded-md bg-positive/10 p-3 text-center text-sm text-positive">
          {successMessage}
        </div>
      )}
      {serverError && (
        <div className="rounded-md bg-destructive/10 p-3 text-center text-sm text-destructive">
          {serverError}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="signup-name">{t("signup.fullName")}</FieldLabel>
            <Input
              id="signup-name"
              type="text"
              placeholder={t("signup.namePlaceholder")}
              required
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              onBlur={() => handleBlur("name")}
            />
            {touched.name && errors.name && (
              <FieldDescription className="text-destructive">
                {errors.name}
              </FieldDescription>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor="signup-email">{t("email")}</FieldLabel>
            <Input
              id="signup-email"
              type="email"
              placeholder="m@example.com"
              required
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              onBlur={() => handleBlur("email")}
            />
            {touched.email && errors.email && (
              <FieldDescription className="text-destructive">
                {errors.email}
              </FieldDescription>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor="signup-password">{t("password")}</FieldLabel>
            <Input
              id="signup-password"
              type="password"
              required
              value={formData.password}
              onChange={(e) => handleChange("password", e.target.value)}
              onBlur={() => handleBlur("password")}
            />
            {touched.password && errors.password && (
              <FieldDescription className="text-destructive">
                {errors.password}
              </FieldDescription>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor="signup-confirm">{t("signup.confirmPassword")}</FieldLabel>
            <Input
              id="signup-confirm"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => handleConfirmPasswordChange(e.target.value)}
              onBlur={() => handleBlur("confirmPassword")}
            />
            {touched.confirmPassword && errors.confirmPassword && (
              <FieldDescription className="text-destructive">
                {errors.confirmPassword}
              </FieldDescription>
            )}
          </Field>
          <Field>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? t("signup.creatingAccount") : t("signup.button")}
            </Button>
          </Field>
          {showGoogle && (
            <>
              <FieldSeparator>{t("orContinueWith")}</FieldSeparator>
              <Field>
                <Button
                  variant="outline"
                  type="button"
                  className="w-full"
                  onClick={() => {
                    window.location.href = "/api/auth/google"
                  }}
                >
                  <GoogleIcon />
                  {t("google")}
                </Button>
              </Field>
            </>
          )}
        </FieldGroup>
      </form>
    </div>
  )
}

function GoogleErrorMessage({ error }: { error: string | null }) {
  const t = useTranslations("auth")

  if (!error) return null

  const messages: Record<string, string> = {
    google_denied: t("errors.google.denied"),
    invalid_state: t("errors.google.invalidState"),
    no_code: t("errors.google.noCode"),
    google_failed: t("errors.google.failed"),
    google_not_configured: t("errors.google.notConfigured"),
    signup_disabled: t("errors.google.signupDisabled"),
  }

  return (
    <div className="rounded-md bg-destructive/10 p-3 text-center text-sm text-destructive">
      {messages[error] || t("errors.genericAuth")}
    </div>
  )
}

interface AuthPageProps extends React.ComponentProps<"div"> {
  showGoogle?: boolean
  /** Instalação já configurada (tem banco). Sem isso, não há como autenticar: mostra "Configurar agora". */
  setupComplete?: boolean
  /** Cadastro público visível. Numa instância privada (WISEVEO_PUBLIC_SIGNUP=false) só o convite entra. */
  publicSignup?: boolean
}

/** Primeiro acesso (sem banco): a conta criada aqui será a do administrador; depois vem o Setup. */
function FirstAccessBanner() {
  const t = useTranslations("auth.firstAccess")
  return (
    <div className="mb-4 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
      <p className="font-medium">{t("title")}</p>
      <p className="text-muted-foreground text-xs mt-0.5">{t("desc")}</p>
    </div>
  )
}

export function AuthPage({
  className,
  showGoogle = false,
  setupComplete = true,
  publicSignup = true,
  ...props
}: AuthPageProps) {
  const t = useTranslations("auth")
  const [activeTab, setActiveTab] = useState(setupComplete ? "login" : "signup")
  const searchParams = useSearchParams()
  const googleError = searchParams.get("error")

  return (
    <div
      className={cn(
        "flex min-h-svh w-full items-center justify-center p-6 md:p-10",
        className
      )}
      {...props}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-6 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Logo size={28} />
            <Wordmark className="text-xl" />
          </div>
          <LocaleSwitcher />
        </div>

        <GoogleErrorMessage error={googleError} />

        {!setupComplete ? (
          <Card>
            <CardContent className="pt-6">
              <FirstAccessBanner />
              <h1 className="text-lg font-semibold text-center">{t("signup.tab")}</h1>
              <SignupTabContent showGoogle={showGoogle} />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              {publicSignup ? (
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="login">{t("login.tab")}</TabsTrigger>
                    <TabsTrigger value="signup">{t("signup.tab")}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="login">
                    <LoginTabContent showGoogle={showGoogle} />
                  </TabsContent>

                  <TabsContent value="signup">
                    <SignupTabContent showGoogle={showGoogle} />
                  </TabsContent>
                </Tabs>
              ) : (
                <>
                  <h1 className="text-lg font-semibold text-center">{t("login.tab")}</h1>
                  <LoginTabContent showGoogle={showGoogle} />
                </>
              )}
            </CardContent>
          </Card>
        )}

        {showGoogle && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            {t("googleSyncNote")}
          </p>
        )}
      </div>
    </div>
  )
}
