import { NextResponse } from "next/server";
import { geminiGenerate, GeminiKeyMissingError } from "@/lib/gemini";
import { pcmToWav } from "@/lib/wav";

const TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview";
const TTS_VOICE = process.env.GEMINI_TTS_VOICE || "Charon";

// Fast path: ElevenLabs Flash v2.5 (~0.3 s model latency, Arabic support).
// Used when a key is configured; otherwise Gemini TTS, and the client
// falls back to the browser voice if both fail.
const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5";
const ELEVEN_VOICE = process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB";

async function elevenLabsTts(text: string): Promise<Response | null> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: ELEVEN_MODEL,
        language_code: "ar",
      }),
    },
  );
  if (!res.ok) {
    console.error("elevenlabs error:", res.status, await res.text());
    return null;
  }
  const audio = await res.arrayBuffer();
  return new Response(audio, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}

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
    if (process.env.ELEVENLABS_API_KEY) {
      const fast = await elevenLabsTts(text);
      if (fast) return fast;
      // fall through to Gemini TTS on ElevenLabs failure (e.g. quota out)
    }

    // Bare text sometimes makes the TTS model refuse with "Model tried to
    // generate text" — an explicit read-aloud instruction keeps it in audio mode.
    const res = await geminiGenerate(TTS_MODEL, {
      contents: [{ role: "user", parts: [{ text: `Read aloud in Arabic, exactly as written: ${text}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } },
        },
      },
    });

    if (!res.ok) {
      // The client falls back to the browser's built-in speech synthesis
      // on any non-OK response; details stay in the server log.
      console.error("tts upstream error:", res.status, await res.text());
      return NextResponse.json(
        { error: "TTS failed" },
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
