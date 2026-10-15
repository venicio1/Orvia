import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { IdentityModule } from "./identity/identity.module";
import { DiagnosticsModule } from "./diagnostics/diagnostics.module";

@Module({ imports: [HealthModule, IdentityModule, DiagnosticsModule] })
export class AppModule {}
