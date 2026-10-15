CREATE TABLE "meta_oauth_attempts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "state_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "meta_oauth_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "social_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "provider_account_id" VARCHAR(128) NOT NULL,
    "page_id" VARCHAR(128) NOT NULL,
    "page_name" VARCHAR(255),
    "username" VARCHAR(255),
    "granted_scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "access_token_ciphertext" TEXT,
    "token_expires_at" TIMESTAMPTZ(3),
    "status" VARCHAR(32) NOT NULL DEFAULT 'connected',
    "connected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnected_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "social_sync_runs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "social_account_id" UUID,
    "provider" VARCHAR(40) NOT NULL,
    "operation" VARCHAR(64) NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    "records_read" INTEGER NOT NULL DEFAULT 0,
    "error_code" VARCHAR(64),
    CONSTRAINT "social_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "meta_oauth_attempts_state_hash_key" ON "meta_oauth_attempts"("state_hash");
CREATE INDEX "meta_oauth_attempts_user_id_expires_at_idx" ON "meta_oauth_attempts"("user_id", "expires_at");
CREATE INDEX "meta_oauth_attempts_session_id_expires_at_idx" ON "meta_oauth_attempts"("session_id", "expires_at");
CREATE UNIQUE INDEX "social_accounts_user_id_provider_provider_account_id_key" ON "social_accounts"("user_id", "provider", "provider_account_id");
CREATE INDEX "social_accounts_user_id_provider_status_idx" ON "social_accounts"("user_id", "provider", "status");
CREATE INDEX "social_sync_runs_user_id_provider_started_at_idx" ON "social_sync_runs"("user_id", "provider", "started_at");
CREATE INDEX "social_sync_runs_social_account_id_started_at_idx" ON "social_sync_runs"("social_account_id", "started_at");

ALTER TABLE "meta_oauth_attempts" ADD CONSTRAINT "meta_oauth_attempts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meta_oauth_attempts" ADD CONSTRAINT "meta_oauth_attempts_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "social_sync_runs" ADD CONSTRAINT "social_sync_runs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "social_sync_runs" ADD CONSTRAINT "social_sync_runs_social_account_id_fkey"
  FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_status_check"
  CHECK ("status" IN ('connected', 'reauthorization_required', 'disconnected'));
ALTER TABLE "social_sync_runs" ADD CONSTRAINT "social_sync_runs_status_check"
  CHECK ("status" IN ('running', 'succeeded', 'failed', 'cancelled'));
ALTER TABLE "social_sync_runs" ADD CONSTRAINT "social_sync_runs_records_read_check"
  CHECK ("records_read" >= 0);
