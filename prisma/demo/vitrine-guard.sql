-- prisma/demo/vitrine-guard.sql
-- EXCLUSIVO DO BANCO DA DEMO — nunca aplicar no banco pessoal.
--
-- Cinto de segurança da vitrine: mesmo que um bug de aplicação escape da
-- cerca do middleware, o Postgres recusa qualquer escrita nas linhas da
-- vitrine (o usuário público e sempre-disponível da demo). A cerca do
-- middleware é a primeira barreira; este arquivo é a segunda, no nível do
-- banco, para quando a primeira falhar.
--
-- A licença de sessão (`set_config('wiseveo.vitrine_write', 'on', true)`,
-- válida só na transação corrente — o `true` no terceiro argumento é
-- `is_local`) existe para o refresh diário do corte e para os reseeds da
-- vitrine, que PRECISAM escrever nessas mesmas linhas. Fora dessa licença,
-- toda escrita nas linhas da vitrine é recusada.
--
-- `__VITRINE_ID__` é um placeholder: scripts/apply-demo-sql.ts troca por o id
-- real do usuário-vitrine (lido de `users` pelo e-mail configurado) antes de
-- aplicar. Este arquivo nunca é aplicado com o placeholder literal.
--
-- REVISÃO ADVERSARIAL: reatribuir o dono (`UPDATE <t> SET user_id = '<outro>'
-- WHERE user_id = '<vitrine>'`) é roubo por reatribuição — a linha sai da
-- vitrine sem passar por DELETE. Por isso o gatilho de UPDATE, em cada uma
-- das 16 tabelas por dono, checa OS DOIS LADOS (OLD.user_id = vitrine OU
-- NEW.user_id = vitrine): só checar NEW deixaria passar quem tira a linha da
-- vitrine mudando o dono; só checar OLD deixaria passar quem a rouba de outro
-- dono. WHEN não aceita OLD em INSERT nem NEW em DELETE — por isso o antigo
-- gatilho combinado (INSERT OR UPDATE) virou dois: um só de INSERT e um só de
-- UPDATE.
--
-- Idempotente: toda criação de gatilho vem precedida do drop condicional
-- correspondente, e as funções usam CREATE OR REPLACE — reaplicar não falha
-- e não duplica nada.

BEGIN;

