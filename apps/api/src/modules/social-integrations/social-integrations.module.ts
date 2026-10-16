import { Module } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { IdentityModule } from "../identity/identity.module";
import { SocialIntegrationsController } from "./social-integrations.controller";
import { SocialIntegrationsService } from "./social-integrations.service";
import { InstagramInsightsPersistenceService } from "./instagram-insights-persistence.service";

@Module({
  imports: [IdentityModule],
  controllers: [SocialIntegrationsController],
  providers: [SocialIntegrationsService, InstagramInsightsPersistenceService, PrismaService],
})
export class SocialIntegrationsModule {}
