"use client"

import React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { ArrowUp, Loader2, Sparkles, TrendingDown, TrendingUp, Wallet } from "lucide-react"
import type { AdvisorOpening } from "../services/advisor-opening.service"
import type { AdvisorStoredMessage } from "../services/advisor-chat.service"

interface AdvisorClientProps {
  opening: AdvisorOpening
  conversationId: string
  initialMessages: AdvisorStoredMessage[]
  /** Sem a tabela de conversas, responde mas não lembra — a tela avisa. */
  conversationsPersisted: boolean
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

/**
 * A página Advisor: abre com o retrato do mês (números prontos, sem IA) e um
 * chat com o MESMO agente do Telegram. Perguntar custa; abrir a página, não.
 */
export function AdvisorClient({
  opening,
  conversationId,
  initialMessages,
  conversationsPersisted,
}: AdvisorClientProps) {
  const t = useTranslations("advisor")
  const [messages, setMessages] = React.useState<ChatMessage[]>(
    initialMessages.map((message) => ({ role: message.role, content: message.content })),
  )
  const [question, setQuestion] = React.useState("")
  const [asking, setAsking] = React.useState(false)
  const endRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, asking])

  async function ask(text: string) {
    const trimmed = text.trim()
    if (!trimmed || asking) return

    setMessages((current) => [...current, { role: "user", content: trimmed }])
    setQuestion("")
    setAsking(true)
    try {
      const response = await fetch("/api/advisor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, conversationId }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) throw new Error(payload?.message ?? t("error"))
      setMessages((current) => [...current, { role: "assistant", content: payload.data.answer }])
    } catch (error) {
      const message = error instanceof Error ? error.message : t("error")
      toast.error(message)
      // A pergunta volta para o campo: ninguém perde o que escreveu.
      setMessages((current) => current.slice(0, -1))
      setQuestion(trimmed)
    } finally {
      setAsking(false)
    }
  }

  const suggestions = [t("suggestions.status"), t("suggestions.month"), t("suggestions.upcoming")]

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4">
      {/* Retrato do mês — números prontos, sem custo de IA */}
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="size-3.5 text-positive" />
              {t("opening.income")}
            </p>
            <p className="text-lg font-semibold">{opening.income}</p>
          </div>
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingDown className="size-3.5 text-destructive" />
              {t("opening.expense")}
            </p>
            <p className="text-lg font-semibold">{opening.expense}</p>
          </div>
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wallet className="size-3.5 text-info" />
              {t("opening.savings")}
            </p>
            <p
              className={`text-lg font-semibold ${
                opening.savingsIsPositive ? "text-positive" : "text-destructive"
              }`}
            >
              {opening.savings}
            </p>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-3">
            {opening.upcomingCount > 0
              ? t("opening.upcoming", { count: opening.upcomingCount, total: opening.upcomingTotal })
              : t("opening.upcomingNone")}
          </p>
        </CardContent>
      </Card>

      {!conversationsPersisted && (
        <p className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          {t("notPersisted")}
        </p>
      )}

      {/* Conversa */}
      <div className="flex-1 space-y-3">
        {messages.length === 0 && !asking && (
          <div className="space-y-3 py-6 text-center">
            <Sparkles className="mx-auto size-6 text-primary" />
            <p className="text-sm text-muted-foreground">{t("emptyState")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((suggestion) => (
                <Button
                  key={suggestion}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="cursor-pointer"
                  onClick={() => ask(suggestion)}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={`${index}-${message.role}`}
            className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "border bg-muted/40"
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}

        {asking && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {t("thinking")}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Pergunta */}
      <form
        className="sticky bottom-4 flex items-end gap-2 rounded-2xl border bg-background/95 p-2 shadow-sm backdrop-blur"
        onSubmit={(event) => {
          event.preventDefault()
          ask(question)
        }}
      >
        <Textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            // Enter envia; Shift+Enter quebra linha.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              ask(question)
            }
          }}
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
          rows={1}
          className="max-h-40 min-h-[2.5rem] resize-none border-0 shadow-none focus-visible:ring-0"
        />
        <Button
          type="submit"
          size="icon"
          className="cursor-pointer"
          disabled={!question.trim() || asking}
          aria-label={t("send")}
        >
          {asking ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
        </Button>
      </form>
    </div>
  )
}
