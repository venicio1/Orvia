-- AlterTable
ALTER TABLE "social_accounts" ADD COLUMN     "profile_reauthorization_required" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "profile_sync_last_attempt_at" TIMESTAMPTZ(3),
ADD COLUMN     "profile_sync_last_error_code" VARCHAR(64),
ADD COLUMN     "profile_sync_lease_until" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "instagram_profile_snapshots" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "social_account_id" UUID NOT NULL,
    "username" VARCHAR(255),
    "name" VARCHAR(255),
    "biography" TEXT,
    "profile_picture_url" TEXT,
    "followers_count" INTEGER,
    "follows_count" INTEGER,
    "media_count" INTEGER,
    "website" TEXT,
    "returned_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" VARCHAR(64) NOT NULL DEFAULT 'instagram_graph_api',
    "api_version" VARCHAR(16) NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "instagram_profile_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instagram_profile_snapshots_social_account_id_key" ON "instagram_profile_snapshots"("social_account_id");

-- CreateIndex
CREATE INDEX "instagram_profile_snapshots_user_id_fetched_at_idx" ON "instagram_profile_snapshots"("user_id", "fetched_at");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_profile_snapshots_social_account_id_user_id_key" ON "instagram_profile_snapshots"("social_account_id", "user_id");

-- AddForeignKey
ALTER TABLE "instagram_profile_snapshots" ADD CONSTRAINT "instagram_profile_snapshots_social_account_id_user_id_fkey" FOREIGN KEY ("social_account_id", "user_id") REFERENCES "social_accounts"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;
