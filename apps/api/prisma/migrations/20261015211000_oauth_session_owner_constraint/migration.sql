-- The OAuth attempt's session must belong to the same user recorded on the attempt.
CREATE UNIQUE INDEX "sessions_id_user_id_key" ON "sessions"("id", "user_id");
ALTER TABLE "meta_oauth_attempts" DROP CONSTRAINT "meta_oauth_attempts_session_id_fkey";
ALTER TABLE "meta_oauth_attempts" ADD CONSTRAINT "meta_oauth_attempts_session_id_user_id_fkey"
  FOREIGN KEY ("session_id", "user_id") REFERENCES "sessions"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;
