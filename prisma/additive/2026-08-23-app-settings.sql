-- Tabelas das integrações: `app_settings` (segredos cifrados da instalação — token
-- do bot do Telegram, chaves de IA), `ai_usage` (consumo de IA por mês, para o
-- teto de gasto), `advisor_messages` (conversas da página Advisor),
-- `notification_deliveries` (o que já foi enviado, para o boletim sair uma vez só)
-- e `kpi_snapshots` (foto mensal dos indicadores). Gêmeo do SQL inline em
-- src/features/settings/services/app-settings-service.ts (paridade garantida por
-- tests/app-settings-structure.test.ts). Aplicar numa transação, pela conexão DIRETA;
-- só acrescenta (IF NOT EXISTS), nunca DROP/ALTER destrutivo — idempotente.
-- Uso: npx tsx --env-file=.env.local scripts/apply-additive-sql.ts prisma/additive/2026-08-23-app-settings.sql

BEGIN;

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

COMMIT;
