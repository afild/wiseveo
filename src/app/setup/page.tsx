import { redirect } from "next/navigation"
import { SetupWizard } from "@/features/setup/components/setup-wizard"
import { isSetupComplete } from "@/lib/setup-check"
import { isSuperAdminSession } from "@/lib/setup-access"

export const dynamic = "force-dynamic"

export default async function SetupPage() {
  const reconfiguring = isSetupComplete()
  // Instalação já configurada: o wizard reabre só para o SUPERADMIN logado
  // ("Reconfigurar"); o middleware já mandou anônimos para o login.
  if (reconfiguring && !(await isSuperAdminSession())) redirect("/dashboard")
  return <SetupWizard reconfiguring={reconfiguring} />
}
