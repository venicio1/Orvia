import { describe, expect, it } from "vitest";
import { HealthService } from "../src/modules/health/health.service";

describe("HealthService", () => {
  it("reports the API as live with an ISO timestamp", () => {
    const result = new HealthService().check();
    expect(result.status).toBe("ok");
    expect(result.service).toBe("orvia-api");
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });
});
