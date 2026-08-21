import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

/**
 * Closed-registration credential auth. Accounts exist only in AUTH_USERS:
 * comma-separated "username:salthex.hashhex" entries (PBKDF2-SHA256,
 * 600k iterations — generate with scripts/hash-password.mjs).
 *
 * Auth is active only when AUTH_USERS and AUTH_SECRET are configured;
 * without them the app runs open (local one-click launcher mode).
 */
export const authEnabled = Boolean(
  process.env.AUTH_USERS && process.env.AUTH_SECRET,
);

const PBKDF2_ITERATIONS = 600_000;

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// Web Crypto only — works in both the Node and Edge runtimes.
async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(".");
  if (!saltHex || !hashHex) return false;
  const salt = hexToBytes(saltHex);
  const expected = hexToBytes(hashHex);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS },
    key,
    expected.length * 8,
  );
  const actual = new Uint8Array(bits);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

function findStoredHash(username: string): string | null {
  for (const entry of (process.env.AUTH_USERS ?? "").split(",")) {
    const idx = entry.indexOf(":");
    if (idx < 1) continue;
    if (entry.slice(0, idx).trim().toLowerCase() === username) {
      return entry.slice(idx + 1).trim();
    }
  }
  return null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  providers: [
    Credentials({
      credentials: {
        username: { label: "اسم المستخدم" },
        password: { label: "كلمة المرور", type: "password" },
      },
      async authorize(creds) {
        const username = String(creds?.username ?? "").trim().toLowerCase();
        const password = String(creds?.password ?? "");
        const stored = username ? findStoredHash(username) : null;
        const ok = stored ? await verifyPassword(stored, password) : false;
        // Both lines land in the host's function logs — the audit trail of
        // who got in and who tried.
        if (ok) {
          console.log(`auth: sign-in ${username}`);
          return { id: username, name: username };
        }
        console.warn(`auth: BLOCKED login attempt for "${username || "(empty)"}"`);
        return null;
      },
    }),
  ],
  pages: { signIn: "/login" },
});