-- Função-guarda para as tabelas com user_id direto. WHEN já filtrou a linha
-- pelo dono antes de chamar a função (INSERT: NEW.user_id; UPDATE: OLD.user_id
-- OU NEW.user_id; DELETE: OLD.user_id — todos a vitrine); aqui só falta
-- decidir se a escrita está licenciada.
CREATE OR REPLACE FUNCTION wiseveo_vitrine_guard() RETURNS trigger AS $$
BEGIN
  IF current_setting('wiseveo.vitrine_write', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'vitrine da demo é somente leitura' USING ERRCODE = 'P0403';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. accounts
-- ============================================================================
-- drop do nome antigo: reaplicação limpa bancos que já têm a versão anterior
DROP TRIGGER IF EXISTS vitrine_guard_ins_upd ON "accounts";

DROP TRIGGER IF EXISTS vitrine_guard_ins ON "accounts";
CREATE TRIGGER vitrine_guard_ins BEFORE INSERT ON "accounts"
  FOR EACH ROW WHEN (NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_upd ON "accounts";
CREATE TRIGGER vitrine_guard_upd BEFORE UPDATE ON "accounts"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__' OR NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_del ON "accounts";
CREATE TRIGGER vitrine_guard_del BEFORE DELETE ON "accounts"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

-- ============================================================================
-- 2. category_groups
-- ============================================================================
DROP TRIGGER IF EXISTS vitrine_guard_ins_upd ON "category_groups";

DROP TRIGGER IF EXISTS vitrine_guard_ins ON "category_groups";
CREATE TRIGGER vitrine_guard_ins BEFORE INSERT ON "category_groups"
  FOR EACH ROW WHEN (NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_upd ON "category_groups";
CREATE TRIGGER vitrine_guard_upd BEFORE UPDATE ON "category_groups"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__' OR NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_del ON "category_groups";
CREATE TRIGGER vitrine_guard_del BEFORE DELETE ON "category_groups"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

-- ============================================================================
-- 3. categories
-- ============================================================================
DROP TRIGGER IF EXISTS vitrine_guard_ins_upd ON "categories";

DROP TRIGGER IF EXISTS vitrine_guard_ins ON "categories";
CREATE TRIGGER vitrine_guard_ins BEFORE INSERT ON "categories"
  FOR EACH ROW WHEN (NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_upd ON "categories";
CREATE TRIGGER vitrine_guard_upd BEFORE UPDATE ON "categories"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__' OR NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_del ON "categories";
CREATE TRIGGER vitrine_guard_del BEFORE DELETE ON "categories"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

-- ============================================================================
-- 4. payees
-- ============================================================================
DROP TRIGGER IF EXISTS vitrine_guard_ins_upd ON "payees";

DROP TRIGGER IF EXISTS vitrine_guard_ins ON "payees";
CREATE TRIGGER vitrine_guard_ins BEFORE INSERT ON "payees"
  FOR EACH ROW WHEN (NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_upd ON "payees";
CREATE TRIGGER vitrine_guard_upd BEFORE UPDATE ON "payees"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__' OR NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_del ON "payees";
CREATE TRIGGER vitrine_guard_del BEFORE DELETE ON "payees"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

-- ============================================================================
-- 5. transaction_statuses
-- ============================================================================
DROP TRIGGER IF EXISTS vitrine_guard_ins_upd ON "transaction_statuses";

DROP TRIGGER IF EXISTS vitrine_guard_ins ON "transaction_statuses";
CREATE TRIGGER vitrine_guard_ins BEFORE INSERT ON "transaction_statuses"
  FOR EACH ROW WHEN (NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_upd ON "transaction_statuses";
CREATE TRIGGER vitrine_guard_upd BEFORE UPDATE ON "transaction_statuses"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__' OR NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_del ON "transaction_statuses";
CREATE TRIGGER vitrine_guard_del BEFORE DELETE ON "transaction_statuses"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

-- ============================================================================
-- 6. transactions
-- ============================================================================
DROP TRIGGER IF EXISTS vitrine_guard_ins_upd ON "transactions";

DROP TRIGGER IF EXISTS vitrine_guard_ins ON "transactions";
CREATE TRIGGER vitrine_guard_ins BEFORE INSERT ON "transactions"
  FOR EACH ROW WHEN (NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_upd ON "transactions";
CREATE TRIGGER vitrine_guard_upd BEFORE UPDATE ON "transactions"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__' OR NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_del ON "transactions";
CREATE TRIGGER vitrine_guard_del BEFORE DELETE ON "transactions"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

-- ============================================================================
-- 7. transaction_messages
-- ============================================================================
DROP TRIGGER IF EXISTS vitrine_guard_ins_upd ON "transaction_messages";

DROP TRIGGER IF EXISTS vitrine_guard_ins ON "transaction_messages";
CREATE TRIGGER vitrine_guard_ins BEFORE INSERT ON "transaction_messages"
  FOR EACH ROW WHEN (NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_upd ON "transaction_messages";
CREATE TRIGGER vitrine_guard_upd BEFORE UPDATE ON "transaction_messages"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__' OR NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_del ON "transaction_messages";
CREATE TRIGGER vitrine_guard_del BEFORE DELETE ON "transaction_messages"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

-- ============================================================================
-- 8. excluded_transactions
-- ============================================================================
DROP TRIGGER IF EXISTS vitrine_guard_ins_upd ON "excluded_transactions";

DROP TRIGGER IF EXISTS vitrine_guard_ins ON "excluded_transactions";
CREATE TRIGGER vitrine_guard_ins BEFORE INSERT ON "excluded_transactions"
  FOR EACH ROW WHEN (NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_upd ON "excluded_transactions";
CREATE TRIGGER vitrine_guard_upd BEFORE UPDATE ON "excluded_transactions"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__' OR NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_del ON "excluded_transactions";
CREATE TRIGGER vitrine_guard_del BEFORE DELETE ON "excluded_transactions"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

-- ============================================================================
-- 9. recurring_transactions
-- ============================================================================
DROP TRIGGER IF EXISTS vitrine_guard_ins_upd ON "recurring_transactions";

DROP TRIGGER IF EXISTS vitrine_guard_ins ON "recurring_transactions";
CREATE TRIGGER vitrine_guard_ins BEFORE INSERT ON "recurring_transactions"
  FOR EACH ROW WHEN (NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_upd ON "recurring_transactions";
CREATE TRIGGER vitrine_guard_upd BEFORE UPDATE ON "recurring_transactions"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__' OR NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_del ON "recurring_transactions";
CREATE TRIGGER vitrine_guard_del BEFORE DELETE ON "recurring_transactions"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

-- ============================================================================
-- 10. budgets
-- ============================================================================
DROP TRIGGER IF EXISTS vitrine_guard_ins_upd ON "budgets";

DROP TRIGGER IF EXISTS vitrine_guard_ins ON "budgets";
CREATE TRIGGER vitrine_guard_ins BEFORE INSERT ON "budgets"
  FOR EACH ROW WHEN (NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_upd ON "budgets";
CREATE TRIGGER vitrine_guard_upd BEFORE UPDATE ON "budgets"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__' OR NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_del ON "budgets";
CREATE TRIGGER vitrine_guard_del BEFORE DELETE ON "budgets"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

-- ============================================================================
-- 11. telegram_connections
-- ============================================================================
DROP TRIGGER IF EXISTS vitrine_guard_ins_upd ON "telegram_connections";

DROP TRIGGER IF EXISTS vitrine_guard_ins ON "telegram_connections";
CREATE TRIGGER vitrine_guard_ins BEFORE INSERT ON "telegram_connections"
  FOR EACH ROW WHEN (NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_upd ON "telegram_connections";
CREATE TRIGGER vitrine_guard_upd BEFORE UPDATE ON "telegram_connections"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__' OR NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_del ON "telegram_connections";
CREATE TRIGGER vitrine_guard_del BEFORE DELETE ON "telegram_connections"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

-- ============================================================================
-- 12. telegram_conversation_memories
-- ============================================================================
DROP TRIGGER IF EXISTS vitrine_guard_ins_upd ON "telegram_conversation_memories";

DROP TRIGGER IF EXISTS vitrine_guard_ins ON "telegram_conversation_memories";
CREATE TRIGGER vitrine_guard_ins BEFORE INSERT ON "telegram_conversation_memories"
  FOR EACH ROW WHEN (NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_upd ON "telegram_conversation_memories";
CREATE TRIGGER vitrine_guard_upd BEFORE UPDATE ON "telegram_conversation_memories"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__' OR NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_del ON "telegram_conversation_memories";
CREATE TRIGGER vitrine_guard_del BEFORE DELETE ON "telegram_conversation_memories"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

-- ============================================================================
-- 13. telegram_pending_tokens
-- ============================================================================
DROP TRIGGER IF EXISTS vitrine_guard_ins_upd ON "telegram_pending_tokens";

DROP TRIGGER IF EXISTS vitrine_guard_ins ON "telegram_pending_tokens";
CREATE TRIGGER vitrine_guard_ins BEFORE INSERT ON "telegram_pending_tokens"
  FOR EACH ROW WHEN (NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_upd ON "telegram_pending_tokens";
CREATE TRIGGER vitrine_guard_upd BEFORE UPDATE ON "telegram_pending_tokens"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__' OR NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_del ON "telegram_pending_tokens";
CREATE TRIGGER vitrine_guard_del BEFORE DELETE ON "telegram_pending_tokens"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

-- ============================================================================
-- 14. advisor_messages
-- ============================================================================
DROP TRIGGER IF EXISTS vitrine_guard_ins_upd ON "advisor_messages";

DROP TRIGGER IF EXISTS vitrine_guard_ins ON "advisor_messages";
CREATE TRIGGER vitrine_guard_ins BEFORE INSERT ON "advisor_messages"
  FOR EACH ROW WHEN (NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_upd ON "advisor_messages";
CREATE TRIGGER vitrine_guard_upd BEFORE UPDATE ON "advisor_messages"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__' OR NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_del ON "advisor_messages";
CREATE TRIGGER vitrine_guard_del BEFORE DELETE ON "advisor_messages"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

-- ============================================================================
-- 15. notification_deliveries
-- ============================================================================
DROP TRIGGER IF EXISTS vitrine_guard_ins_upd ON "notification_deliveries";

DROP TRIGGER IF EXISTS vitrine_guard_ins ON "notification_deliveries";
CREATE TRIGGER vitrine_guard_ins BEFORE INSERT ON "notification_deliveries"
  FOR EACH ROW WHEN (NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_upd ON "notification_deliveries";
CREATE TRIGGER vitrine_guard_upd BEFORE UPDATE ON "notification_deliveries"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__' OR NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_del ON "notification_deliveries";
CREATE TRIGGER vitrine_guard_del BEFORE DELETE ON "notification_deliveries"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

-- ============================================================================
-- 16. kpi_snapshots
-- ============================================================================
DROP TRIGGER IF EXISTS vitrine_guard_ins_upd ON "kpi_snapshots";

DROP TRIGGER IF EXISTS vitrine_guard_ins ON "kpi_snapshots";
CREATE TRIGGER vitrine_guard_ins BEFORE INSERT ON "kpi_snapshots"
  FOR EACH ROW WHEN (NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_upd ON "kpi_snapshots";
CREATE TRIGGER vitrine_guard_upd BEFORE UPDATE ON "kpi_snapshots"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__' OR NEW.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

DROP TRIGGER IF EXISTS vitrine_guard_del ON "kpi_snapshots";
CREATE TRIGGER vitrine_guard_del BEFORE DELETE ON "kpi_snapshots"
  FOR EACH ROW WHEN (OLD.user_id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

-- ============================================================================
-- users — a linha da vitrine em si. Sem INSERT (o usuário já existe, semeado
-- por db:seed:demo): só UPDATE/DELETE, pelo id da própria linha (não há
-- user_id aqui — é o id, e o id é imutável, então OLD.id já basta: não existe
-- "reatribuir" o id de uma linha).
-- ============================================================================
DROP TRIGGER IF EXISTS vitrine_guard_upd_del ON "users";
CREATE TRIGGER vitrine_guard_upd_del BEFORE UPDATE OR DELETE ON "users"
  FOR EACH ROW WHEN (OLD.id = '__VITRINE_ID__')
  EXECUTE FUNCTION wiseveo_vitrine_guard();

-- ============================================================================
-- transaction_attachments — não tem user_id (só transaction_id): o dono é
-- indireto, pela transação. Função própria porque o filtro não cabe num WHEN
-- simples (precisa de subconsulta) — WHEN não pode chamar função com SELECT.
-- A mesma reatribuição (mover o anexo para uma transação de outro dono, ou
-- trazer para dentro de uma transação da vitrine um anexo de fora) é coberta
-- checando OS DOIS LADOS: NEW.transaction_id (o que a linha está virando) OU
-- OLD.transaction_id (o que ela era). Em INSERT, OLD é NULL — o acesso a
-- OLD.transaction_id dentro da condição some no OR (comparação com NULL não
-- derruba a linha); o mesmo vale para NEW em DELETE.
-- ============================================================================
CREATE OR REPLACE FUNCTION wiseveo_vitrine_guard_attachment() RETURNS trigger AS $$
BEGIN
  IF current_setting('wiseveo.vitrine_write', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF EXISTS (
    SELECT 1 FROM "transactions" t
    WHERE t.user_id = '__VITRINE_ID__'
      AND (t.id = NEW.transaction_id OR t.id = OLD.transaction_id)
  ) THEN
    RAISE EXCEPTION 'vitrine da demo é somente leitura' USING ERRCODE = 'P0403';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vitrine_guard ON "transaction_attachments";
CREATE TRIGGER vitrine_guard BEFORE INSERT OR UPDATE OR DELETE ON "transaction_attachments"
  FOR EACH ROW
  EXECUTE FUNCTION wiseveo_vitrine_guard_attachment();

COMMIT;
