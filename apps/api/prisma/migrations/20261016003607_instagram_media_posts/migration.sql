-- AlterTable
ALTER TABLE "social_accounts" ADD COLUMN     "media_reauthorization_required" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "media_sync_last_attempt_at" TIMESTAMPTZ(3),
ADD COLUMN     "media_sync_lease_until" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "instagram_media_sync_states" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "social_account_id" UUID NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'never_synced',
    "next_cursor" TEXT,
    "has_more" BOOLEAN NOT NULL DEFAULT false,
    "requested_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unavailable_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stored_count" INTEGER NOT NULL DEFAULT 0,
    "records_read" INTEGER NOT NULL DEFAULT 0,
    "pages_read" INTEGER NOT NULL DEFAULT 0,
    "warning_code" VARCHAR(64),
    "last_error_code" VARCHAR(64),
    "last_attempt_at" TIMESTAMPTZ(3),
    "last_success_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "source" VARCHAR(64) NOT NULL DEFAULT 'instagram_graph_api',
    "api_version" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "instagram_media_sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instagram_media_posts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "social_account_id" UUID NOT NULL,
    "provider_media_id" VARCHAR(128) NOT NULL,
    "caption" TEXT,
    "published_at" TIMESTAMPTZ(3),
    "permalink" TEXT,
    "media_type" VARCHAR(32) NOT NULL,
    "media_product_type" VARCHAR(32),
    "media_url" TEXT,
    "thumbnail_url" TEXT,
    "returned_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" VARCHAR(64) NOT NULL DEFAULT 'instagram_graph_api',
    "api_version" VARCHAR(16) NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "instagram_media_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instagram_media_assets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "social_account_id" UUID NOT NULL,
    "parent_post_id" UUID NOT NULL,
    "provider_media_id" VARCHAR(128) NOT NULL,
    "position" INTEGER NOT NULL,
    "media_type" VARCHAR(32) NOT NULL,
    "media_url" TEXT,
    "thumbnail_url" TEXT,
    "returned_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" VARCHAR(64) NOT NULL DEFAULT 'instagram_graph_api',
    "api_version" VARCHAR(16) NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "instagram_media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instagram_media_sync_states_social_account_id_key" ON "instagram_media_sync_states"("social_account_id");

-- CreateIndex
CREATE INDEX "instagram_media_sync_states_user_id_status_last_success_at_idx" ON "instagram_media_sync_states"("user_id", "status", "last_success_at");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_media_sync_states_social_account_id_user_id_key" ON "instagram_media_sync_states"("social_account_id", "user_id");

-- CreateIndex
CREATE INDEX "instagram_media_posts_user_id_social_account_id_published_a_idx" ON "instagram_media_posts"("user_id", "social_account_id", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_media_posts_social_account_id_provider_media_id_key" ON "instagram_media_posts"("social_account_id", "provider_media_id");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_media_posts_id_user_id_social_account_id_key" ON "instagram_media_posts"("id", "user_id", "social_account_id");

-- CreateIndex
CREATE INDEX "instagram_media_assets_user_id_social_account_id_parent_pos_idx" ON "instagram_media_assets"("user_id", "social_account_id", "parent_post_id");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_media_assets_social_account_id_provider_media_id_key" ON "instagram_media_assets"("social_account_id", "provider_media_id");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_media_assets_parent_post_id_position_key" ON "instagram_media_assets"("parent_post_id", "position");

-- AddForeignKey
ALTER TABLE "instagram_media_sync_states" ADD CONSTRAINT "instagram_media_sync_states_social_account_id_user_id_fkey" FOREIGN KEY ("social_account_id", "user_id") REFERENCES "social_accounts"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instagram_media_posts" ADD CONSTRAINT "instagram_media_posts_social_account_id_user_id_fkey" FOREIGN KEY ("social_account_id", "user_id") REFERENCES "social_accounts"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instagram_media_assets" ADD CONSTRAINT "instagram_media_assets_social_account_id_user_id_fkey" FOREIGN KEY ("social_account_id", "user_id") REFERENCES "social_accounts"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instagram_media_assets" ADD CONSTRAINT "instagram_media_assets_parent_post_id_user_id_social_accou_fkey" FOREIGN KEY ("parent_post_id", "user_id", "social_account_id") REFERENCES "instagram_media_posts"("id", "user_id", "social_account_id") ON DELETE CASCADE ON UPDATE CASCADE;
