import { Module } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { IdentityController } from "./identity.controller";
import { IdentityService } from "./identity.service";

@Module({ controllers: [IdentityController], providers: [IdentityService, PrismaService], exports: [IdentityService] })
export class IdentityModule {}
