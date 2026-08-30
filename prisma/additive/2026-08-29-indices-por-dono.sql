-- Índices por dono que faltavam em quatro tabelas. Sem eles, a cascata de apagar um
-- usuário varre cada uma dessas tabelas inteira em vez de ir direto às linhas dele.
-- Eles NÃO fecham sozinhos o caso da faxina de 25/08/2026 (23 min para 25
-- visitantes): o custo grande lá era varrer transactions a cada status/conta/grupo/
-- favorecido apagado, porque os FKs COD_ST/COD_ACC/COD_ACC_DEST/COD_GRU/COD_BEN de
-- transactions seguem SEM índice — por isso a faxina apaga as transações PRIMEIRO,
-- pelo índice (user_id, DATA). Gêmeos dos `@@index` do schema.prisma, com os mesmos
-- nomes que o Prisma gera, para banco novo e banco existente ficarem iguais.
--
-- É seguro num banco em uso: as quatro tabelas são pequenas (uma linha por categoria,
-- status, recorrência ou exclusão), então o índice sai em instantes. Só acrescenta
-- (IF NOT EXISTS), nunca DROP/ALTER destrutivo — idempotente.
-- Uso: npx tsx --env-file=.env.local scripts/apply-additive-sql.ts prisma/additive/2026-08-29-indices-por-dono.sql

BEGIN;

CREATE INDEX IF NOT EXISTS "categories_user_id_idx" ON "categories"("user_id");

CREATE INDEX IF NOT EXISTS "categories_group_id_idx" ON "categories"("group_id");

CREATE INDEX IF NOT EXISTS "transaction_statuses_user_id_idx" ON "transaction_statuses"("user_id");

CREATE INDEX IF NOT EXISTS "excluded_transactions_user_id_idx" ON "excluded_transactions"("user_id");

CREATE INDEX IF NOT EXISTS "recurring_transactions_user_id_idx" ON "recurring_transactions"("user_id");

COMMIT;
