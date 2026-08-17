import { NextResponse } from "next/server"
import { getInvitationPublicInfo } from "@/features/settings/services/invitations-service"

export const dynamic = "force-dynamic"

/** Público: só o necessário para a página /convite/<token> (nome de quem convidou, papel). */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return new NextResponse(null, { status: 404 })
  const { token } = await params
  const info = await getInvitationPublicInfo(token)
  return NextResponse.json({ success: info.status === "ok", ...info })
}
