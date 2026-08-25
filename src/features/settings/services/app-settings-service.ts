import { Client } from "pg"
import { prisma } from "@/lib/prisma"
import { decryptSecret, encryptSecret } from "@/lib/secret-cipher"
import {
  classifyConnectionError,
  type DbConnectionErrorCode,
} from "@/features/setup/services/db-connection.service"
import { describeConnectionError, isAdditiveOnly } from "./shared-account-service"
import {
  INTEGRATION_TABLES,
  checkAppSettingsStructure,
  type AppSettingsStructure,
} from "../lib/app-settings-structure"

/**
 * As tabelas das integrações: `app_settings` (segredos cifrados —
 * src/lib/secret-cipher.ts — token do bot do Telegram e chaves de IA),
 * `ai_usage` (consumo de IA por mês, para o teto de gasto), `advisor_messages`
 * (conversas do Advisor), `notification_deliveries` (o que já foi enviado, para
 * o boletim sair uma vez só) e `kpi_snapshots` (a foto mensal dos indicadores).
 * Nascem em instalação nova pela migração inicial; em banco existente, SÓ pelo
 * "Preparar meu banco" da aba Integrações — aditivo, aplicado pelo app, com a
 * confirmação do dono (o mesmo padrão dos convites, `shared-account-service.ts`).
 *
 * O SQL vive aqui, e não num arquivo lido em tempo de execução, porque em
 * hospedagem serverless o repositório pode não acompanhar a função. O arquivo
 * `prisma/additive/2026-08-23-app-settings.sql` continua no repositório para a
 * linha de comando — `tests/app-settings-structure.test.ts` garante que os dois
 * (e a migração inicial) nunca divirjam.
 */
export const APP_SETTINGS_SQL = `BEGIN;

CREATE TABLE IF NOT EXISTS "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "ai_usage" (
    "period" CHAR(6) NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "input_tokens" BIGINT NOT NULL DEFAULT 0,
    "output_tokens" BIGINT NOT NULL DEFAULT 0,
    "cost_micro_usd" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("period","provider","model")
);

CREATE TABLE IF NOT EXISTS "advisor_messages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advisor_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "advisor_messages_user_id_conversation_id_created_at_idx" ON "advisor_messages"("user_id", "conversation_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advisor_messages_user_id_fkey') THEN
    ALTER TABLE "advisor_messages" ADD CONSTRAINT "advisor_messages_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "notification_deliveries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "occurrence_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'claimed',
    "detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notification_deliveries_user_id_created_at_idx" ON "notification_deliveries"("user_id", "created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "notification_deliveries_user_id_kind_occurrence_key_key" ON "notification_deliveries"("user_id", "kind", "occurrence_key");

CREATE TABLE IF NOT EXISTS "kpi_snapshots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "period" CHAR(6) NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "kpi_snapshots_user_id_period_key" ON "kpi_snapshots"("user_id", "period");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_deliveries_user_id_fkey') THEN
    ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kpi_snapshots_user_id_fkey') THEN
    ALTER TABLE "kpi_snapshots" ADD CONSTRAINT "kpi_snapshots_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;`

export class AppSettingsError extends Error {
  constructor(
    public readonly code: "notAdditive" | "noConnection" | "applyFailed" | "stillMissing" | "tableMissing",
    public readonly detail?: string,
    /** Falha ao CONECTAR: código estável (os mesmos do Setup), para a tela explicar o motivo. */
    public readonly connectionCode?: DbConnectionErrorCode,
  ) {
    super(code)
    this.name = "AppSettingsError"
  }
}

/** Tabela mapeada mas ausente no banco físico (instalação ainda não preparada). */
function isTableMissing(error: unknown): boolean {
  return Boolean(error) && (error as { code?: string }).code === "P2021"
}

/** O que o banco JÁ tem (só leitura, pelo cliente normal do app). */
export async function readAppSettingsStructure(): Promise<AppSettingsStructure> {
  const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY(${[...INTEGRATION_TABLES]})
  `
  return checkAppSettingsStructure({ existingTables: rows.map((row) => row.table_name) })
}

/**
 * Aplica a estrutura. Conexão DIRETA quando existir (`DIRECT_URL`): DDL por um
 * pooler em modo transação é território escorregadio. Confere de novo no fim —
 * "aplicado" só se o banco realmente passou a ter a tabela.
 */
export async function applyAppSettingsStructure(
  env: NodeJS.ProcessEnv = process.env,
): Promise<AppSettingsStructure> {
  if (!isAdditiveOnly(APP_SETTINGS_SQL)) {
    throw new AppSettingsError("notAdditive")
  }
  const connectionString = env.DIRECT_URL || env.DATABASE_URL
  if (!connectionString) throw new AppSettingsError("noConnection")

  const client = new Client({ connectionString, connectionTimeoutMillis: 20000 })

  // Conectar FORA do try do comando: um cliente que morreu no aperto de mão aceita
  // novas consultas na fila e nunca as responde — travaria a requisição para sempre.
  try {
    await client.connect()
  } catch (error) {
    throw new AppSettingsError(
      "applyFailed",
      describeConnectionError(error),
      classifyConnectionError(error, connectionString),
    )
  }

  try {
    // O próprio SQL abre e fecha a transação; se falhar, o Postgres aborta o lote.
    await client.query(APP_SETTINGS_SQL)
  } catch (error) {
    throw new AppSettingsError("applyFailed", describeConnectionError(error))
  } finally {
    await client.end().catch(() => {})
  }

  const structure = await readAppSettingsStructure()
  if (!structure.ready) throw new AppSettingsError("stillMissing")
  return structure
}

/**
 * Lê e decifra segredos. Tolerância ESTREITA, no padrão de `src/lib/data-owner.ts`:
 * só "tabela ausente" degrada para vazio (instalação não preparada = nada
 * configurado); qualquer outro erro sobe. Valor que não decifra (chave trocada) é
 * ignorado — para o app é como se não existisse.
 */
export async function readAppSecrets(keys: string[]): Promise<Map<string, string>> {
  try {
    const rows = await prisma.appSetting.findMany({ where: { key: { in: keys } } })
    const result = new Map<string, string>()
    for (const row of rows) {
      const plain = decryptSecret(row.value)
      if (plain !== null) result.set(row.key, plain)
    }
    return result
  } catch (error) {
    if (isTableMissing(error)) return new Map()
    throw error
  }
}

/** Grava segredos cifrados. Tabela ausente → erro tipado (a rota traduz). */
export async function writeAppSecrets(entries: Record<string, string>): Promise<void> {
  try {
    await prisma.$transaction(
      Object.entries(entries).map(([key, plain]) => {
        const value = encryptSecret(plain)
        return prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } })
      }),
    )
  } catch (error) {
    if (isTableMissing(error)) throw new AppSettingsError("tableMissing")
    throw error
  }
}

/** Remove segredos (ex.: desconectar o bot). Tabela ausente = nada a remover. */
export async function deleteAppSettings(keys: string[]): Promise<void> {
  try {
    await prisma.appSetting.deleteMany({ where: { key: { in: keys } } })
  } catch (error) {
    if (isTableMissing(error)) return
    throw error
  }
}
