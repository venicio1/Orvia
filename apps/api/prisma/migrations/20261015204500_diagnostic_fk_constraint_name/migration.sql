-- Align the existing Phase 1B composite foreign-key name with the Prisma schema.
-- This is a metadata-only rename; the relationship and validation remain unchanged.
ALTER TABLE "strategies" RENAME CONSTRAINT "strategies_diagnostic_user_fkey" TO "strategies_diagnostic_id_user_id_fkey";
