-- A user can have only one current token for each purpose. Reissues replace it.
CREATE UNIQUE INDEX "auth_tokens_user_id_purpose_key"
  ON "auth_tokens"("user_id", "purpose");
