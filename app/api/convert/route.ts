import { NextResponse } from "next/server";
import { GeminiKeyMissingError } from "@/lib/gemini";
import { convertToFusha } from "@/lib/convert";

export const maxDuration = 30;

export async function POST(req: Request) {
  let text: string;
  let dialectHint: string | undefined;
  try {
    const body = await req.json();
    text = String(body.text ?? "").trim();
    dialectHint = body.dialect ? String(body.dialect) : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!text) {
    return NextResponse.json({ error: "اكتب نصاً أولاً." }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: "النص طويل جداً (الحد 2000 حرف)." }, { status: 400 });
  }

  try {
    const fusha = await convertToFusha(text, dialectHint);
    if (!fusha) {
      return NextResponse.json({ error: "تعذر التحويل، حاول مرة أخرى." }, { status: 502 });
    }
    return NextResponse.json({ fusha });
  } catch (err) {
    if (err instanceof GeminiKeyMissingError) {
      return NextResponse.json({ error: err.message, needsKey: true }, { status: 503 });
    }
    return NextResponse.json({ error: "حدث خطأ غير متوقع في الخادم." }, { status: 500 });
  }
}
