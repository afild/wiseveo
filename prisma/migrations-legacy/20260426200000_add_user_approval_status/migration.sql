DO $$
BEGIN
  CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "status" "UserStatus";

UPDATE "users"
SET "role" = CASE
  WHEN LOWER("email") = 'albertsoliveira@gmail.com' THEN 'SUPERADMIN'::"Role"
  ELSE 'USER'::"Role"
END;

UPDATE "users"
SET "status" = 'ACTIVE'::"UserStatus"
WHERE "status" IS NULL;

ALTER TABLE "users"
ALTER COLUMN "status" SET DEFAULT 'PENDING'::"UserStatus",
ALTER COLUMN "status" SET NOT NULL;
