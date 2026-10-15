import { describe, expect, it, vi } from "vitest";
import { DiagnosticsService } from "../src/modules/diagnostics/diagnostics.service";
import { PrismaService } from "../src/database/prisma.service";

describe("DiagnosticsService persistence failures", () => {
  it("propagates a failed persistence operation instead of returning an unpersisted diagnosis", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: false }]),
      professionalProfile: { findUnique: vi.fn().mockResolvedValue({
        profession: "Psicóloga", specialty: null, region: null, targetAudience: null, professionalGoals: [], weeklyTimeMinutes: 0,
        socialExperience: null, postingFrequency: null, serviceMode: null, communicationPreferences: [],
      }) },
      diagnostic: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockRejectedValue(new Error("disco indisponível")), update: vi.fn() },
    };
    const db = { $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) };
    const service = new DiagnosticsService(db as unknown as PrismaService);

    await expect(service.generateOrReturnCurrent("a0b66fe1-7dc6-4d08-ad20-c09c42d30c7c")).rejects.toThrow("disco indisponível");
    expect(tx.diagnostic.create).toHaveBeenCalledOnce();
  });
});
