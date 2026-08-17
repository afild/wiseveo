-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('WALLET', 'CHECKING', 'SAVINGS', 'INVESTMENT');

-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PAID', 'PENDING', 'OVERDUE', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "google_id" TEXT,
    "phone" TEXT,
    "photo" TEXT,
    "preferences_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "themePreferences" JSONB,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "google_access_token" TEXT,
    "google_refresh_token" TEXT,
    "google_token_expires_at" TIMESTAMP(3),
    "data_owner_id" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
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

-- CreateTable
CREATE TABLE "accounts" (
    "COD_ACC" INTEGER NOT NULL,
    "CONTA" TEXT NOT NULL,
    "SLD_INI" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "DATA" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "TIPO" "AccountType" NOT NULL DEFAULT 'CHECKING',

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("COD_ACC")
);

-- CreateTable
CREATE TABLE "category_groups" (
    "id" TEXT NOT NULL,
    "COD_GRU" INTEGER NOT NULL,
    "GRUPO" TEXT NOT NULL,
    "type" "CategoryType" NOT NULL DEFAULT 'EXPENSE',
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "COD_CAT" TEXT NOT NULL,
    "CATEGORIA" TEXT NOT NULL,
    "TIPO" "CategoryType" NOT NULL,
    "group_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payees" (
    "COD_BEN" INTEGER NOT NULL,
    "BENEFICIARIO" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payees_pkey" PRIMARY KEY ("COD_BEN")
);

-- CreateTable
CREATE TABLE "transaction_statuses" (
    "id" TEXT NOT NULL,
    "COD_ST" INTEGER NOT NULL,
    "STATUS" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "NUM" INTEGER,
    "PERIODO" CHAR(6) NOT NULL,
    "DATA" TIMESTAMP(3) NOT NULL,
    "REF" TEXT,
    "HISTORICO" TEXT,
    "DESCRICAO" TEXT,
    "VALOR" DOUBLE PRECISION NOT NULL,
    "TIPO" "CategoryType" NOT NULL DEFAULT 'EXPENSE',
    "user_id" TEXT NOT NULL,
    "COD_ACC" INTEGER NOT NULL,
    "COD_ACC_DEST" INTEGER,
    "COD_GRU" INTEGER NOT NULL,
    "COD_CAT" TEXT NOT NULL,
    "COD_ST" INTEGER NOT NULL,
    "COD_BEN" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_attachments" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_attachments_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "excluded_transactions" (
    "id" TEXT NOT NULL,
    "NUM" INTEGER,
    "PERIODO" CHAR(6) NOT NULL,
    "DATA" TIMESTAMP(3) NOT NULL,
    "REF" TEXT,
    "HISTORICO" TEXT,
    "DESCRICAO" TEXT,
    "VALOR" DOUBLE PRECISION NOT NULL,
    "TIPO" "CategoryType" NOT NULL DEFAULT 'EXPENSE',
    "user_id" TEXT NOT NULL,
    "COD_ACC" INTEGER NOT NULL,
    "COD_ACC_DEST" INTEGER,
    "COD_GRU" INTEGER NOT NULL,
    "COD_CAT" TEXT NOT NULL,
    "COD_ST" INTEGER NOT NULL,
    "COD_BEN" INTEGER,
    "excluded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "excluded_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_transactions" (
    "id" TEXT NOT NULL,
    "PERIODO" CHAR(6) NOT NULL,
    "HISTORICO" TEXT,
    "DESCRICAO" TEXT,
    "VALOR" DOUBLE PRECISION NOT NULL,
    "TIPO" "CategoryType" NOT NULL DEFAULT 'EXPENSE',
    "user_id" TEXT NOT NULL,
    "COD_ACC" INTEGER NOT NULL,
    "COD_GRU" INTEGER NOT NULL,
    "COD_CAT" TEXT NOT NULL,
    "COD_ST" INTEGER NOT NULL,
    "COD_BEN" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_date" TIMESTAMP(3),
    "REF" TEXT,

    CONSTRAINT "recurring_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "VALOR" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "category_id" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "GASTO" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "group_id" TEXT,
    "REGRA" TEXT,
    "nome_customizado" TEXT,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "telegram_chat_id" BIGINT NOT NULL,
    "telegram_username" TEXT,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "telegram_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_conversation_memories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "telegram_chat_id" BIGINT NOT NULL,
    "memory_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_conversation_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_pending_tokens" (
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "telegram_pending_tokens_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE INDEX "users_data_owner_id_idx" ON "users"("data_owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_invited_by_id_idx" ON "invitations"("invited_by_id");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "category_groups_COD_GRU_key" ON "category_groups"("COD_GRU");

-- CreateIndex
CREATE INDEX "category_groups_user_id_type_idx" ON "category_groups"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "categories_COD_CAT_key" ON "categories"("COD_CAT");

-- CreateIndex
CREATE INDEX "payees_user_id_idx" ON "payees"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_statuses_COD_ST_key" ON "transaction_statuses"("COD_ST");

-- CreateIndex
CREATE INDEX "transactions_user_id_DATA_idx" ON "transactions"("user_id", "DATA");

-- CreateIndex
CREATE INDEX "transactions_user_id_TIPO_DATA_idx" ON "transactions"("user_id", "TIPO", "DATA");

-- CreateIndex
CREATE INDEX "transactions_COD_CAT_idx" ON "transactions"("COD_CAT");

-- CreateIndex
CREATE INDEX "transaction_attachments_transaction_id_idx" ON "transaction_attachments"("transaction_id");

-- CreateIndex
CREATE INDEX "transaction_messages_transaction_id_idx" ON "transaction_messages"("transaction_id");

-- CreateIndex
CREATE INDEX "transaction_messages_user_id_idx" ON "transaction_messages"("user_id");

-- CreateIndex
CREATE INDEX "budgets_user_id_month_year_idx" ON "budgets"("user_id", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_connections_user_id_key" ON "telegram_connections"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_connections_telegram_chat_id_key" ON "telegram_connections"("telegram_chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_conversation_memories_telegram_chat_id_key" ON "telegram_conversation_memories"("telegram_chat_id");

-- CreateIndex
CREATE INDEX "telegram_conversation_memories_user_id_idx" ON "telegram_conversation_memories"("user_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_data_owner_id_fkey" FOREIGN KEY ("data_owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_groups" ADD CONSTRAINT "category_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "category_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payees" ADD CONSTRAINT "payees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_statuses" ADD CONSTRAINT "transaction_statuses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_COD_ACC_DEST_fkey" FOREIGN KEY ("COD_ACC_DEST") REFERENCES "accounts"("COD_ACC") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_COD_ACC_fkey" FOREIGN KEY ("COD_ACC") REFERENCES "accounts"("COD_ACC") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_COD_BEN_fkey" FOREIGN KEY ("COD_BEN") REFERENCES "payees"("COD_BEN") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_COD_CAT_fkey" FOREIGN KEY ("COD_CAT") REFERENCES "categories"("COD_CAT") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_COD_GRU_fkey" FOREIGN KEY ("COD_GRU") REFERENCES "category_groups"("COD_GRU") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_COD_ST_fkey" FOREIGN KEY ("COD_ST") REFERENCES "transaction_statuses"("COD_ST") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_attachments" ADD CONSTRAINT "transaction_attachments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_messages" ADD CONSTRAINT "transaction_messages_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_messages" ADD CONSTRAINT "transaction_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excluded_transactions" ADD CONSTRAINT "excluded_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_COD_ACC_fkey" FOREIGN KEY ("COD_ACC") REFERENCES "accounts"("COD_ACC") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_COD_BEN_fkey" FOREIGN KEY ("COD_BEN") REFERENCES "payees"("COD_BEN") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_COD_CAT_fkey" FOREIGN KEY ("COD_CAT") REFERENCES "categories"("COD_CAT") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_COD_GRU_fkey" FOREIGN KEY ("COD_GRU") REFERENCES "category_groups"("COD_GRU") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_COD_ST_fkey" FOREIGN KEY ("COD_ST") REFERENCES "transaction_statuses"("COD_ST") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "category_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_connections" ADD CONSTRAINT "telegram_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_conversation_memories" ADD CONSTRAINT "telegram_conversation_memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_pending_tokens" ADD CONSTRAINT "telegram_pending_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
