// Usage: node scripts/hash-password.mjs <password>
// Prints the "salthex.hashhex" value to use in AUTH_USERS.
import { webcrypto as crypto } from "node:crypto";

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-password.mjs <password>");
  process.exit(1);
}

const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(password),
  "PBKDF2",
  false,
  ["deriveBits"],
);
const bits = await crypto.subtle.deriveBits(
  { name: "PBKDF2", hash: "SHA-256", salt, iterations: 600_000 },
  key,
  256,
);
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
console.log(`${hex(salt)}.${hex(bits)}`);
