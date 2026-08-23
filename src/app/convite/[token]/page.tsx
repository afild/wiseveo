import { getInvitationPublicInfo } from "@/features/settings/services/invitations-service"
import { InviteAcceptForm } from "@/features/auth/components/InviteAcceptForm"
import { isGoogleConfigured } from "@/lib/google-auth"

export const dynamic = "force-dynamic"

/**
 * Página pública do convite: /convite/<token>.
 * Mostra o mínimo — quem convidou e uma pista do e-mail —, porque qualquer pessoa
 * com o link chega aqui. Quem entra de fato é só quem tiver o e-mail convidado.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const info = await getInvitationPublicInfo(token)

  return (
    <InviteAcceptForm
      token={token}
      status={info.status}
      inviterName={info.status === "ok" ? info.inviterName : null}
      maskedEmail={info.status === "ok" ? info.maskedEmail : null}
      showGoogle={info.status === "ok" && isGoogleConfigured()}
    />
  )
}
