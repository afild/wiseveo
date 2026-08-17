import { Suspense } from "react"
import { AuthPage } from "@/features/auth/components/AuthPage"
import { isGoogleConfigured } from "@/lib/google-auth"
import { isSetupComplete } from "@/lib/setup-check"
import { isPublicSignupEnabled } from "@/lib/public-signup"

export const dynamic = "force-dynamic"

export default function LoginPage() {
  const setupComplete = isSetupComplete()
  const showGoogle = setupComplete && isGoogleConfigured()
  return (
    <Suspense>
      <AuthPage showGoogle={showGoogle} setupComplete={setupComplete} publicSignup={isPublicSignupEnabled()} />
    </Suspense>
  )
}
