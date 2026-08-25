-- Tabelas das integrações: `app_settings` (segredos cifrados da instalação — token
-- do bot do Telegram, chaves de IA), `ai_usage` (consumo de IA por mês, para o
-- teto de gasto) e `advisor_messages` (conversas da página Advisor). Gêmeo do SQL inline em
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

COMMIT;
