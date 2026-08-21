import { NextResponse } from "next/server";
import { geminiGenerate, GeminiKeyMissingError } from "@/lib/gemini";
import { convertToFusha } from "@/lib/convert";
import { scribeTranscribe, deepgramTranscribe, synthesize } from "@/lib/speech";

const VOICE_MODEL = process.env.GEMINI_STT_MODEL || "gemini-3.5-flash-lite";

// Fallback when no dedicated STT is available: one Gemini call transcribes
// AND converts.
const VOICE_PROMPT = `استمع إلى هذا التسجيل الصوتي لمتحدث بالعامية العربية، ثم أعد JSON فقط بهذا الشكل:
{"aamiya": "...", "fusha": "..."}

- "aamiya": ما قاله المتحدث حرفياً بلهجته كما نطقه، بالحروف العربية.
- "fusha": تحويل الكلام إلى العربية الفصحى السليمة مع الحفاظ على المعنى والنبرة، مع تشكيل خفيف عند الحاجة.
- لا تضف أي شرح أو نص خارج JSON.
- إن لم يوجد كلام مفهوم، أعد: {"aamiya": "", "fusha": ""}`;

const MAX_AUDIO_B64 = 8 * 1024 * 1024;

async function geminiCombined(
  audio: string,
  mimeType: string,
  dialectHint?: string,
): Promise<{ aamiya: string; fusha: string } | null> {
  const prompt = dialectHint
    ? `${VOICE_PROMPT}\n- اللهجة المرجحة للمتحدث: ${dialectHint}`
    : VOICE_PROMPT;
  const res = await geminiGenerate(VOICE_MODEL, {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }, { inlineData: { mimeType, data: audio } }],
      },
    ],
    generationConfig: { temperature: 0, responseMimeType: "application/json" },
  });
  if (!res.ok) {
    console.error("voice upstream error:", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  const raw: string =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("") ?? "";
  try {
    const parsed = JSON.parse(raw);
    return {
      aamiya: String(parsed.aamiya ?? "").trim(),
      fusha: String(parsed.fusha ?? "").trim(),
    };
  } catch {
    console.error("voice parse error:", raw.slice(0, 300));
    return null;
  }
}

// The whole voice turn happens in this one request: transcribe -> convert
// -> synthesize. The client gets text and playable audio together.
export async function POST(req: Request) {
  let audio: string;
  let mimeType: string;
  let dialectHint: string | undefined;
  try {
    const body = await req.json();
    audio = String(body.audio ?? "");
    mimeType = String(body.mimeType ?? "audio/webm");
    dialectHint = body.dialect ? String(body.dialect) : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!audio) {
    return NextResponse.json({ error: "Audio is required" }, { status: 400 });
  }
  if (audio.length > MAX_AUDIO_B64) {
    return NextResponse.json({ error: "التسجيل طويل جداً." }, { status: 400 });
  }

  try {
    const buf = Buffer.from(audio, "base64");

    let aamiya = "";
    let fusha = "";
    const transcript =
      (await scribeTranscribe(buf, mimeType)) ??
      (await deepgramTranscribe(buf, mimeType));
    if (transcript) {
      aamiya = transcript;
      fusha = (await convertToFusha(transcript, dialectHint)) ?? "";
      if (!fusha) {
        return NextResponse.json(
          { error: "تعذر التحويل، حاول مرة أخرى." },
          { status: 502 },
        );
      }
    } else {
      const combined = await geminiCombined(audio, mimeType, dialectHint);
      if (!combined) {
        return NextResponse.json(
          { error: "تعذر التعرف على الصوت، حاول مرة أخرى." },
          { status: 502 },
        );
      }
      ({ aamiya, fusha } = combined);
    }

    if (!fusha) {
      return NextResponse.json({ aamiya: "", fusha: "" });
    }

    // Generate the spoken fus7a here too — the client plays it instantly
    // instead of making a second round trip.
    const spoken = await synthesize(fusha);
    return NextResponse.json({
      aamiya,
      fusha,
      audio: spoken ? spoken.audio.toString("base64") : null,
      audioMime: spoken?.mime ?? null,
    });
  } catch (err) {
    if (err instanceof GeminiKeyMissingError) {
      return NextResponse.json({ error: err.message, needsKey: true }, { status: 503 });
    }
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
