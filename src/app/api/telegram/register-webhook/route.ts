import { NextRequest, NextResponse } from "next/server"
import {
  getTelegramBotConfig,
  registerTelegramWebhook,
  resolveWebhookBaseUrl,
} from "@/features/telegram/services/telegram-config.service"

/**
 * Rota de operação (linha de comando/diagnóstico): re-registra o webhook usando a
 * configuração vigente. A tela de Configurações → Integrações faz isso sozinha ao
 * conectar — esta rota fica como ferramenta manual para instalações que ainda usam
 * as envs TELEGRAM_* (na configuração pelo banco, o segredo é gerado e nunca
 * exibido, então só a tela re-registra).
 *
 * O segredo vem no CABEÇALHO `Authorization: Bearer` — nunca na URL: query string
 * cai em log de acesso da hospedagem, e este é o segredo que autentica o webhook.
 */
export async function GET(request: NextRequest) {
  const config = await getTelegramBotConfig()
  const authorization = request.headers.get("authorization")
  const secret = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null

  // 403 primeiro e sempre — inclusive sem configuração: quem não tem o segredo
  // não descobre nem SE o bot está configurado.
  if (!config?.webhookSecret || !secret || secret !== config.webhookSecret) {
    // i18n-ignore: endpoint de ops — resposta para quem chama sem o segredo
    return new NextResponse("Forbidden", { status: 403 })
  }

  const baseUrl = resolveWebhookBaseUrl(request)
  if (!baseUrl || !baseUrl.startsWith("https://")) {
    // i18n-ignore: endpoint de ops — o Telegram só aceita webhook HTTPS
    return NextResponse.json({ error: "Webhook base URL must be HTTPS" }, { status: 500 })
  }

  const result = await registerTelegramWebhook({
    token: config.botToken,
    webhookSecret: config.webhookSecret,
    baseUrl,
  })

  if (!result.ok) {
    // i18n-ignore: endpoint de ops — repassa a descrição do Telegram (não contém o token)
    return NextResponse.json({ error: "Failed to register webhook", details: result.description }, { status: 502 })
  }

  return NextResponse.json({
    ok: true,
    // i18n-ignore: endpoint de ops/deploy, chamado manualmente por um dev — nunca renderizado em UI
    message: "Webhook registered successfully",
    webhook_url: `${baseUrl}/api/telegram/webhook`,
  })
}
