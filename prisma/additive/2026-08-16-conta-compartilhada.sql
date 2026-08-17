-- Conta compartilhada (convites) — mudança ADITIVA para bancos existentes.
-- Gerado por `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
-- contra o banco demo em 2026-08-16 (o diff era só isto: nenhuma outra divergência).
-- Aplicar dentro de uma transação, pela conexão DIRETA (não pelo pooler em modo transação).
-- Nunca contém DROP/ALTER destrutivo. Idempotente (IF NOT EXISTS) para poder reaplicar com segurança.

BEGIN;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "data_owner_id" TEXT;

CREATE TABLE IF NOT EXISTS "invitations" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "invited_by_id" TEXT NOT NULL,
    "email" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "accepted_by_user_id" TEXT,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "invitations_token_key" ON "invitations"("token");
CREATE INDEX IF NOT EXISTS "invitations_invited_by_id_idx" ON "invitations"("invited_by_id");
CREATE INDEX IF NOT EXISTS "users_data_owner_id_idx" ON "users"("data_owner_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_data_owner_id_fkey') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_data_owner_id_fkey"
      FOREIGN KEY ("data_owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitations_invited_by_id_fkey') THEN
    ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_fkey"
      FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitations_accepted_by_user_id_fkey') THEN
    ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_user_id_fkey"
      FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
