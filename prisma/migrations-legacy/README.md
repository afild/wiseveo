# migrations-legacy (referência histórica — NÃO é lida pelo Prisma nem pelo Setup Wizard)

Cadeia original de 13 migrações (mar–mai/2026). Está **quebrada para banco novo**: as 7 primeiras
criam tabelas em PascalCase (`"User"`, `"Account"`, `"Transaction"`…) e da 8ª em diante os SQLs
usam snake_case (`"users"`, `"transactions"`…) sem migração de renomeação — `prisma migrate deploy`
falha em `20260301223000_replace_is_admin_with_role` com `relation "users" does not exist`.

Nenhum banco real passou por esta cadeia: os bancos do projeto foram criados e evoluídos com
`prisma db push` (não têm `_prisma_migrations`). Em 2026-08-16 a pasta `prisma/migrations` passou a
ter **uma única migração squashed** (`20260816000000_init`, gerada por
`prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`), usada apenas para
criar bancos NOVOS pelo Setup Wizard. Bancos existentes continuam sendo a fonte da verdade e evoluem
com `db push`, com extremo cuidado para nunca perder histórico.

- Regenerar o init após mudar o schema: `npm run migrations:regen`
- Conferir (roda no build): `npm run check:migrations`
