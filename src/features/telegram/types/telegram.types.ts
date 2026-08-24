import type { AgentToolContext, AgentTranslator } from "@/features/ai/types/agent.types"

/** Translator bound to the "telegram" namespace, resolved once per incoming
 * message in message-handler.service.ts and threaded down to every service
 * that produces user-visible text (single resolution point — see CLAUDE.md).
 * A definição vive na camada de IA: as mesmas ferramentas servem outros canais. */
export type TelegramTranslator = AgentTranslator

/** Per-request context (locale-aware translator, UI locale, and the user's
 * monetary formatting preference) threaded through the tool-dispatch chain so
 * every service/tool can produce localized text without re-resolving it. */
export type TelegramToolContext = AgentToolContext

export interface TelegramConnectionStatus {
  connected: boolean;
  configured?: boolean;
  username?: string;
  connectedAt?: string;
}

export interface TelegramConnectResponse {
  token: string;
  deepLink: string;
}

export type CardType = 'summary' | 'list' | 'category' | 'comparison' | 'single-value' | 'error';

export interface CardItem {
  label: string;
  value: string;
  detail?: string;
  progress?: number;
  tone?: 'default' | 'positive' | 'negative' | 'warning';
}

export interface CardData {
  type: CardType;
  headline: string;
  eyebrow?: string;
  value?: string;
  trend?: string;
  insight?: string;
  items?: CardItem[];
  progress?: number;
}

export type TelegramChatId = number | string;

export interface TelegramWebhookMessage {
  message_id?: number;
  text?: string;
  chat: {
    id: TelegramChatId;
  };
  from?: {
    username?: string;
  };
}

export interface TelegramWebhookUpdate {
  update_id?: number;
  message?: TelegramWebhookMessage;
}
