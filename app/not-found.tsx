import Link from "next/link";

export default function NotFound() {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>
          فصيح<span className="brand-dot">.</span>
        </h1>
        <p className="nf-code">٤٠٤</p>
        <p>هذه الصفحة غير موجودة.</p>
        <Link href="/" className="login-btn nf-btn">
          العودة إلى البداية
        </Link>
      </div>
    </div>
  );
}
