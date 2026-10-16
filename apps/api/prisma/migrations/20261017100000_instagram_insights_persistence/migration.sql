CREATE TABLE "instagram_insight_sync_states" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "social_account_id" UUID NOT NULL,
  "scope" VARCHAR(16) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'never_synced',
  "lease_until" TIMESTAMPTZ(3),
  "next_sync_at" TIMESTAMPTZ(3),
  "last_attempt_at" TIMESTAMPTZ(3),
  "last_success_at" TIMESTAMPTZ(3),
  "last_run_id" UUID,
  "last_error_code" VARCHAR(64),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "instagram_insight_sync_states_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instagram_insight_sync_states_social_account_id_scope_key" UNIQUE ("social_account_id", "scope"),
  CONSTRAINT "instagram_insight_sync_states_scope_check" CHECK ("scope" IN ('account', 'media')),
  CONSTRAINT "instagram_insight_sync_states_status_check" CHECK ("status" IN ('never_synced', 'running', 'succeeded', 'partial', 'failed')),
  CONSTRAINT "instagram_insight_sync_states_lease_check" CHECK (("status" = 'running' AND "lease_until" IS NOT NULL) OR ("status" <> 'running' AND "lease_until" IS NULL)),
  CONSTRAINT "instagram_insight_sync_states_social_account_id_user_id_fkey"
    FOREIGN KEY ("social_account_id", "user_id") REFERENCES "social_accounts"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "instagram_insight_sync_states_user_id_social_account_id_status_next_sync_at_idx"
  ON "instagram_insight_sync_states"("user_id", "social_account_id", "status", "next_sync_at");

CREATE TABLE "instagram_insight_sync_runs" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "social_account_id" UUID NOT NULL,
  "scope" VARCHAR(16) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'running',
  "requested_metrics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "missing_metrics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "unavailable_metrics" JSONB NOT NULL DEFAULT '{}'::JSONB,
  "error_code" VARCHAR(64),
  "source" VARCHAR(64) NOT NULL DEFAULT 'instagram_graph_api',
  "api_version" VARCHAR(16) NOT NULL,
  "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "instagram_insight_sync_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instagram_insight_sync_runs_id_user_id_social_account_id_key" UNIQUE ("id", "user_id", "social_account_id"),
  CONSTRAINT "instagram_insight_sync_runs_scope_check" CHECK ("scope" IN ('account', 'media')),
  CONSTRAINT "instagram_insight_sync_runs_status_check" CHECK ("status" IN ('running', 'succeeded', 'partial', 'failed')),
  CONSTRAINT "instagram_insight_sync_runs_lifecycle_check" CHECK (("status" = 'running' AND "finished_at" IS NULL) OR ("status" <> 'running' AND "finished_at" IS NOT NULL)),
  CONSTRAINT "instagram_insight_sync_runs_unavailable_metrics_object_check" CHECK (jsonb_typeof("unavailable_metrics") = 'object'),
  CONSTRAINT "instagram_insight_sync_runs_social_account_id_user_id_fkey"
    FOREIGN KEY ("social_account_id", "user_id") REFERENCES "social_accounts"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "instagram_insight_sync_runs_user_id_social_account_id_scope_started_at_idx"
  ON "instagram_insight_sync_runs"("user_id", "social_account_id", "scope", "started_at");
CREATE INDEX "instagram_insight_sync_runs_social_account_id_status_started_at_idx"
  ON "instagram_insight_sync_runs"("social_account_id", "status", "started_at");

