-- prisma/demo/demo-leads.sql
-- EXCLUSIVO DO BANCO DA DEMO. Nunca aplicar no banco pessoal; nunca entra em
-- prisma/migrations nem no schema.prisma — o app não tem model disto, a rota
-- do fork escreve por SQL cru de propósito (D7).
-- SEM chave estrangeira para users: o lead SOBREVIVE quando a faxina apaga a
-- cópia do visitante (o lead é o produto; a cópia é descartável).
BEGIN;

CREATE TABLE IF NOT EXISTS demo_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  locale text,
  forked_user_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demo_leads_email_idx ON demo_leads (email);
CREATE INDEX IF NOT EXISTS demo_leads_created_at_idx ON demo_leads (created_at);

COMMIT;
