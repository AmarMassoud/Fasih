"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface HistoryEntry {
  id: string;
  dialect: string;
  fusha: string;
  ts: number;
}

const HISTORY_KEY = "fasih-history";
const THEME_KEY = "fasih-theme";

const DIALECTS: { value: string; label: string; sttLang: string }[] = [
  { value: "", label: "اللهجة: تلقائي", sttLang: "ar-SA" },
  { value: "مصرية", label: "مصرية", sttLang: "ar-EG" },
  { value: "خليجية", label: "خليجية", sttLang: "ar-SA" },
  { value: "شامية", label: "شامية", sttLang: "ar-JO" },
  { value: "عراقية", label: "عراقية", sttLang: "ar-IQ" },
  { value: "مغربية", label: "مغربية", sttLang: "ar-MA" },
];

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 100)));
  } catch {
    // storage full or blocked — history just won't persist
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString("ar", {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });
}

/** Browser speech synthesis fallback — completely free, works offline on many devices. */
function speakWithBrowser(text: string, onDone: () => void) {
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ar-SA";
  const arVoice = window.speechSynthesis
    .getVoices()
    .find((v) => v.lang.startsWith("ar"));
  if (arVoice) utter.voice = arVoice;
  utter.onend = onDone;
  utter.onerror = onDone;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

export default function Home() {
  const [text, setText] = useState("");
  const [dialect, setDialect] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [converting, setConverting] = useState(false);
  const [listening, setListening] = useState(false);
  const [sttSupported, setSttSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const baseTextRef = useRef("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCache = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    setHistory(loadHistory());
    setHydrated(true);
    setSttSupported(
      typeof window !== "undefined" &&
        Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    );
    // Chrome loads voices asynchronously; touching getVoices() warms the list
    // so the fallback narrator can find an Arabic voice later.
    window.speechSynthesis?.getVoices();
    const cache = audioCache.current;
    return () => {
      recognitionRef.current?.abort();
      cache.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const toggleTheme = () => {
    const next =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // ignore
    }
  };

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setSttSupported(false);
      return;
    }
    setError(null);
    const rec = new Ctor();
    const selected = DIALECTS.find((d) => d.value === dialect) ?? DIALECTS[0];
    rec.lang = selected.sttLang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    baseTextRef.current = text ? text.trim() + " " : "";

    rec.onresult = (e) => {
      let finalText = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      setText((baseTextRef.current + finalText + interim).trimStart());
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("لم يُسمح باستخدام الميكروفون. فعّل الإذن من إعدادات المتصفح.");
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        setError("تعذر التعرف على الصوت، حاول مرة أخرى.");
      }
    };
    rec.onend = () => setListening(false);

    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [dialect, text]);

  const convert = useCallback(async () => {
    const input = text.trim();
    if (!input || converting) return;
    if (listening) stopListening();

    setConverting(true);
    setError(null);
    setNeedsKey(false);
    try {
      const res = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input, dialect: dialect || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNeedsKey(Boolean(data.needsKey));
        setError(data.error || "حدث خطأ غير متوقع.");
        return;
      }
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        dialect: input,
        fusha: data.fusha,
        ts: Date.now(),
      };
      setHistory((prev) => {
        const next = [entry, ...prev];
        saveHistory(next);
        return next;
      });
      setText("");
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setConverting(false);
    }
  }, [text, dialect, converting, listening, stopListening]);

  const play = useCallback(
    async (entry: HistoryEntry) => {
      // Toggle off if this entry is already playing.
      if (playingId === entry.id) {
        audioRef.current?.pause();
        window.speechSynthesis?.cancel();
        setPlayingId(null);
        return;
      }
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();

      const cached = audioCache.current.get(entry.id);
      if (cached) {
        const audio = new Audio(cached);
        audioRef.current = audio;
        audio.onended = () => setPlayingId(null);
        setPlayingId(entry.id);
        audio.play();
        return;
      }

      setLoadingAudioId(entry.id);
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: entry.fusha }),
        });
        if (!res.ok) throw new Error("tts-failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        audioCache.current.set(entry.id, url);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => setPlayingId(null);
        setPlayingId(entry.id);
        await audio.play();
      } catch {
        // Free fallback: the browser's own speech synthesis.
        setPlayingId(entry.id);
        speakWithBrowser(entry.fusha, () => setPlayingId(null));
      } finally {
        setLoadingAudioId(null);
      }
    },
    [playingId],
  );

  const copy = useCallback(async (entry: HistoryEntry) => {
    try {
      await navigator.clipboard.writeText(entry.fusha);
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // clipboard blocked — nothing to do
    }
  }, []);

  const clearHistory = () => {
    setHistory([]);
    saveHistory([]);
    audioCache.current.forEach((url) => URL.revokeObjectURL(url));
    audioCache.current.clear();
  };

  return (
    <div className="container">
      <header className="header">
        <div className="brand">
          <h1>فصيح</h1>
          <p>من العامية إلى الفصحى</p>
        </div>
        <button
          className="icon-btn"
          onClick={toggleTheme}
          aria-label="تبديل المظهر"
          title="تبديل المظهر"
        >
          ◐
        </button>
      </header>

      <section className="composer">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              convert();
            }
          }}
          placeholder="اكتب أو قل شيئاً بلهجتك... مثلاً: «إزيك عامل إيه النهارده؟»"
          dir="rtl"
        />
        <div className="composer-bar">
          <select
            className="dialect-select"
            value={dialect}
            onChange={(e) => setDialect(e.target.value)}
            aria-label="اختيار اللهجة"
          >
            {DIALECTS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          {sttSupported && (
            <button
              className={`icon-btn mic-btn${listening ? " listening" : ""}`}
              onClick={listening ? stopListening : startListening}
              aria-label={listening ? "إيقاف الاستماع" : "تحدث بالميكروفون"}
              title={listening ? "إيقاف الاستماع" : "تحدث بالميكروفون"}
            >
              {listening ? "◼" : "🎙"}
            </button>
          )}
          <div className="spacer" />
          <button
            className="convert-btn"
            onClick={convert}
            disabled={!text.trim() || converting}
          >
            {converting ? "جارٍ التحويل..." : "حوّل إلى الفصحى"}
          </button>
        </div>
        {error && (
          <p className="error-line">
            {error}
            {needsKey && (
              <>
                {" "}
                — أنشئ مفتاحاً مجانياً من{" "}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google AI Studio
                </a>{" "}
                وضعه في <code>.env.local</code>
              </>
            )}
          </p>
        )}
        {!sttSupported && (
          <p className="hint-line">
            متصفحك لا يدعم الإدخال الصوتي — استخدم Chrome أو Edge، أو اكتب النص
            مباشرة.
          </p>
        )}
      </section>

      <section>
        <div className="history-head">
          <h2>المحادثات السابقة</h2>
          {history.length > 0 && (
            <button className="clear-btn" onClick={clearHistory}>
              مسح السجل
            </button>
          )}
        </div>

        {hydrated && history.length === 0 && (
          <div className="empty-state">
            لا توجد محادثات بعد — قل شيئاً بلهجتك وسيظهر التحويل هنا.
          </div>
        )}

        {history.map((entry) => (
          <article className="entry" key={entry.id}>
            <div className="entry-dialect">
              <span>بالعامية</span>
              {entry.dialect}
            </div>
            <div className="entry-fusha">{entry.fusha}</div>
            <div className="entry-actions">
              <button
                className="action"
                onClick={() => play(entry)}
                disabled={loadingAudioId === entry.id}
              >
                {loadingAudioId === entry.id
                  ? "جارٍ التحميل..."
                  : playingId === entry.id
                    ? "◼ إيقاف"
                    : "▶ استمع"}
              </button>
              <button className="action" onClick={() => copy(entry)}>
                {copiedId === entry.id ? "✓ نُسخ" : "⧉ نسخ"}
              </button>
              <span className="entry-time">{formatTime(entry.ts)}</span>
            </div>
          </article>
        ))}
      </section>

      <footer className="footer">
        فصيح — يعمل بنموذج Gemini المجاني، والسجل محفوظ في متصفحك فقط.
      </footer>
    </div>
  );
}
