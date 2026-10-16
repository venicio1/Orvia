ALTER TABLE "meta_oauth_attempts"
  ADD COLUMN "intent" VARCHAR(40) NOT NULL DEFAULT 'connection',
  ADD COLUMN "target_social_account_id" UUID,
  ADD COLUMN "expected_page_id" VARCHAR(128),
  ADD COLUMN "expected_instagram_account_id" VARCHAR(128);

CREATE INDEX "meta_oauth_attempts_target_social_account_id_expires_at_idx"
  ON "meta_oauth_attempts"("target_social_account_id", "expires_at");

ALTER TABLE "meta_oauth_attempts"
  ADD CONSTRAINT "meta_oauth_attempts_target_social_account_id_user_id_fkey"
  FOREIGN KEY ("target_social_account_id", "user_id")
  REFERENCES "social_accounts"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "meta_oauth_attempts"
  ADD CONSTRAINT "meta_oauth_attempts_insights_reauthorization_fields_check"
  CHECK (
    ("intent" = 'connection' AND "target_social_account_id" IS NULL AND "expected_page_id" IS NULL AND "expected_instagram_account_id" IS NULL)
    OR
    ("intent" = 'insights_reauthorization' AND "target_social_account_id" IS NOT NULL AND "expected_page_id" IS NOT NULL AND "expected_instagram_account_id" IS NOT NULL)
  );
