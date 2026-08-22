import { Suspense } from "react"
import { headers } from "next/headers"
import { AuthPage } from "@/features/auth/components/AuthPage"
import { getAppUrlFromHeaders } from "@/lib/app-url"
import { isGoogleConfigured } from "@/lib/google-auth"
import { isSetupComplete } from "@/lib/setup-check"
import { isPublicSignupEnabled } from "@/lib/public-signup"

export const dynamic = "force-dynamic"

export default async function LoginPage() {
  const setupComplete = isSetupComplete()
  // Google funciona também no primeiro acesso (só precisa de GOOGLE_CLIENT_ID/SECRET no ambiente).
  const showGoogle = isGoogleConfigured()
  // Origem do host atual: base dos redirect URIs que o guia "Ative o login com Google" mostra.
  const appUrl = getAppUrlFromHeaders(await headers())
  return (
    <Suspense>
      <AuthPage
        showGoogle={showGoogle}
        setupComplete={setupComplete}
        publicSignup={isPublicSignupEnabled()}
        appUrl={appUrl}
      />
    </Suspense>
  )
}
