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

const DIALECTS: { value: string; label: string }[] = [
  { value: "", label: "اللهجة: تلقائي" },
  { value: "مصرية", label: "مصرية" },
  { value: "خليجية", label: "خليجية" },
  { value: "شامية", label: "شامية" },
  { value: "عراقية", label: "عراقية" },
  { value: "مغربية", label: "مغربية" },
];

const RECORDING_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
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
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [micSupported, setMicSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCache = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    setHistory(loadHistory());
    setHydrated(true);
    setMicSupported(
      typeof window !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia) &&
        "MediaRecorder" in window,
    );
    // Chrome loads voices asynchronously; touching getVoices() warms the list
    // so the fallback narrator can find an Arabic voice later.
    window.speechSynthesis?.getVoices();
    const cache = audioCache.current;
    return () => {
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
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

  // Voice pipeline: one request transcribes AND converts, then the result
  // is spoken — no manual steps.
  const processVoice = useCallback(
    async (blob: Blob) => {
      // A near-empty blob means the recording was stopped immediately.
      if (blob.size < 1024) return;
      setTranscribing(true);
      setError(null);
      try {
        const audio = await blobToBase64(blob);
        const res = await fetch("/api/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audio,
            mimeType: blob.type.split(";")[0] || "audio/webm",
            dialect: dialect || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "تعذر التعرف على الصوت، حاول مرة أخرى.");
          return;
        }
        if (!data.fusha) {
          setError("لم أسمع كلاماً واضحاً — جرّب مرة أخرى قريباً من الميكروفون.");
          return;
        }
        const entry: HistoryEntry = {
          id: crypto.randomUUID(),
          dialect: data.aamiya || "—",
          fusha: data.fusha,
          ts: Date.now(),
        };
        setHistory((prev) => {
          const next = [entry, ...prev];
          saveHistory(next);
          return next;
        });
        void play(entry);
      } catch {
        setError("تعذر الاتصال بالخادم.");
      } finally {
        setTranscribing(false);
      }
    },
    [dialect, play],
  );

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    setRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setError("لم يُسمح باستخدام الميكروفون. فعّل الإذن من إعدادات المتصفح.");
      } else if (name === "NotFoundError") {
        setError("لم يُعثر على ميكروفون في هذا الجهاز.");
      } else {
        setError("تعذر تشغيل الميكروفون، حاول مرة أخرى.");
      }
      return;
    }

    const mimeType = RECORDING_MIME_CANDIDATES.find((m) =>
      MediaRecorder.isTypeSupported(m),
    );
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    // Voice-activity detection: once speech has been heard, ~1.6 s of
    // silence stops the recording and the pipeline runs automatically.
    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    let hadSpeech = false;
    let silentMs = 0;
    let totalMs = 0;
    const TICK = 100;
    const vadTimer = window.setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      totalMs += TICK;
      if (rms > 0.02) {
        hadSpeech = true;
        silentMs = 0;
      } else {
        silentMs += TICK;
      }
      // Stop on: 1.2 s silence after speech, 8 s of nothing, or a 45 s cap.
      if (
        (hadSpeech && silentMs >= 1200) ||
        (!hadSpeech && totalMs >= 8000) ||
        totalMs >= 45000
      ) {
        rec.stop();
      }
    }, TICK);

    rec.onstop = () => {
      window.clearInterval(vadTimer);
      void audioCtx.close();
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      if (!hadSpeech) {
        setError("لم أسمع كلاماً — جرّب مرة أخرى قريباً من الميكروفون.");
        return;
      }
      const blob = new Blob(chunksRef.current, { type: rec.mimeType });
      void processVoice(blob);
    };

    recorderRef.current = rec;
    rec.start();
    setRecording(true);
  }, [processVoice]);

  const convert = useCallback(async () => {
    const input = text.trim();
    if (!input || converting) return;
    if (recording) stopRecording();

    setConverting(true);
    setError(null);
    try {
      const res = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input, dialect: dialect || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
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
      // Speak the fus7a version right away.
      void play(entry);
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setConverting(false);
    }
  }, [text, dialect, converting, recording, stopRecording, play]);

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

  const micBusy = recording || transcribing;

  return (
    <div className="container">
      <header className="header">
        <div className="brand">
          <h1>
            فصيح<span className="brand-dot">.</span>
          </h1>
          <p>من العامية إلى الفصحى</p>
        </div>
        <button
          className="icon-btn"
          onClick={toggleTheme}
          aria-label="تبديل المظهر"
          title="تبديل المظهر"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.5 5.5 0 0 1-7.54-7.54C12.92 3.04 12.46 3 12 3Z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
          </svg>
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
          {micSupported && (
            <button
              className={`icon-btn mic-btn${recording ? " recording" : ""}`}
              onClick={recording ? stopRecording : startRecording}
              disabled={transcribing}
              aria-label={recording ? "إيقاف التسجيل" : "تحدث بالميكروفون"}
              title={recording ? "إيقاف التسجيل" : "تحدث بالميكروفون"}
            >
              {recording ? (
                <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden>
                  <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" />
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.7" />
                  <path
                    d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </button>
          )}
          <div className="spacer" />
          {micBusy && (
            <span className="mic-status" aria-live="polite">
              {recording
                ? "يسجّل — توقّف عن الكلام وسيتحوّل تلقائياً"
                : "جارٍ التحويل..."}
            </span>
          )}
          <button
            className="convert-btn"
            onClick={convert}
            disabled={!text.trim() || converting || transcribing}
          >
            {converting ? "جارٍ التحويل..." : "حوّل إلى الفصحى"}
          </button>
        </div>
        {error && <p className="error-line">{error}</p>}
      </section>

      <section>
        <div className="history-head">
          <h2>السجلّ</h2>
          {history.length > 0 && (
            <button className="clear-btn" onClick={clearHistory}>
              مسح السجل
            </button>
          )}
        </div>

        {hydrated && history.length === 0 && (
          <div className="empty-state">
            لا شيء بعد — قل شيئاً بلهجتك وسيظهر هنا بالفصحى.
          </div>
        )}

        {history.map((entry) => (
          <article className="entry" key={entry.id}>
            <div className="entry-dialect">{entry.dialect}</div>
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
                    : "استمع"}
              </button>
              <button className="action" onClick={() => copy(entry)}>
                {copiedId === entry.id ? "✓ نُسخ" : "نسخ"}
              </button>
              <span className="entry-time">{formatTime(entry.ts)}</span>
            </div>
          </article>
        ))}
      </section>

      <footer className="footer">سجلّك يبقى في جهازك فقط.</footer>
    </div>
  );
}
