-- Domain constraints are kept in a SQL migration because Prisma schema has no
-- first-class representation for PostgreSQL CHECK constraints.
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase_check" CHECK ("email" = lower("email"));

ALTER TABLE "professional_profiles"
  ADD CONSTRAINT "professional_profiles_weekly_time_check"
    CHECK ("weekly_time_minutes" IS NULL OR "weekly_time_minutes" BETWEEN 0 AND 2400),
  ADD CONSTRAINT "professional_profiles_onboarding_step_check"
    CHECK ("onboarding_step" BETWEEN 0 AND 5),
  ADD CONSTRAINT "professional_profiles_onboarding_completion_check"
    CHECK ("onboarding_completed_at" IS NULL OR "onboarding_step" = 5),
  ADD CONSTRAINT "professional_profiles_service_mode_check"
    CHECK ("service_mode" IS NULL OR "service_mode" IN ('Presencial', 'Online', 'Híbrido')),
  ADD CONSTRAINT "professional_profiles_social_experience_check"
    CHECK ("social_experience" IS NULL OR "social_experience" IN ('Estou começando', 'Tenho alguma experiência', 'Tenho experiência avançada', 'Prefiro não informar')),
  ADD CONSTRAINT "professional_profiles_posting_frequency_check"
    CHECK ("posting_frequency" IS NULL OR "posting_frequency" IN ('Ainda não publico', 'Menos de uma vez por semana', '1 a 2 vezes por semana', '3 ou mais vezes por semana', 'Prefiro não informar')),
  ADD CONSTRAINT "professional_profiles_goals_count_check"
    CHECK (cardinality("professional_goals") <= 8),
  ADD CONSTRAINT "professional_profiles_preferences_count_check"
    CHECK (cardinality("communication_preferences") <= 8);

ALTER TABLE "auth_tokens"
  ADD CONSTRAINT "auth_tokens_purpose_check" CHECK ("purpose" IN ('verify_email', 'reset_password')),
  ADD CONSTRAINT "auth_tokens_expiry_check" CHECK ("expires_at" > "created_at");

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_expiry_check" CHECK ("expires_at" > "created_at");

ALTER TABLE "rate_limit_buckets"
  ADD CONSTRAINT "rate_limit_buckets_count_check" CHECK ("count" > 0);
