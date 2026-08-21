import { NextResponse } from "next/server";
import { GeminiKeyMissingError } from "@/lib/gemini";
import { synthesize } from "@/lib/speech";

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
    const spoken = await synthesize(text);
    if (!spoken) {
      // The client falls back to the browser's built-in speech synthesis.
      return NextResponse.json({ error: "TTS failed" }, { status: 502 });
    }
    return new NextResponse(new Uint8Array(spoken.audio), {
      headers: { "Content-Type": spoken.mime, "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof GeminiKeyMissingError) {
      return NextResponse.json({ error: err.message, needsKey: true }, { status: 503 });
    }
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
