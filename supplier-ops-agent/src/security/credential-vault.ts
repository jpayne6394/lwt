import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type EncryptedCredential = {
  algorithm: "aes-256-gcm";
  iv: string;
  authTag: string;
  ciphertext: string;
};

export type SupplierCredential = {
  username: string;
  password: string;
  otpSecret?: string;
};

export class CredentialVault {
  readonly #key: Buffer;

  constructor(secret: string) {
    const key = Buffer.from(secret);
    if (key.byteLength !== 32) {
      throw new Error("Credential encryption secret must be exactly 32 bytes");
    }
    this.#key = key;
  }

  encrypt(credential: SupplierCredential): EncryptedCredential {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    const plaintext = JSON.stringify(credential);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      algorithm: "aes-256-gcm",
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
  }

  decrypt(encrypted: EncryptedCredential): SupplierCredential {
    const decipher = createDecipheriv("aes-256-gcm", this.#key, Buffer.from(encrypted.iv, "base64"));
    decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");

    return JSON.parse(plaintext) as SupplierCredential;
  }
}

