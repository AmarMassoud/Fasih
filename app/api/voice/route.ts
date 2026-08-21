import { NextResponse } from "next/server";
import { geminiGenerate, GeminiKeyMissingError } from "@/lib/gemini";

const VOICE_MODEL = process.env.GEMINI_STT_MODEL || "gemini-3.5-flash-lite";

// One round trip: transcribe the dialect speech AND convert it to fus7a.
const VOICE_PROMPT = `استمع إلى هذا التسجيل الصوتي لمتحدث بالعامية العربية، ثم أعد JSON فقط بهذا الشكل:
{"aamiya": "...", "fusha": "..."}

- "aamiya": ما قاله المتحدث حرفياً بلهجته كما نطقه، بالحروف العربية.
- "fusha": تحويل الكلام إلى العربية الفصحى السليمة مع الحفاظ على المعنى والنبرة، مع تشكيل خفيف عند الحاجة.
- لا تضف أي شرح أو نص خارج JSON.
- إن لم يوجد كلام مفهوم، أعد: {"aamiya": "", "fusha": ""}`;

const MAX_AUDIO_B64 = 8 * 1024 * 1024;

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

  const prompt = dialectHint
    ? `${VOICE_PROMPT}\n- اللهجة المرجحة للمتحدث: ${dialectHint}`
    : VOICE_PROMPT;

  try {
    const res = await geminiGenerate(VOICE_MODEL, {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }, { inlineData: { mimeType, data: audio } }],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    });

    if (!res.ok) {
      console.error("voice upstream error:", res.status, await res.text());
      return NextResponse.json(
        { error: "تعذر التعرف على الصوت، حاول مرة أخرى." },
        { status: res.status === 429 ? 429 : 502 },
      );
    }

    const data = await res.json();
    const raw: string =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? "")
        .join("") ?? "";

    let aamiya = "";
    let fusha = "";
    try {
      const parsed = JSON.parse(raw);
      aamiya = String(parsed.aamiya ?? "").trim();
      fusha = String(parsed.fusha ?? "").trim();
    } catch {
      console.error("voice parse error:", raw.slice(0, 300));
      return NextResponse.json(
        { error: "تعذر التعرف على الصوت، حاول مرة أخرى." },
        { status: 502 },
      );
    }

    return NextResponse.json({ aamiya, fusha });
  } catch (err) {
    if (err instanceof GeminiKeyMissingError) {
      return NextResponse.json({ error: err.message, needsKey: true }, { status: 503 });
    }
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
