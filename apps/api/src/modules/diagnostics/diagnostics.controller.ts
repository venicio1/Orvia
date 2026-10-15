import { BadRequestException, Body, Controller, Get, Headers, Inject, Param, ParseUUIDPipe, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { IdentityService } from "../identity/identity.service";
import { DiagnosticsService } from "./diagnostics.service";

type SessionRequest = Request & { orviaSession?: { id: string; csrfHash: string; userId: string } };

@Controller("diagnostics")
export class DiagnosticsController {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService, @Inject(DiagnosticsService) private readonly diagnostics: DiagnosticsService) {}

  private originCheck(origin?: string) {
    if (!origin || origin !== (process.env.WEB_PUBLIC_URL ?? "http://localhost:3000")) throw new BadRequestException({ code: "invalid_origin", message: "Origem da solicitação não permitida." });
  }

  private async user(req: SessionRequest) {
    const session = await this.identity.authenticate(req.cookies?.orvia_session);
    req.orviaSession = session;
    return session.userId;
  }

  private csrf(req: SessionRequest, header?: string) {
    const session = req.orviaSession;
    if (!session) throw new BadRequestException({ code: "csrf_failed", message: "Não foi possível validar a solicitação." });
    this.identity.assertCsrf(session.csrfHash, req.cookies?.orvia_csrf, header);
  }

  private assertEmptyInput(body: unknown) {
    if (body !== undefined && (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).length > 0)) {
      throw new BadRequestException({ code: "invalid_input", message: "Esta solicitação não aceita campos adicionais." });
    }
  }

  @Post()
  async generate(@Req() req: SessionRequest, @Body() body: unknown, @Headers("origin") origin?: string, @Headers("x-csrf-token") csrf?: string) {
    this.assertEmptyInput(body);
    this.originCheck(origin);
    const userId = await this.user(req);
    this.csrf(req, csrf);
    return { diagnostic: await this.diagnostics.generateOrReturnCurrent(userId) };
  }

  @Get()
  async history(@Req() req: SessionRequest) { return { diagnostics: await this.diagnostics.history(await this.user(req)) }; }

  @Get(":id")
  async get(@Req() req: SessionRequest, @Param("id", ParseUUIDPipe) id: string) { return { diagnostic: await this.diagnostics.get(await this.user(req), id) }; }

  @Patch(":id/review")
  async review(@Req() req: SessionRequest, @Param("id", ParseUUIDPipe) id: string, @Headers("origin") origin?: string, @Headers("x-csrf-token") csrf?: string) {
    this.originCheck(origin);
    const userId = await this.user(req);
    this.csrf(req, csrf);
    return { diagnostic: await this.diagnostics.markReviewed(userId, id) };
  }
}
