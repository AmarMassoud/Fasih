import { NextResponse } from "next/server";
import { geminiGenerate, GeminiKeyMissingError } from "@/lib/gemini";
import { pcmToWav } from "@/lib/wav";

const TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
const TTS_VOICE = process.env.GEMINI_TTS_VOICE || "Charon";

export async function POST(req: Request) {
  let text: string;
  try {
    const body = await req.json();
    text = String(body.text ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!text) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: "Text too long (max 2000 chars)" }, { status: 400 });
  }

  try {
    const res = await geminiGenerate(TTS_MODEL, {
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } },
        },
      },
    });

    if (!res.ok) {
      const detail = await res.text();
      // The client falls back to the browser's built-in speech synthesis
      // on any non-OK response, so a plain error body is enough here.
      return NextResponse.json(
        { error: "TTS failed", detail: detail.slice(0, 500) },
        { status: res.status === 429 ? 429 : 502 },
      );
    }

    const data = await res.json();
    const part = data?.candidates?.[0]?.content?.parts?.find(
      (p: { inlineData?: { data?: string; mimeType?: string } }) => p.inlineData?.data,
    );
    const b64: string | undefined = part?.inlineData?.data;
    if (!b64) {
      return NextResponse.json({ error: "No audio returned" }, { status: 502 });
    }

    // mimeType is e.g. "audio/L16;codec=pcm;rate=24000" — parse the rate if present.
    const mime: string = part.inlineData.mimeType ?? "";
    const rateMatch = /rate=(\d+)/.exec(mime);
    const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;

    const wav = pcmToWav(Buffer.from(b64, "base64"), sampleRate);
    return new NextResponse(new Uint8Array(wav), {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof GeminiKeyMissingError) {
      return NextResponse.json({ error: err.message, needsKey: true }, { status: 503 });
    }
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
