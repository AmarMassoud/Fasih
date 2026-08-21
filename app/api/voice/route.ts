import { NextResponse } from "next/server";
import { geminiGenerate, GeminiKeyMissingError } from "@/lib/gemini";
import { convertToFusha } from "@/lib/convert";

const VOICE_MODEL = process.env.GEMINI_STT_MODEL || "gemini-3.5-flash-lite";

// Fast path (à la diraya): Deepgram Nova-3 for transcription (~0.4 s)
// followed by the usual fus7a conversion. Used when a key is configured;
// otherwise a single combined Gemini call does both.
async function deepgramTranscribe(
  audio: Buffer,
  mimeType: string,
): Promise<string | null> {
  const res = await fetch(
    "https://api.deepgram.com/v1/listen?model=nova-3&language=ar&smart_format=true",
    {
      method: "POST",
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        "Content-Type": mimeType,
      },
      body: new Uint8Array(audio),
    },
  );
  if (!res.ok) {
    console.error("deepgram error:", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  const transcript: string =
    data?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
  return transcript || null;
}

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
    if (process.env.DEEPGRAM_API_KEY) {
      const aamiya = await deepgramTranscribe(Buffer.from(audio, "base64"), mimeType);
      if (!aamiya) {
        return NextResponse.json({ aamiya: "", fusha: "" });
      }
      const fusha = await convertToFusha(aamiya, dialectHint);
      if (!fusha) {
        return NextResponse.json(
          { error: "تعذر التحويل، حاول مرة أخرى." },
          { status: 502 },
        );
      }
      return NextResponse.json({ aamiya, fusha });
    }

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
