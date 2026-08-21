import { NextResponse } from "next/server";
import { geminiGenerate, GeminiKeyMissingError } from "@/lib/gemini";

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.5-flash-lite";

const SYSTEM_PROMPT = `أنت خبير في اللغة العربية ولهجاتها. مهمتك تحويل كلام باللهجة العامية (مصرية، خليجية، شامية، مغربية، عراقية، أو غيرها) إلى اللغة العربية الفصحى.

القواعد:
- حوّل النص إلى فصحى سليمة مع الحفاظ على المعنى الكامل والنبرة (سؤال، تعجب، مزاح...).
- لا تشرح ولا تعلّق ولا تضف مقدمات — أعد النص المحوَّل فقط.
- شكّل الكلمات تشكيلاً خفيفاً عند الحاجة لإزالة اللبس فقط.
- إن كان النص فصحى أصلاً، أعده كما هو بعد تصحيح أي أخطاء نحوية.
- إن لم يكن النص عربياً أو كان غير مفهوم، أجب: "لم أفهم النص، حاول مرة أخرى."`;

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

  const userText = dialectHint
    ? `اللهجة المرجحة: ${dialectHint}\n\nالنص:\n${text}`
    : text;

  try {
    const res = await geminiGenerate(TEXT_MODEL, {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: { temperature: 0.2 },
    });

    if (!res.ok) {
      // Upstream error details stay in the server log — the client only
      // gets a generic, user-facing message.
      console.error("convert upstream error:", res.status, await res.text());
      const status = res.status === 429 ? 429 : 502;
      return NextResponse.json(
        {
          error:
            res.status === 429
              ? "الخدمة مشغولة مؤقتاً، حاول بعد قليل."
              : "تعذر التحويل، حاول مرة أخرى.",
        },
        { status },
      );
    }

    const data = await res.json();
    const fusha: string | undefined = data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("")
      .trim();

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
