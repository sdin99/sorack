// PAT-at-rest encryption. AES-256-GCM with a per-record random IV; the
// stored blob is `enc:v1:` + base64(iv || authTag || ciphertext). Output
// is self-contained so we can rotate the encryption scheme later by
// adding `enc:v2:` and keeping `enc:v1:` decryption around.
//
// Legacy compatibility: if the stored value doesn't carry the `enc:v1:`
// prefix it's an older plaintext PAT (set before this scheme landed).
// decryptToken() returns it unchanged so the user can keep using the
// token; the next PATCH that touches it will re-store it encrypted.
//
// Master key: 32 bytes, base64 in env (`SORACK_GIT_TOKEN_KEY`). See
// lib/env.ts — missing → random + warn (same model as AUTH_SECRET).

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../lib/env";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PREFIX = "enc:v1:";

function key(): Buffer {
  // env.GIT_TOKEN_KEY is already validated as 32-byte base64 by env.ts.
  return Buffer.from(env.GIT_TOKEN_KEY, "base64");
}

export function encryptToken(plaintext: string): string {
  if (!plaintext) return plaintext;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptToken(stored: string | null | undefined): string | undefined {
  if (!stored) return undefined;
  if (!stored.startsWith(PREFIX)) {
    // Legacy plaintext — caller already has the cleartext. Returned as-is
    // so existing tokens keep working until the next PATCH re-encrypts.
    return stored;
  }
  try {
    const blob = Buffer.from(stored.slice(PREFIX.length), "base64");
    const iv = blob.subarray(0, IV_BYTES);
    const tag = blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ct = blob.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv(ALGO, key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch (e) {
    // Tampered or key-rotation mismatch — surface the failure rather than
    // returning garbage that would later produce a confusing auth error.
    console.warn("[git] failed to decrypt PAT — wrong SORACK_GIT_TOKEN_KEY?");
    return undefined;
  }
}
