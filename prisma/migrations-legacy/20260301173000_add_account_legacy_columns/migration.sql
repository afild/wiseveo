-- Add legacy columns required for 1:1 import from source accounts table
ALTER TABLE "Account"
ADD COLUMN "COD_ACC" INTEGER;

ALTER TABLE "Account"
ADD COLUMN "DATA" TIMESTAMP(3);

-- Backfill existing rows to satisfy NOT NULL constraints
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "id") AS rn
  FROM "Account"
)
UPDATE "Account" a
SET
  "COD_ACC" = n.rn,
  "DATA" = COALESCE(a."createdAt", CURRENT_TIMESTAMP)
FROM numbered n
WHERE a."id" = n."id";

ALTER TABLE "Account"
ALTER COLUMN "COD_ACC" SET NOT NULL;

ALTER TABLE "Account"
ALTER COLUMN "DATA" SET NOT NULL;

CREATE UNIQUE INDEX "Account_COD_ACC_key" ON "Account"("COD_ACC");
