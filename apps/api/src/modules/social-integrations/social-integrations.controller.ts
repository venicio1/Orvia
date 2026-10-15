import { BadRequestException, Body, Controller, Delete, Get, Headers, Inject, Param, ParseUUIDPipe, Post, Query, Req, Res } from "@nestjs/common";
import { IsString, Matches, MaxLength } from "class-validator";
import type { Request, Response } from "express";
import { IdentityService } from "../identity/identity.service";
import { SocialIntegrationsService } from "./social-integrations.service";

type SessionRequest = Request & { orviaSession?: { id: string; csrfHash: string; userId: string } };

class ResolvePageDto {
  @IsString() @MaxLength(32) @Matches(/^\d{1,32}$/) pageId!: string;
}

@Controller("integrations/meta")
export class SocialIntegrationsController {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(SocialIntegrationsService) private readonly integrations: SocialIntegrationsService,
  ) {}

  private originCheck(origin?: string) {
    if (!origin || origin !== (process.env.WEB_PUBLIC_URL ?? "http://localhost:3000")) {
      throw new BadRequestException({ code: "invalid_origin", message: "Origem da solicitação não permitida." });
    }
  }

  private async session(req: SessionRequest) {
    const session = await this.identity.authenticate(req.cookies?.orvia_session);
    req.orviaSession = session;
    return session;
  }

  private csrf(req: SessionRequest, header?: string) {
    const session = req.orviaSession;
    if (!session) throw new BadRequestException({ code: "csrf_failed", message: "Não foi possível validar a solicitação." });
    this.identity.assertCsrf(session.csrfHash, req.cookies?.orvia_csrf, header);
  }

  @Get("status")
  async status(@Req() req: SessionRequest) {
    const session = await this.session(req);
    return this.integrations.status(session.userId);
  }

  @Post("connect")
  async connect(@Req() req: SessionRequest, @Headers("x-csrf-token") csrf: string | undefined, @Headers("origin") origin: string | undefined) {
    this.originCheck(origin);
    const session = await this.session(req);
    this.csrf(req, csrf);
    return this.integrations.begin(session.userId, session.id);
  }

  @Post("connect/page")
  async connectPage(
    @Req() req: SessionRequest,
    @Body() body: ResolvePageDto,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    this.originCheck(origin);
    const session = await this.session(req);
    this.csrf(req, csrf);
    return this.integrations.connectPageById(session.userId, session.id, body.pageId);
  }

  @Get("callback")
  async callback(
    @Req() req: SessionRequest,
    @Query("state") state: string | undefined,
    @Query("code") code: string | undefined,
    @Query("error") oauthError: string | undefined,
    @Res() response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store, max-age=0");
    response.setHeader("Referrer-Policy", "no-referrer");
    let outcome: string;
    let session: SessionRequest["orviaSession"];
    try {
      session = await this.session(req);
    } catch {
      outcome = "session_expired";
    }
    if (!session) outcome = "session_expired";
    else {
      try { outcome = await this.integrations.complete(session.userId, session.id, state, code, oauthError); }
      catch { outcome = "failed"; }
    }
    const webUrl = process.env.WEB_PUBLIC_URL ?? "http://localhost:3000";
    const destination = new URL("/configuracoes", webUrl);
    destination.searchParams.set("meta", outcome);
    response.redirect(303, destination.toString());
  }

  @Delete("accounts/:id")
  async disconnect(
    @Req() req: SessionRequest,
    @Param("id", new ParseUUIDPipe()) accountId: string,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    this.originCheck(origin);
    const session = await this.session(req);
    this.csrf(req, csrf);
    return this.integrations.disconnect(session.userId, accountId);
  }
}
