/** Erros com código estável; a rota traduz por `api.backup.<code>`. Nunca carregam token. */
export type BackupErrorCode =
  | "notPrepared"
  | "driveNotConnected"
  | "driveFailed"
  | "sandboxFailed"
  | "dumpFailed"
  | "dumpRejected"
  | "alreadyRunning"
  | "invalidPayload"

export class BackupError extends Error {
  constructor(
    public readonly code: BackupErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code) // i18n-ignore: erro interno com código estável
    this.name = "BackupError"
  }
}
