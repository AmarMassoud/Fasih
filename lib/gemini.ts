const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiApiKey(): string | null {
  return process.env.GEMINI_API_KEY || null;
}

export async function geminiGenerate(
  model: string,
  body: unknown,
): Promise<Response> {
  const key = geminiApiKey();
  if (!key) {
    throw new GeminiKeyMissingError();
  }
  return fetch(`${BASE_URL}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify(body),
  });
}

export class GeminiKeyMissingError extends Error {
  constructor() {
    super("مفتاح GEMINI_API_KEY غير موجود في ملف .env.local");
  }
}
