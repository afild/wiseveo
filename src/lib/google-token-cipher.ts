import { decryptWithLabel, encryptWithLabel, looksEncrypted, secretCipherSource } from "@/lib/secret-cipher"

/**
 * Cifra dos tokens da Agenda do Google guardados em `users.google_access_token` e
 * `users.google_refresh_token`.
 *
 * Por que existe: esses tokens dão acesso ao calendário da pessoa, e ficavam em claro
 * no banco, ao contrário do token do bot e das chaves de IA (que sempre foram cifrados
 * em `app_settings`). Quem lesse uma cópia do banco lia o calendário junto.
 *
 * Mesma cifra autenticada de `secret-cipher.ts` (AES-256-GCM), com RÓTULO PRÓPRIO:
 * a chave daqui não abre `app_settings` e a de lá não abre isto. Regra da casa:
 * chaves diferentes para fins diferentes.
 *
 * COMPATIBILIDADE COM O QUE JÁ ESTÁ GRAVADO: o banco pessoal tem anos de uso e não
 * passa por migração de dados (ver CLAUDE.md, regra de ouro dos bancos). Então a
 * leitura aceita as duas formas: envelope `v1:...` (decifra) e valor em claro
 * (devolve como está). Token do Google nunca começa com `v1:` (são `ya29.`, `1//`
 * e afins), então não há ambiguidade. A gravação é SEMPRE cifrada, e o valor legado
 * é regravado cifrado na primeira renovação (`getValidAccessToken`).
 */
const DERIVATION_LABEL = "wiseveo-google-token-key-v1"

/** Como o token vai para o banco. Sempre cifrado. */
export function encryptGoogleToken(plain: string, source: string = secretCipherSource()): string {
  return encryptWithLabel(DERIVATION_LABEL, plain, source)
}

/**
 * Como o token volta do banco, em claro e pronto para a API do Google.
 *
 * `null` quando não há nada guardado OU quando o valor cifrado não abre (senha do
 * banco trocada, valor adulterado). Quem chama trata `null` como "não conectado",
 * o mesmo caminho de um token revogado.
 */
export function readGoogleToken(stored: string | null | undefined, source: string = secretCipherSource()): string | null {
  if (!stored) return null
  if (!looksEncrypted(stored)) return stored
  return decryptWithLabel(DERIVATION_LABEL, stored, source)
}

/** Verdadeiro quando o valor guardado ainda está em claro e merece ser regravado cifrado. */
export function isLegacyPlainToken(stored: string | null | undefined): boolean {
  return !!stored && !looksEncrypted(stored)
}
