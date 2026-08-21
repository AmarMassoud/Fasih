import { geminiGenerate } from "@/lib/gemini";

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.5-flash-lite";

const SYSTEM_PROMPT = `أنت خبير في اللغة العربية ولهجاتها. مهمتك تحويل كلام باللهجة العامية (مصرية، خليجية، شامية، مغربية، عراقية، أو غيرها) إلى اللغة العربية الفصحى.

القواعد:
- حوّل النص إلى فصحى سليمة مع الحفاظ على المعنى الكامل والنبرة (سؤال، تعجب، مزاح...).
- لا تشرح ولا تعلّق ولا تضف مقدمات — أعد النص المحوَّل فقط.
- شكّل الكلمات تشكيلاً خفيفاً عند الحاجة لإزالة اللبس فقط.
- إن كان النص فصحى أصلاً، أعده كما هو بعد تصحيح أي أخطاء نحوية.
- إن لم يكن النص عربياً أو كان غير مفهوم، أجب: "لم أفهم النص، حاول مرة أخرى."`;

/** Convert dialect text to fus7a. Returns null when the model returns nothing. */
export async function convertToFusha(
  text: string,
  dialectHint?: string,
): Promise<string | null> {
  const userText = dialectHint
    ? `اللهجة المرجحة: ${dialectHint}\n\nالنص:\n${text}`
    : text;

  const res = await geminiGenerate(TEXT_MODEL, {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: { temperature: 0.2 },
  });

  if (!res.ok) {
    console.error("convert upstream error:", res.status, await res.text());
    return null;
  }

  const data = await res.json();
  const fusha: string =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("")
      .trim() ?? "";
  return fusha || null;
}
