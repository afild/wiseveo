import { getInvitationPublicInfo } from "@/features/settings/services/invitations-service"
import { InviteAcceptForm } from "@/features/auth/components/InviteAcceptForm"
import { isGoogleConfigured } from "@/lib/google-auth"

export const dynamic = "force-dynamic"

/** Página pública do convite: /convite/<token>. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const info = await getInvitationPublicInfo(token)

  return (
    <InviteAcceptForm
      token={token}
      status={info.status}
      inviterName={info.status === "ok" ? info.inviterName : null}
      suggestedEmail={info.status === "ok" ? info.email : null}
      showGoogle={info.status === "ok" && isGoogleConfigured()}
    />
  )
}
