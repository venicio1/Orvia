import { Injectable } from "@nestjs/common";

@Injectable()
export class HealthService {
  check() {
    return { status: "ok", service: "orvia-api", timestamp: new Date().toISOString() } as const;
  }
}
