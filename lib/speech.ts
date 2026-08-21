import { geminiGenerate } from "@/lib/gemini";
import { pcmToWav } from "@/lib/wav";

const GEMINI_TTS_MODEL =
  process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview";
const GEMINI_TTS_VOICE = process.env.GEMINI_TTS_VOICE || "Charon";
const ELEVEN_TTS_MODEL = process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5";
const ELEVEN_VOICE = process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB";

export interface SynthesizedAudio {
  audio: Buffer;
  mime: string;
}

/** ElevenLabs Scribe — the most accurate Arabic STT of the options here. */
export async function scribeTranscribe(
  audio: Buffer,
  mimeType: string,
): Promise<string | null> {
  if (!process.env.ELEVENLABS_API_KEY) return null;
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("language_code", "ar");
  form.append(
    "file",
    new Blob([new Uint8Array(audio)], { type: mimeType }),
    "audio",
  );
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
    body: form,
  });
  if (!res.ok) {
    console.error("scribe error:", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  const text = String(data?.text ?? "").trim();
  return text || null;
}

/** Deepgram Nova-3 — fallback STT. */
export async function deepgramTranscribe(
  audio: Buffer,
  mimeType: string,
): Promise<string | null> {
  if (!process.env.DEEPGRAM_API_KEY) return null;
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

async function elevenLabsTts(text: string): Promise<SynthesizedAudio | null> {
  if (!process.env.ELEVENLABS_API_KEY) return null;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: ELEVEN_TTS_MODEL,
        language_code: "ar",
      }),
    },
  );
  if (!res.ok) {
    console.error("elevenlabs tts error:", res.status, await res.text());
    return null;
  }
  return { audio: Buffer.from(await res.arrayBuffer()), mime: "audio/mpeg" };
}

async function geminiTts(text: string): Promise<SynthesizedAudio | null> {
  // Bare text sometimes makes the TTS model refuse with "Model tried to
  // generate text" — an explicit read-aloud instruction keeps it in audio mode.
  const res = await geminiGenerate(GEMINI_TTS_MODEL, {
    contents: [
      {
        role: "user",
        parts: [{ text: `Read aloud in Arabic, exactly as written: ${text}` }],
      },
    ],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_TTS_VOICE } },
      },
    },
  });
  if (!res.ok) {
    console.error("gemini tts error:", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.find(
    (p: { inlineData?: { data?: string; mimeType?: string } }) =>
      p.inlineData?.data,
  );
  const b64: string | undefined = part?.inlineData?.data;
  if (!b64) return null;
  const mime: string = part.inlineData.mimeType ?? "";
  const rateMatch = /rate=(\d+)/.exec(mime);
  const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
  return {
    audio: pcmToWav(Buffer.from(b64, "base64"), sampleRate),
    mime: "audio/wav",
  };
}

/** Fastest available TTS with fallback: ElevenLabs Flash, then Gemini. */
export async function synthesize(text: string): Promise<SynthesizedAudio | null> {
  return (await elevenLabsTts(text)) ?? (await geminiTts(text));
}
