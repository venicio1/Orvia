import { BadRequestException, Body, Controller, Get, Headers, Inject, Ip, Patch, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { strictDto } from "../../common/strict-dto";
import { EmailDto, LoginDto, ProfileDto, RegisterDto, ResetPasswordDto, TokenDto } from "./identity.dto";
import { IdentityService } from "./identity.service";

type SessionRequest = Request & { orviaSession?: { id: string; csrfHash: string; userId: string; user: { id: string; email: string; emailVerifiedAt: Date | null; profile: { onboardingCompletedAt: Date | null } | null } } };
const cookieOptions = (httpOnly: boolean) => ({ httpOnly, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 7 * 24 * 60 * 60 * 1000 });

@Controller("auth")
export class IdentityController {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService) {}

  private originCheck(origin?: string) {
    const allowed = process.env.WEB_PUBLIC_URL ?? "http://localhost:3000";
    if (!origin || origin !== allowed) throw new BadRequestException({ code: "invalid_origin", message: "Origem da solicitação não permitida." });
  }
  private async session(req: SessionRequest) {
    const session = await this.identity.authenticate(req.cookies?.orvia_session);
    return session;
  }
  private async csrf(req: SessionRequest, header?: string) {
    const session = await this.session(req);
    this.identity.assertCsrf(session.csrfHash, req.cookies?.orvia_csrf, header);
    return session;
  }

  @Post("register") async register(@Body() body: RegisterDto, @Ip() ip: string, @Headers("origin") origin?: string) {
    const input = await strictDto(RegisterDto, body);
    this.originCheck(origin); await this.identity.limit(`register-ip:${ip}`, 5, 3600); await this.identity.limit(`register-email:${input.email.trim().toLowerCase()}`, 3, 3600);
    return this.identity.register(input.email, input.password);
  }
  @Post("verify-email") async verifyEmail(@Body() body: TokenDto, @Headers("origin") origin?: string) { const input = await strictDto(TokenDto, body); this.originCheck(origin); return this.identity.verifyEmail(input.token); }
  @Post("resend-verification") async resend(@Body() body: EmailDto, @Ip() ip: string, @Headers("origin") origin?: string) { const input = await strictDto(EmailDto, body); this.originCheck(origin); await this.identity.limit(`verify-ip:${ip}`, 5, 3600); await this.identity.limit(`verify-email:${input.email.trim().toLowerCase()}`, 3, 3600); return this.identity.requestVerification(input.email); }

  @Post("login") async login(@Body() body: LoginDto, @Ip() ip: string, @Headers("user-agent") userAgent: string | undefined, @Headers("origin") origin: string | undefined, @Res({ passthrough: true }) res: Response) {
    const input = await strictDto(LoginDto, body);
    this.originCheck(origin); await this.identity.limit(`login-ip:${ip}`, 15, 900); await this.identity.limit(`login-email:${input.email.trim().toLowerCase()}`, 8, 900);
    const result = await this.identity.login(input.email, input.password, { userAgent });
    res.cookie("orvia_session", result.token, cookieOptions(true)); res.cookie("orvia_csrf", result.csrf, cookieOptions(false));
    return { user: result.user };
  }
  @Get("me") async me(@Req() req: SessionRequest) { const session = await this.session(req); return { user: { id: session.user.id, email: session.user.email, emailVerified: Boolean(session.user.emailVerifiedAt), onboardingCompleted: Boolean(session.user.profile?.onboardingCompletedAt) } }; }
  @Post("logout") async logout(@Req() req: SessionRequest, @Headers("x-csrf-token") csrf: string | undefined, @Headers("origin") origin: string | undefined, @Res({ passthrough: true }) res: Response) {
    this.originCheck(origin); const session = await this.csrf(req, csrf); await this.identity.logout(session.id);
    const clearOptions = { path: "/", secure: process.env.NODE_ENV === "production", sameSite: "lax" as const };
    res.clearCookie("orvia_session", { ...clearOptions, httpOnly: true }); res.clearCookie("orvia_csrf", { ...clearOptions, httpOnly: false }); return { message: "Sessão encerrada." };
  }
  @Post("forgot-password") async forgotPassword(@Body() body: EmailDto, @Ip() ip: string, @Headers("origin") origin?: string) { const input = await strictDto(EmailDto, body); this.originCheck(origin); await this.identity.limit(`reset-ip:${ip}`, 5, 3600); await this.identity.limit(`reset-email:${input.email.trim().toLowerCase()}`, 3, 3600); return this.identity.requestPasswordReset(input.email); }
  @Post("reset-password") async resetPassword(@Body() body: ResetPasswordDto, @Headers("origin") origin?: string) { const input = await strictDto(ResetPasswordDto, body); this.originCheck(origin); return this.identity.resetPassword(input.token, input.password); }

  @Get("profile") async getProfile(@Req() req: SessionRequest) { const session = await this.session(req); return { profile: await this.identity.getProfile(session.userId) }; }
  @Patch("profile") async saveProfile(@Req() req: SessionRequest, @Body() body: ProfileDto, @Headers("x-csrf-token") csrf: string | undefined, @Headers("origin") origin: string | undefined) {
    const input = await strictDto(ProfileDto, body);
    this.originCheck(origin); const session = await this.csrf(req, csrf); return { profile: await this.identity.saveProfile(session.userId, input) };
  }
}
