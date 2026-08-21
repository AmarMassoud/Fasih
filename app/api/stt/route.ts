import { NextResponse } from "next/server";
import { geminiGenerate, GeminiKeyMissingError } from "@/lib/gemini";

const STT_MODEL = process.env.GEMINI_STT_MODEL || "gemini-3.5-flash-lite";

const STT_PROMPT = `اكتب ما يقوله المتحدث في هذا التسجيل الصوتي كما هو تماماً، بالعامية التي نطق بها، بالحروف العربية.
- أعد النص المنطوق فقط دون أي شرح أو تعليق أو علامات اقتباس.
- إن لم يوجد كلام مفهوم في التسجيل، أعد نصاً فارغاً.`;

// Audio arrives as base64 JSON; 8 MB of base64 ≈ 6 MB of audio ≈ several
// minutes of speech, far above what a dictation clip needs.
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
    ? `${STT_PROMPT}\n- اللهجة المرجحة للمتحدث: ${dialectHint}`
    : STT_PROMPT;

  try {
    const res = await geminiGenerate(STT_MODEL, {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: audio } },
          ],
        },
      ],
      generationConfig: { temperature: 0 },
    });

    if (!res.ok) {
      console.error("stt upstream error:", res.status, await res.text());
      return NextResponse.json(
        { error: "تعذر التعرف على الصوت، حاول مرة أخرى." },
        { status: res.status === 429 ? 429 : 502 },
      );
    }

    const data = await res.json();
    const text: string =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? "")
        .join("")
        .trim() ?? "";

    return NextResponse.json({ text });
  } catch (err) {
    if (err instanceof GeminiKeyMissingError) {
      return NextResponse.json({ error: err.message, needsKey: true }, { status: 503 });
    }
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
