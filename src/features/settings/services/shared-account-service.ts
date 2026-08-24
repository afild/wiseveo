import { Client } from "pg"
import { prisma } from "@/lib/prisma"
import {
  classifyConnectionError,
  type DbConnectionErrorCode,
} from "@/features/setup/services/db-connection.service"
import {
  checkSharedAccountStructure,
  SHARED_ACCOUNT_COLUMN,
  SHARED_ACCOUNT_TABLE,
  type SharedAccountStructure,
} from "../lib/shared-account-structure"

/**
 * Prepara o banco para os convites — mudança de estrutura só assim: aditiva, pelo
 * app, com o dono confirmando na tela (regra de ouro: o banco é a fonte da
 * verdade; nada é migrado por conta própria). O mesmo padrão vale para a tabela
 * de segredos das integrações (`app-settings-service.ts`).
 *
 * O SQL vive aqui, e não num arquivo lido em tempo de execução, porque em
 * hospedagem serverless o repositório pode não acompanhar a função. O arquivo
 * `prisma/additive/2026-08-16-conta-compartilhada.sql` continua no repositório
 * para uso pela linha de comando — `tests/shared-account-structure.test.ts`
 * garante que os dois nunca divirjam.
 *
 * Propriedades exigidas deste SQL: só adiciona (sem DROP/TRUNCATE/ALTER destrutivo),
 * é idempotente (IF NOT EXISTS) e roda dentro de uma transação — falhou, nada fica
 * pela metade.
 */
export const SHARED_ACCOUNT_SQL = `BEGIN;

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

COMMIT;`

/**
 * Nenhum comando destrutivo pode passar por aqui, nem por engano numa edição futura.
 * `DELETE` é barrado na forma de comando (`DELETE FROM`): a cláusula `ON DELETE` de
 * uma chave estrangeira é só a regra do que fazer quando a linha-pai deixa de existir.
 */
export function isAdditiveOnly(sql: string): boolean {
  const withoutComments = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
  return !/\b(DROP|TRUNCATE)\b/i.test(withoutComments) && !/\bDELETE\s+FROM\b/i.test(withoutComments)
}

export class SharedAccountError extends Error {
  constructor(
    public readonly code: "notAdditive" | "noConnection" | "applyFailed" | "stillMissing",
    public readonly detail?: string,
    /** Falha ao CONECTAR: código estável (os mesmos do Setup), para a tela explicar o motivo. */
    public readonly connectionCode?: DbConnectionErrorCode,
  ) {
    super(code)
    this.name = "SharedAccountError"
  }
}

/**
 * Descrição útil de uma falha do `pg`. Existe porque a tentativa IPv4/IPv6 devolve um
 * `AggregateError` de `message` VAZIO, com os códigos escondidos em `.errors` — sem isto
 * a tela diria "Não foi possível preparar o banco: ." e o dono ficaria sem diagnóstico.
 */
export function describeConnectionError(error: unknown): string {
  const err = (error ?? {}) as {
    message?: string
    code?: string
    errors?: Array<{ code?: string; message?: string } | undefined>
  }
  const parts = [
    err.message?.trim(),
    err.code,
    ...(err.errors ?? []).map((inner) => inner?.code || inner?.message?.trim()),
  ]
  const detail = [...new Set(parts.filter((part): part is string => Boolean(part)))].join(" · ")
  return detail || String(error)
}

/** O que o banco JÁ tem (só leitura, pelo cliente normal do app). */
export async function readSharedAccountStructure(): Promise<SharedAccountStructure> {
  const [columns, tables] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = ${SHARED_ACCOUNT_COLUMN}
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${SHARED_ACCOUNT_TABLE}
    `,
  ])
  return checkSharedAccountStructure({
    hasColumn: Number(columns[0]?.count ?? 0) > 0,
    hasTable: Number(tables[0]?.count ?? 0) > 0,
  })
}

/**
 * Aplica a estrutura. Conexão DIRETA quando existir (`DIRECT_URL`): DDL por um
 * pooler em modo transação é território escorregadio. Confere de novo no fim —
 * "aplicado" só se o banco realmente passou a ter as duas peças.
 */
export async function applySharedAccountStructure(
  env: NodeJS.ProcessEnv = process.env,
): Promise<SharedAccountStructure> {
  if (!isAdditiveOnly(SHARED_ACCOUNT_SQL)) {
    throw new SharedAccountError("notAdditive")
  }
  const connectionString = env.DIRECT_URL || env.DATABASE_URL
  if (!connectionString) throw new SharedAccountError("noConnection")

  const client = new Client({ connectionString, connectionTimeoutMillis: 20000 })

  // Conectar FORA do try do comando: um cliente que morreu no aperto de mão aceita
  // novas consultas na fila e nunca as responde — um `ROLLBACK` ou `end()` aqui
  // penduraria a requisição para sempre, e a tela ficaria em "Preparando…".
  try {
    await client.connect()
  } catch (error) {
    throw new SharedAccountError(
      "applyFailed",
      describeConnectionError(error),
      classifyConnectionError(error, connectionString),
    )
  }

  try {
    // O próprio SQL abre e fecha a transação; se um comando falhar, o Postgres aborta
    // o lote inteiro — não há meio-termo para desfazer à mão.
    await client.query(SHARED_ACCOUNT_SQL)
  } catch (error) {
    throw new SharedAccountError("applyFailed", describeConnectionError(error))
  } finally {
    await client.end().catch(() => {})
  }

  const structure = await readSharedAccountStructure()
  if (!structure.ready) throw new SharedAccountError("stillMissing")
  return structure
}
