-- CreateTable
CREATE TABLE "transaction_messages" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transaction_messages_transaction_id_idx" ON "transaction_messages"("transaction_id");

-- CreateIndex
CREATE INDEX "transaction_messages_user_id_idx" ON "transaction_messages"("user_id");

-- AddForeignKey
ALTER TABLE "transaction_messages" ADD CONSTRAINT "transaction_messages_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_messages" ADD CONSTRAINT "transaction_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
