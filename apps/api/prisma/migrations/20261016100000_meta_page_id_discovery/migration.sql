ALTER TABLE "meta_oauth_attempts"
  ADD COLUMN "page_discovery_token_ciphertext" TEXT,
  ADD COLUMN "page_discovery_scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "page_discovery_expires_at" TIMESTAMPTZ(3),
  ADD COLUMN "page_discovery_consumed_at" TIMESTAMPTZ(3),
  ADD COLUMN "page_discovery_attempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "meta_oauth_attempts_user_id_page_discovery_expires_at_idx"
  ON "meta_oauth_attempts"("user_id", "page_discovery_expires_at");

ALTER TABLE "meta_oauth_attempts"
  ADD CONSTRAINT "meta_oauth_attempts_page_discovery_attempts_check"
  CHECK ("page_discovery_attempts" >= 0 AND "page_discovery_attempts" <= 5);
