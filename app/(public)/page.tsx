import Link from "next/link";

export default function LandingPage() {
  return (
    <>
      <section className="hero">
        <h1 className="hero-title">
          قُل بلهجتك،
          <br />
          واسمعها بالفصحى.
        </h1>
        <p className="hero-sub">
          فصيح يستمع إلى كلامك بالعامية — مصرية، خليجية، شامية، عراقية، مغربية —
          ويعيده إليك نصاً وصوتاً بالعربية الفصحى، في ثوانٍ.
        </p>
        <Link href="/app" className="hero-btn">
          ابدأ الآن
        </Link>

        <div className="hero-example" dir="rtl">
          <div className="hero-example-aamiya">«إزيك؟ عامل إيه النهارده؟»</div>
          <div className="hero-example-arrow" aria-hidden>
            ↓
          </div>
          <div className="hero-example-fusha">
            كَيفَ حالُكَ؟ ماذا تَفعَلُ اليَومَ؟
          </div>
        </div>
      </section>

      <section className="steps">
        <h2>كيف يعمل؟</h2>
        <div className="steps-grid">
          <div className="step">
            <div className="step-num">١</div>
            <h3>تكلّم</h3>
            <p>اضغط زر الميكروفون وقل ما تشاء بلهجتك، أو اكتبه كتابة.</p>
          </div>
          <div className="step">
            <div className="step-num">٢</div>
            <h3>يتحوّل</h3>
            <p>يتوقف التسجيل وحده عندما تسكت، ويظهر كلامك بالفصحى مشكولاً.</p>
          </div>
          <div className="step">
            <div className="step-num">٣</div>
            <h3>استمع</h3>
            <p>تُقرأ الفصحى عليك بصوت واضح، ويبقى كل شيء محفوظاً في سجلّك.</p>
          </div>
        </div>
      </section>

      <section className="dialects">
        <h2>يفهم لهجتك</h2>
        <div className="chips" dir="rtl">
          <span className="chip">مصرية</span>
          <span className="chip">خليجية</span>
          <span className="chip">شامية</span>
          <span className="chip">عراقية</span>
          <span className="chip">مغربية</span>
        </div>
      </section>
    </>
  );
}
