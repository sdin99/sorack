// Password hashing with Node's built-in scrypt — no native deps, safe on
// alpine/musl. Parameters are encoded into the stored string so the cost
// can be raised later without breaking existing hashes:
//   scrypt$N$r$p$saltBase64$hashBase64
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

const N = 16384; // CPU/memory cost (2^14)
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;

export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_BYTES);
  const dk = scryptSync(plain, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${dk.toString("base64")}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  let dk: Buffer;
  try {
    dk = scryptSync(plain, salt, expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  } catch {
    return false;
  }
  return dk.length === expected.length && timingSafeEqual(dk, expected);
}
