# WISEVEO — Regras do projeto para agentes

## Internacionalização (OBRIGATÓRIO — o build bloqueia violações)

O sistema é trilíngue: **pt-BR, en-US, es-419 (Español LatAm)**. Toda feature/alteração nasce nos 3 idiomas.

> Migração em andamento: caminhos em scripts/i18n-allowlist.json ainda violam estas regras temporariamente — a catraca garante que a lista só encolhe até zerar (plano: docs/superpowers/plans/2026-07-15-i18n-trilingue-completo.md).

1. **Nunca** escreva texto de UI hardcoded (JSX, toasts, placeholders, aria-labels, mensagens de erro).
   Use `useTranslations()` (client) / `getTranslations()` (server) do next-intl.
2. Toda chave nova entra nos **3** arquivos `src/i18n/messages/{pt-BR,en-US,es-419}.json`, mesma
   estrutura, ordem alfabética. Termos genéricos reutilizam `common.*`. `npm run i18n:translate`
   preenche en/es a partir do pt-BR via IA (revise o diff antes de commitar).
3. **Datas e números não monetários:** helpers de `src/i18n/format.ts` (`formatAppDate`,
   `createDateFormatter`, `createNumberFormatter`, `getDateFnsLocale`). Proibido `Intl.*` com locale
   fixo, `toLocaleDateString("pt-BR")` ou importar `ptBR`/`enUS`/`es` do date-fns fora desse arquivo.
4. **Valores monetários:** continuam via `src/lib/monetary.ts` / `useMonetaryFormatting` (preferência do
   usuário em Configurações, independente do idioma da UI). Não converter para o locale da UI.
5. Erros de API: serviços retornam códigos estáveis; as rotas traduzem com `getTranslations("api")`.
6. Canais sem cookie (Telegram, jobs): use o locale persistido em `User.preferencesJson.locale`
   (helper `getUserLocale` em `src/features/settings/services/user-settings-service.ts`).
7. **Gates — rode antes de finalizar qualquer tarefa:**
   `npm run check:i18n && npm run check:i18n:code && npm run check:migrations && npx tsc --noEmit --incremental false && npm run lint`.
   Os três primeiros rodam dentro de `npm run build` e **bloqueiam o deploy na Vercel** (wiseveo-app
   e wiseveo-demo). O tsc NÃO roda no build da Vercel (`ignoreBuildErrors` por causa do
   Prisma 7/Turbopack) — por isso é obrigatório rodá-lo manualmente. Baseline tolerada: **0 erros**
   (os 4 antigos — auth/google/callback, auth/login, auth/signup, recurring/types.ts — foram
   corrigidos em 2026-08-22; qualquer erro novo é regressão).
8. `scripts/i18n-allowlist.json` é uma catraca: só encolhe. **Proibido adicionar caminhos.**
9. String que é dado e não UI (ex.: lista de palavras-chave de detecção) pode ser isenta com
   `// i18n-ignore` na própria linha ou na linha acima — use com parcimônia e justifique no commit.
   Exceção permanente (não é catraca, é `IGNORE` fixo no scanner): `src/features/component-library`
   é o guia de estilo interno (dev-only) e deliberadamente não é localizado.
10. Metadados de locale centralizados em `src/i18n/config.ts` (`LOCALES`, `LOCALE_META`,
    `resolveAppLocale`). O espanhol é `es-419` (espanhol latino-americano, rótulo "Español (ES)").
    Bandeiras circulares locais em `public/flags` (HatScripts/circle-flags, MIT — conjunto completo
    para idiomas futuros).
    O seletor de idioma do usuário fica em Configurações → Aparência (`LocaleSwitcher`).
