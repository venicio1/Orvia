import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { PrismaService } from "../../database/prisma.service";
import { DiagnosticsController } from "./diagnostics.controller";
import { DiagnosticsService } from "./diagnostics.service";

@Module({ imports: [IdentityModule], controllers: [DiagnosticsController], providers: [DiagnosticsService, PrismaService] })
export class DiagnosticsModule {}
