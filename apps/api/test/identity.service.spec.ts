import { afterEach, describe, expect, it, vi } from "vitest";
import { scrypt as scryptCallback } from "node:crypto";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { IdentityService } from "../src/modules/identity/identity.service";
import { PrismaService } from "../src/database/prisma.service";

const cost = 1 << 17;
async function encode(password: string) {
  const salt = Buffer.alloc(16, 11);
  const key = await new Promise<Buffer>((resolve, reject) => scryptCallback(password, salt, 64, { N: cost, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, result) => error ? reject(error) : resolve(result as Buffer)));
  return `scrypt$${cost}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

const user = { id: "0f30caa8-3b9c-47f3-b021-7fd50bdf3430", email: "pro@example.com", passwordHash: "", emailVerifiedAt: new Date() };
function setup() {
  const db = {
    user: { findUnique: vi.fn(), create: vi.fn(), findUniqueOrThrow: vi.fn() },
    session: { create: vi.fn(), deleteMany: vi.fn() },
    authToken: { deleteMany: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
    professionalProfile: { update: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    rateLimitBucket: { deleteMany: vi.fn() },
    $queryRaw: vi.fn(), $executeRaw: vi.fn(), $transaction: vi.fn(),
  };
  return { db, service: new IdentityService(db as unknown as PrismaService) };
}

describe("IdentityService", () => {
  afterEach(() => vi.restoreAllMocks());

  it("normalizes email, verifies a password hash and stores only a session hash", async () => {
    const { db, service } = setup();
    const passwordHash = await encode("correct horse battery staple");
    db.user.findUnique.mockResolvedValue({ ...user, passwordHash });
    db.session.create.mockResolvedValue({});
    db.professionalProfile.findUnique.mockResolvedValue({ onboardingCompletedAt: null });
    const result = await service.login(" PRO@Example.com ", "correct horse battery staple", {});
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { email: "pro@example.com" } });
    expect(db.session.create.mock.calls[0][0].data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(db.session.create.mock.calls[0][0].data.tokenHash).not.toBe(result.token);
    expect(result.user).toMatchObject({ id: user.id, email: user.email });
    expect(result.user).not.toHaveProperty("passwordHash");
  });

  it("rejects invalid credentials without creating a session", async () => {
    const { db, service } = setup();
    db.user.findUnique.mockResolvedValue(null);
    await expect(service.login("unknown@example.com", "wrong password", {})).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.session.create).not.toHaveBeenCalled();
  });

  it("rejects a short login password with generic credentials failure, not signup-policy validation", async () => {
    const { db, service } = setup();
    db.user.findUnique.mockResolvedValue({ ...user, passwordHash: await encode("a longer password") });
    await expect(service.login("pro@example.com", "short", {})).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.session.create).not.toHaveBeenCalled();
  });

  it("requires matching CSRF cookie, header and session binding", () => {
    const { service } = setup();
    const token = "a-secure-random-token";
    expect(() => service.assertCsrf("unrelated", token, token)).toThrow(BadRequestException);
    expect(() => service.assertCsrf("hash", token, "other")).toThrow(BadRequestException);
  });

  it("scopes a profile update to the authenticated user id supplied by the caller", async () => {
    const { db, service } = setup();
    db.professionalProfile.update.mockResolvedValue({ userId: user.id });
    await service.saveProfile(user.id, { profession: "Fisioterapeuta", onboardingStep: 2, userId: "spoofed-user" } as never);
    expect(db.professionalProfile.update).toHaveBeenCalledWith({ where: { userId: user.id }, data: { professionalName: undefined, profession: "Fisioterapeuta", specialty: undefined, city: undefined, region: undefined, serviceMode: undefined, targetAudience: undefined, professionalGoals: undefined, weeklyTimeMinutes: undefined, socialExperience: undefined, postingFrequency: undefined, communicationPreferences: undefined, onboardingStep: 2 } });
  });

  it("rejects profile completion until required professional fields are present", async () => {
    const { db, service } = setup();
    db.professionalProfile.findUniqueOrThrow.mockResolvedValue({ professionalName: null, profession: "Nutricionista", serviceMode: null });
    await expect(service.saveProfile(user.id, { completeOnboarding: true })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.professionalProfile.update).not.toHaveBeenCalled();
  });

  it("blocks requests above the configured atomic rate limit", async () => {
    const { db, service } = setup();
    db.$queryRaw.mockResolvedValue([{ count: 4 }]);
    await expect(service.limit("login-ip:127.0.0.1", 3, 900)).rejects.toMatchObject({ status: 429 });
  });

  it("validates DTO properties and rejects unexpected fields", async () => {
    const { strictDto } = await import("../src/common/strict-dto");
    const { EmailDto } = await import("../src/modules/identity/identity.dto");
    await expect(strictDto(EmailDto, { email: "person@example.com", role: "admin" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(strictDto(EmailDto, { email: "not-an-email" })).rejects.toBeInstanceOf(BadRequestException);
    const { RegisterDto, LoginDto } = await import("../src/modules/identity/identity.dto");
    await expect(strictDto(RegisterDto, { email: "person@example.com", password: "short" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(strictDto(RegisterDto, { email: "  PERSON@example.com  ", password: "a sufficiently long password" })).resolves.toMatchObject({ email: "PERSON@example.com" });
    await expect(strictDto(LoginDto, { email: "person@example.com", password: "short" })).resolves.toMatchObject({ password: "short" });
    const { ProfileDto } = await import("../src/modules/identity/identity.dto");
    await expect(strictDto(ProfileDto, { professionalGoals: null })).rejects.toBeInstanceOf(BadRequestException);
    await expect(strictDto(ProfileDto, { onboardingStep: null })).rejects.toBeInstanceOf(BadRequestException);
  });
});
