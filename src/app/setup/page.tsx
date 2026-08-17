import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { SetupWizard } from "@/features/setup/components/setup-wizard"
import { isSetupComplete } from "@/lib/setup-check"
import { isSuperAdminSession } from "@/lib/setup-access"
import { decodeSetupIdentity, SETUP_IDENTITY_COOKIE } from "@/lib/setup-identity"

export const dynamic = "force-dynamic"

export default async function SetupPage() {
  const reconfiguring = isSetupComplete()

  if (reconfiguring) {
    // Instalação já configurada: o wizard reabre só para o SUPERADMIN logado
    // ("Reconfigurar"); o middleware já mandou anônimos para o login.
    if (!(await isSuperAdminSession())) redirect("/dashboard")
    return <SetupWizard reconfiguring />
  }

  // Primeiro acesso: a conta do administrador é criada ANTES, na página de
  // cadastro (e-mail+senha ou Google). Sem essa identidade, volta para lá.
  const cookieStore = await cookies()
  const identity = await decodeSetupIdentity(cookieStore.get(SETUP_IDENTITY_COOKIE)?.value)
  if (!identity) redirect("/login")

  return (
    <SetupWizard
      identity={{ name: identity.name, email: identity.email, provider: identity.provider }}
    />
  )
}
