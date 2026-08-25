import { experimental_transcribe as transcribe, generateText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import {
  estimateAudioPromptCostMicroUsd,
  estimateTranscriptionCostMicroUsd,
} from "../lib/catalog"
import { getAiConfig } from "./ai-config.service"
import { assertWithinAiBudget, recordAiUsageCost } from "./ai-usage.service"
import { AiNotConfiguredError } from "./llm.service"

/**
 * Áudio → texto. Quem manda mensagem de voz no Telegram passa por aqui antes de
 * o agente ver a pergunta: a partir daí, é uma pergunta escrita como outra
 * qualquer.
 *
 * Dois caminhos, pela ordem:
 * 1. OpenAI, que tem modelo dedicado de transcrição (barato e bom);
 * 2. Google, que não tem modelo dedicado no SDK mas entende áudio direto no
 *    pedido de texto — serve de reserva sem prender a instalação a um provedor.
 *
 * Respeita o teto do mês ANTES de gastar e registra o custo depois. A cobrança
 * aqui é por MINUTO de áudio, não por token.
 */

const OPENAI_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe"
const GOOGLE_AUDIO_MODEL = "gemini-2.0-flash"

/** Instrução usada só no caminho de reserva (o Google não tem modo transcrição). */
const GOOGLE_TRANSCRIBE_PROMPT =
  // i18n-ignore: instrução para o MODELO, não é texto de UI
  "Transcreva este áudio literalmente, no idioma falado. Responda APENAS com a transcrição, sem comentários, sem aspas e sem tradução."

export interface TranscriptionInput {
  audio: Uint8Array
  /** Tipo do arquivo (o Telegram manda ogg/opus). */
  mimeType: string
  /** Duração informada pelo canal, para estimar o custo. */
  durationSeconds?: number
}

export class AudioNotSupportedError extends Error {
  constructor() {
    // i18n-ignore: erro interno tipado; o canal traduz o aviso
    super("No provider configured for audio transcription")
    this.name = "AudioNotSupportedError"
  }
}

export async function transcribeAudio(input: TranscriptionInput): Promise<string> {
  await assertWithinAiBudget()
  const config = await getAiConfig()

  if (config.keys.openai) {
    const openai = createOpenAI({ apiKey: config.keys.openai })
    const result = await transcribe({
      model: openai.transcription(OPENAI_TRANSCRIPTION_MODEL),
      audio: input.audio,
    })
    const seconds = result.durationInSeconds ?? input.durationSeconds ?? 0
    await recordAiUsageCost({
      provider: "openai",
      model: OPENAI_TRANSCRIPTION_MODEL,
      costMicroUsd: estimateTranscriptionCostMicroUsd(OPENAI_TRANSCRIPTION_MODEL, seconds),
    })
    return result.text.trim()
  }

  if (config.keys.google) {
    const google = createGoogleGenerativeAI({ apiKey: config.keys.google })
    const result = await generateText({
      model: google(GOOGLE_AUDIO_MODEL),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: GOOGLE_TRANSCRIBE_PROMPT },
            { type: "file", data: input.audio, mediaType: input.mimeType },
          ],
        },
      ],
    })
    const inputTokens = result.usage?.inputTokens ?? 0
    const outputTokens = result.usage?.outputTokens ?? 0
    await recordAiUsageCost({
      provider: "google",
      model: GOOGLE_AUDIO_MODEL,
      inputTokens,
      outputTokens,
      // Aqui a entrada é ÁUDIO, que custa bem mais que texto: cobrar pela
      // tabela de texto subestimaria o gasto em várias vezes.
      costMicroUsd: estimateAudioPromptCostMicroUsd(GOOGLE_AUDIO_MODEL, inputTokens, outputTokens),
    })
    return result.text.trim()
  }

  throw new AudioNotSupportedError()
}

/** A instalação consegue entender áudio? (a tela e o bot avisam quando não.) */
export async function isAudioTranscriptionAvailable(): Promise<boolean> {
  const config = await getAiConfig()
  return Boolean(config.keys.openai || config.keys.google)
}
