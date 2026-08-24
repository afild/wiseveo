import type { ToolExecutionOptions } from "ai"
import { getTools } from "@/features/ai/tools"
import type { TelegramToolContext } from "../types/telegram.types"

interface ExecutableTelegramTool {
  execute?: (input: unknown, options: ToolExecutionOptions) => unknown | Promise<unknown>
}

export function createTelegramToolSet(userId: string, ctx: TelegramToolContext) {
  return getTools(userId, ctx)
}

export async function executeTelegramTool(
  userId: string,
  toolName: string,
  input: unknown,
  ctx: TelegramToolContext,
) {
  const tools = getTools(userId, ctx) as Record<string, ExecutableTelegramTool>
  const selectedTool = tools[toolName]

  if (!selectedTool?.execute) {
    // Internal diagnostic error (unknown tool name) — never reaches the
    // Telegram user; callers catch and surface bot.genericError instead.
    throw new Error(`Telegram tool not found: ${toolName}`) // i18n-ignore
  }

  return selectedTool.execute(input, {
    toolCallId: `telegram-${toolName}`,
    messages: [],
  })
}
