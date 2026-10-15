CREATE TABLE "diagnostics" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "criteria_version" VARCHAR(40) NOT NULL,
    "profile_snapshot" JSONB NOT NULL,
    "input_fingerprint" VARCHAR(64) NOT NULL,
    "result" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'current',
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnostics_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "diagnostics_id_user_id_key" UNIQUE ("id", "user_id"),
    CONSTRAINT "diagnostics_version_positive" CHECK ("version" > 0),
    CONSTRAINT "diagnostics_status_check" CHECK ("status" IN ('current', 'superseded')),
    CONSTRAINT "diagnostics_fingerprint_check" CHECK ("input_fingerprint" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "diagnostics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "strategies" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "diagnostic_id" UUID NOT NULL,
    "objective" VARCHAR(500) NOT NULL,
    "plan" JSONB NOT NULL,
    "guardrails" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strategies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "strategies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "strategies_diagnostic_user_fkey" FOREIGN KEY ("diagnostic_id", "user_id") REFERENCES "diagnostics"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "diagnostics_user_id_version_key" ON "diagnostics"("user_id", "version");
CREATE UNIQUE INDEX "diagnostics_one_current_per_user" ON "diagnostics"("user_id") WHERE "status" = 'current';
CREATE INDEX "diagnostics_user_id_status_created_at_idx" ON "diagnostics"("user_id", "status", "created_at");
CREATE UNIQUE INDEX "strategies_diagnostic_id_key" ON "strategies"("diagnostic_id");
CREATE UNIQUE INDEX "strategies_diagnostic_id_user_id_key" ON "strategies"("diagnostic_id", "user_id");
CREATE INDEX "strategies_user_id_created_at_idx" ON "strategies"("user_id", "created_at");
