-- CreateTable for TelegramConnection
CREATE TABLE IF NOT EXISTS "telegram_connections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "telegram_chat_id" BIGINT NOT NULL,
    "telegram_username" TEXT,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "telegram_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
    CONSTRAINT "telegram_connections_user_id_key" UNIQUE("user_id"),
    CONSTRAINT "telegram_connections_telegram_chat_id_key" UNIQUE("telegram_chat_id")
);

-- CreateTable for TelegramPendingToken
CREATE TABLE IF NOT EXISTS "telegram_pending_tokens" (
    "token" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "telegram_pending_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "telegram_pending_tokens_user_id_idx" ON "telegram_pending_tokens"("user_id");
