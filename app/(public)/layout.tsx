import Link from "next/link";

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="pub">
      <header className="pub-header">
        <Link href="/" className="pub-brand">
          فصيح<span className="brand-dot">.</span>
        </Link>
        <nav className="pub-nav">
          <Link href="/help">المساعدة</Link>
          <Link href="/about">عن فصيح</Link>
          <Link href="/app" className="pub-cta">
            دخول
          </Link>
        </nav>
      </header>
      <main className="pub-main">{children}</main>
      <footer className="pub-footer">
        <div className="pub-footer-links">
          <Link href="/about">عن فصيح</Link>
          <Link href="/help">المساعدة</Link>
          <Link href="/privacy">الخصوصية</Link>
          <Link href="/terms">الشروط</Link>
        </div>
        <p>فصيح: من العامية إلى الفصحى.</p>
      </footer>
    </div>
  );
}
