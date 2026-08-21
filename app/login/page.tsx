import { redirect } from "next/navigation";
import { auth, authEnabled, signIn } from "@/auth";

export default async function LoginPage() {
  if (!authEnabled) redirect("/");
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>
          فصيح<span className="brand-dot">.</span>
        </h1>
        <p>هذا التطبيق خاص — سجّلي الدخول بحساب Google المسموح له.</p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="login-btn" type="submit">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.6 2.8c2.2-2 3.8-5 3.8-8.5z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.6-2.8c-1 .7-2.4 1.2-4.3 1.2-3.3 0-6.1-2.2-7.1-5.2l-3.7 2.9C3.2 21.1 7.3 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M4.9 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3L1.2 6.8C.4 8.4 0 10.1 0 12s.4 3.6 1.2 5.2l3.7-2.9z"
              />
              <path
                fill="#EA4335"
                d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.2-3.1C17 1.1 15.2 0 12 0 7.3 0 3.2 2.9 1.2 6.8l3.7 2.9c1-3 3.8-5 7.1-5z"
              />
            </svg>
            الدخول بحساب Google
          </button>
        </form>
      </div>
    </div>
  );
}
