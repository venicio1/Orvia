-- A sync run may only reference an account owned by the same Orvia user.
CREATE UNIQUE INDEX "social_accounts_id_user_id_key" ON "social_accounts"("id", "user_id");
ALTER TABLE "social_sync_runs" DROP CONSTRAINT "social_sync_runs_social_account_id_fkey";
ALTER TABLE "social_sync_runs" ADD CONSTRAINT "social_sync_runs_social_account_id_user_id_fkey"
  FOREIGN KEY ("social_account_id", "user_id") REFERENCES "social_accounts"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;
