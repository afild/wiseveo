import fs from "fs"

/**
 * Como o Setup Wizard consegue persistir a configuração neste ambiente.
 *
 * - `auto-reload`     : `next dev` — grava `.env.local` e o Next recarrega sozinho.
 * - `restart-required`: produção self-hosted (`next start`/Docker) — grava `.env.local`,
 *                       mas só um reinício do processo faz as variáveis valerem.
 * - `manual-env`      : Vercel (ou qualquer disco só-leitura) — não há arquivo para
 *                       gravar nem reinício; as variáveis vão para o painel da hospedagem
 *                       e o app volta configurado após o redeploy.
 */
export type SetupPersistenceMode = "auto-reload" | "restart-required" | "manual-env"

export function detectSetupPersistence(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): SetupPersistenceMode {
  if (env.VERCEL || env.NETLIFY || env.AWS_LAMBDA_FUNCTION_NAME) return "manual-env"
  try {
    fs.accessSync(cwd, fs.constants.W_OK)
  } catch {
    return "manual-env"
  }
  return env.NODE_ENV === "development" ? "auto-reload" : "restart-required"
}

/** Nome amigável da hospedagem para a tela final (dado, não UI). */
export function detectHostingProvider(env: NodeJS.ProcessEnv = process.env): "vercel" | "netlify" | "other" {
  if (env.VERCEL) return "vercel"
  if (env.NETLIFY) return "netlify"
  return "other"
}
