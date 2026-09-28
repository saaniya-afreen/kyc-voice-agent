// AES-256-GCM encryption for the one genuinely sensitive field this system stores
// at rest: the SSN captured on a FATCA/US-indicia case (UC-2.2). The key lives only
// in the SSN_ENCRYPTION_KEY environment variable — never in the database — so a DB
// dump alone can't recover a plaintext SSN.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../env.js";

function getKey(): Buffer {
  const key = Buffer.from(env.ssnEncryptionKey, "base64");
  if (key.length !== 32) throw new Error("SSN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return key;
}

// Layout: iv (12 bytes) | authTag (16 bytes) | ciphertext — stored as one bytea column.
export function encryptSsn(plain: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptSsn(stored: Buffer): string {
  const iv = stored.subarray(0, 12);
  const authTag = stored.subarray(12, 28);
  const ciphertext = stored.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
