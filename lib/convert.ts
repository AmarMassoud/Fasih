import { geminiGenerate } from "@/lib/gemini";

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.5-flash-lite";

const SYSTEM_PROMPT = `أنت خبير في اللغة العربية ولهجاتها. مهمتك تحويل كلام باللهجة العامية (مصرية، خليجية، شامية، مغربية، عراقية، أو غيرها) إلى اللغة العربية الفصحى.

القواعد:
- حوّل النص إلى فصحى سليمة مع الحفاظ على المعنى الكامل والنبرة (سؤال، تعجب، مزاح...).
- لا تشرح ولا تعلّق ولا تضف مقدمات — أعد النص المحوَّل فقط.
- أعطِ صيغة واحدة فقط، دون بدائل ودون أقواس.
- شكّل الكلمات تشكيلاً خفيفاً عند الحاجة لإزالة اللبس فقط.
- إن كان النص فصحى أصلاً، أعده كما هو بعد تصحيح أي أخطاء نحوية.
- إن لم يكن النص عربياً أو كان غير مفهوم، أجب: "لم أفهم النص، حاول مرة أخرى."`;

/**
 * Convert dialect text to fus7a. Returns null when the model returns nothing.
 *
 * The free Gemini tier has spiky latency (p50 ~1 s, occasional 6–15 s), so
 * if the first request hasn't answered within 2 s a duplicate is fired and
 * whichever responds first wins. The duplicate is skipped entirely when the
 * first request finishes in time.
 */
export async function convertToFusha(
  text: string,
  dialectHint?: string,
): Promise<string | null> {
  let settled = false;
  const first = convertOnce(text, dialectHint)
    .catch(() => null)
    .then((v) => {
      if (v) settled = true;
      return v;
    });
  const hedge = new Promise<string | null>((resolve) => {
    setTimeout(() => {
      if (settled) {
        resolve(null);
        return;
      }
      convertOnce(text, dialectHint)
        .catch(() => null)
        .then(resolve);
    }, 2000);
  });

  const winner = await Promise.race([first, hedge]);
  if (winner) {
    settled = true;
    return winner;
  }
  const [a, b] = await Promise.all([first, hedge]);
  settled = true;
  return a ?? b;
}

async function convertOnce(
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
