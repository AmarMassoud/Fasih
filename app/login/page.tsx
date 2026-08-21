import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, authEnabled, signIn } from "@/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!authEnabled) redirect("/app");
  const session = await auth();
  if (session?.user) redirect("/app");
  const { error } = await searchParams;

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>
          فصيح<span className="brand-dot">.</span>
        </h1>
        <p>هذا التطبيق خاص — سجّلي الدخول للمتابعة.</p>
        <form
          action={async (formData) => {
            "use server";
            try {
              await signIn("credentials", {
                username: formData.get("username"),
                password: formData.get("password"),
                redirectTo: "/app",
              });
            } catch (err) {
              if (err instanceof AuthError) redirect("/login?error=1");
              throw err;
            }
          }}
        >
          <input
            className="login-input"
            name="username"
            placeholder="اسم المستخدم"
            autoComplete="username"
            dir="rtl"
            required
          />
          <input
            className="login-input"
            name="password"
            type="password"
            placeholder="كلمة المرور"
            autoComplete="current-password"
            dir="rtl"
            required
          />
          {error && (
            <p className="login-error">اسم المستخدم أو كلمة المرور غير صحيحة.</p>
          )}
          <button className="login-btn" type="submit">
            دخول
          </button>
        </form>
      </div>
    </div>
  );
}
