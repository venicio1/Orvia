import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { IdentityModule } from "./identity/identity.module";
import { DiagnosticsModule } from "./diagnostics/diagnostics.module";
import { SocialIntegrationsModule } from "./social-integrations/social-integrations.module";

@Module({ imports: [HealthModule, IdentityModule, DiagnosticsModule, SocialIntegrationsModule] })
export class AppModule {}
