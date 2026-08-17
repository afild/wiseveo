-- Add legacy column required for 1:1 import from source categories table
ALTER TABLE "Category"
ADD COLUMN "COD_CAT" TEXT;

-- Backfill existing rows to satisfy NOT NULL constraint before import
UPDATE "Category"
SET "COD_CAT" = "id"
WHERE "COD_CAT" IS NULL;

ALTER TABLE "Category"
ALTER COLUMN "COD_CAT" SET NOT NULL;

CREATE UNIQUE INDEX "Category_COD_CAT_key" ON "Category"("COD_CAT");
