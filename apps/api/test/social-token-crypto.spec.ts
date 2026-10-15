import { describe, expect, it } from "vitest";
import { decryptMetaToken, encryptMetaToken } from "../src/modules/social-integrations/token-crypto";

const key = Buffer.alloc(32, 19).toString("base64");

describe("Meta token encryption", () => {
  it("encrypts and decrypts a token using authenticated encryption", () => {
    const encrypted = encryptMetaToken("private-page-token", key);
    expect(encrypted).not.toContain("private-page-token");
    expect(encryptMetaToken("private-page-token", key)).not.toBe(encrypted);
    expect(decryptMetaToken(encrypted, key)).toBe("private-page-token");
  });

  it("rejects a modified envelope, a different key, and an invalid key length", () => {
    const encrypted = encryptMetaToken("private-page-token", key);
    const parts = encrypted.split(".");
    parts[3] = `${parts[3]?.slice(0, -1)}A`;
    expect(() => decryptMetaToken(parts.join("."), key)).toThrow();
    expect(() => decryptMetaToken(encrypted, Buffer.alloc(32, 20).toString("base64"))).toThrow();
    expect(() => encryptMetaToken("token", Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });
});
