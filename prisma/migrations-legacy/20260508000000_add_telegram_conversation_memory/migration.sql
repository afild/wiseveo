-- CreateTable for persistent Telegram conversation memory
CREATE TABLE IF NOT EXISTS "telegram_conversation_memories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "telegram_chat_id" BIGINT NOT NULL,
    "memory_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telegram_conversation_memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
    CONSTRAINT "telegram_conversation_memories_telegram_chat_id_key" UNIQUE("telegram_chat_id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "telegram_conversation_memories_user_id_idx" ON "telegram_conversation_memories"("user_id");