ALTER TABLE "instagram_insight_sync_states"
  ADD CONSTRAINT "instagram_insight_sync_states_last_run_id_user_id_social_account_id_fkey"
  FOREIGN KEY ("last_run_id", "user_id", "social_account_id")
  REFERENCES "instagram_insight_sync_runs"("id", "user_id", "social_account_id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "instagram_account_insights" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "social_account_id" UUID NOT NULL,
  "sync_run_id" UUID NOT NULL,
  "metric" VARCHAR(64) NOT NULL,
  "value" DECIMAL(20,0) NOT NULL,
  "period" VARCHAR(16) NOT NULL,
  "reference_date" DATE NOT NULL,
  "collected_at" TIMESTAMPTZ(3) NOT NULL,
  "source" VARCHAR(64) NOT NULL DEFAULT 'instagram_graph_api',
  "api_version" VARCHAR(16) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "instagram_account_insights_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instagram_account_insights_social_account_id_metric_period_reference_date_key"
    UNIQUE ("social_account_id", "metric", "period", "reference_date"),
  CONSTRAINT "instagram_account_insights_valid_metric_period_check" CHECK ("metric" = 'reach' AND "period" = 'day'),
  CONSTRAINT "instagram_account_insights_nonnegative_integer_value_check" CHECK ("value" >= 0 AND "value" = trunc("value")),
  CONSTRAINT "instagram_account_insights_social_account_id_user_id_fkey"
    FOREIGN KEY ("social_account_id", "user_id") REFERENCES "social_accounts"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "instagram_account_insights_sync_run_id_user_id_social_account_id_fkey"
    FOREIGN KEY ("sync_run_id", "user_id", "social_account_id") REFERENCES "instagram_insight_sync_runs"("id", "user_id", "social_account_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "instagram_account_insights_user_id_social_account_id_metric_reference_date_idx"
  ON "instagram_account_insights"("user_id", "social_account_id", "metric", "reference_date");

CREATE UNIQUE INDEX "instagram_media_posts_id_user_id_social_account_id_media_type_key"
  ON "instagram_media_posts"("id", "user_id", "social_account_id", "media_type");

CREATE TABLE "instagram_media_insights" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "social_account_id" UUID NOT NULL,
  "media_post_id" UUID NOT NULL,
  "media_type" VARCHAR(32) NOT NULL,
  "sync_run_id" UUID NOT NULL,
  "metric" VARCHAR(64) NOT NULL,
  "value" DECIMAL(20,0) NOT NULL,
  "period" VARCHAR(16) NOT NULL,
  "reference_date" DATE NOT NULL,
  "collected_at" TIMESTAMPTZ(3) NOT NULL,
  "source" VARCHAR(64) NOT NULL DEFAULT 'instagram_graph_api',
  "api_version" VARCHAR(16) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "instagram_media_insights_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instagram_media_insights_sync_run_id_media_post_id_metric_period_key"
    UNIQUE ("sync_run_id", "media_post_id", "metric", "period"),
  CONSTRAINT "instagram_media_insights_valid_metric_period_type_check"
    CHECK ("metric" IN ('reach', 'views', 'likes', 'comments', 'shares', 'saved', 'total_interactions') AND "period" = 'lifetime' AND "media_type" = 'CAROUSEL_ALBUM'),
  CONSTRAINT "instagram_media_insights_nonnegative_integer_value_check" CHECK ("value" >= 0 AND "value" = trunc("value")),
  CONSTRAINT "instagram_media_insights_social_account_id_user_id_fkey"
    FOREIGN KEY ("social_account_id", "user_id") REFERENCES "social_accounts"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "instagram_media_insights_sync_run_id_user_id_social_account_id_fkey"
    FOREIGN KEY ("sync_run_id", "user_id", "social_account_id") REFERENCES "instagram_insight_sync_runs"("id", "user_id", "social_account_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "instagram_media_insights_media_post_id_user_id_social_account_id_media_type_fkey"
    FOREIGN KEY ("media_post_id", "user_id", "social_account_id", "media_type") REFERENCES "instagram_media_posts"("id", "user_id", "social_account_id", "media_type") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "instagram_media_insights_user_id_social_account_id_media_post_id_metric_collected_at_idx"
  ON "instagram_media_insights"("user_id", "social_account_id", "media_post_id", "metric", "collected_at");
