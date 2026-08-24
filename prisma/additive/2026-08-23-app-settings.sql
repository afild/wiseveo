-- Tabela `app_settings`: segredos cifrados da instalação (token do bot do Telegram;
-- adiante, chaves de IA). Gêmeo do SQL inline em
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

COMMIT;
