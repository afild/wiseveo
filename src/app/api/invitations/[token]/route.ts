import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { getInvitationPublicInfo } from "@/features/settings/services/invitations-service"

export const dynamic = "force-dynamic"

/**
 * O que a página do convite mostra a quem tem o link: quem convidou e uma pista do
 * e-mail. Rota pública por necessidade — por isso devolve o mínimo, e um convite
 * inválido, vencido ou cancelado responde igual para qualquer pessoa.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return new NextResponse(null, { status: 404 })
  try {
    const { token } = await params
    const info = await getInvitationPublicInfo(token)
    return NextResponse.json({ success: info.status === "ok", data: info })
  } catch (error) {
    console.error("[api/invitations/[token]] error:", error)
    const t = await getTranslations("api.errors")
    return NextResponse.json({ success: false, message: t("internalError") }, { status: 500 })
  }
}
