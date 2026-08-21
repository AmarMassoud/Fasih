import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Auth is active only when Google OAuth credentials are configured
 * (the hosted deployment). Local/offline copies run open, so the
 * one-click Windows launcher keeps working with zero setup.
 */
export const authEnabled = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    signIn({ user }) {
      const email = user.email?.toLowerCase();
      const ok = Boolean(email) && allowedEmails.includes(email!);
      // Both lines land in the host's function logs — the audit trail of
      // who got in and who tried.
      if (ok) console.log(`auth: sign-in ${email}`);
      else console.warn(`auth: BLOCKED sign-in attempt ${email ?? "(no email)"}`);
      return ok;
    },
  },
  pages: { signIn: "/login" },
});
