// lib/avatar-fitting/imageAnalyzer.ts
import "server-only";
import type { ExtractedItemAttributes, ItemCategory } from "./types";

const GEMINI_VISION_PROMPT = `あなたはファッションアイテム画像の分析AIです。
以下の画像を分析し、JSON形式で属性を抽出してください。

出力フォーマット:
{
  "category": "tops" | "bottoms" | "outer" | "shoes" | "accessories" | "unknown",
  "dominant_colors": [{"hex": "#RRGGBB", "name": "色名(日本語)", "ratio": 0.0-1.0}],
  "style_tags": ["minimal", "street", "vintage", "sporty", "luxury", "daily", "elegant", "workwear", "outdoor", "casual", "classic"],
  "silhouette_tags": ["slim", "relaxed", "oversized", "a-line", "straight", "tapered", "boxy", "fitted"],
  "material_tags": ["cotton", "polyester", "wool", "denim", "leather", "silk", "nylon", "linen", "knit", "fleece"],
  "estimated_fit": "slim" | "regular" | "relaxed" | "oversized" | null,
  "mood_tags": ["モード", "カジュアル", "きれいめ", "ナチュラル", "フォーマル", "スポーティ", "ガーリー", "マニッシュ"]
}

注意:
- dominant_colorsは最大3色まで、ratioの合計は1.0
- style_tagsは該当するもの全て（最大5つ）
- 判断できない項目はnullまたは空配列
- category判定を最優先で正確に`;

function getApiKey(): string {
  return (process.env.GEMINI_API_KEY ?? "").trim();
}

export async function analyzeImage(
  imageBase64: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp",
): Promise<ExtractedItemAttributes> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[imageAnalyzer] GEMINI_API_KEY not set, returning fallback");
    return createFallbackAttributes();
  }

  const model = "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${endpoint}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: GEMINI_VISION_PROMPT },
            { inlineData: { mimeType, data: imageBase64 } },
          ],
        }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          maxOutputTokens: 1024,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`[imageAnalyzer] Gemini error ${response.status}: ${body.slice(0, 300)}`);
      return createFallbackAttributes();
    }

    const raw = await response.json();
    const text = raw?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("")
      .trim() ?? "";

    if (!text) return createFallbackAttributes();

    const parsed = JSON.parse(text);
    return normalizeAttributes(parsed);
  } catch (err) {
    console.error("[imageAnalyzer] Analysis failed:", err);
    return createFallbackAttributes();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeAttributes(raw: Record<string, unknown>): ExtractedItemAttributes {
  const validCategories: ItemCategory[] = ["tops", "bottoms", "outer", "shoes", "accessories", "unknown"];
  const category = validCategories.includes(raw.category as ItemCategory)
    ? (raw.category as ItemCategory)
    : "unknown";

  const validFits = ["slim", "regular", "relaxed", "oversized"] as const;
  const estimatedFit = validFits.includes(raw.estimated_fit as typeof validFits[number])
    ? (raw.estimated_fit as typeof validFits[number])
    : null;

  return {
    category,
    dominant_colors: Array.isArray(raw.dominant_colors)
      ? raw.dominant_colors.map((c: any) => ({
          hex: typeof c.hex === "string" ? c.hex : "#000000",
          name: typeof c.name === "string" ? c.name : "不明",
          ratio: typeof c.ratio === "number" ? c.ratio : 0,
        }))
      : [],
    style_tags: toStringArray(raw.style_tags),
    silhouette_tags: toStringArray(raw.silhouette_tags),
    material_tags: toStringArray(raw.material_tags),
    estimated_fit: estimatedFit,
    mood_tags: toStringArray(raw.mood_tags),
    raw_response: JSON.stringify(raw),
  };
}

function toStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter((v): v is string => typeof v === "string");
}

export function createFallbackAttributes(): ExtractedItemAttributes {
  return {
    category: "unknown",
    dominant_colors: [],
    style_tags: [],
    silhouette_tags: [],
    material_tags: [],
    estimated_fit: null,
    mood_tags: [],
  };
}

export function buildManualAttributes(input: {
  category?: ItemCategory;
  colors?: string[];
}): ExtractedItemAttributes {
  return {
    category: input.category ?? "unknown",
    dominant_colors: (input.colors ?? []).map(hex => ({ hex, name: "", ratio: 1 / Math.max((input.colors ?? []).length, 1) })),
    style_tags: [],
    silhouette_tags: [],
    material_tags: [],
    estimated_fit: null,
    mood_tags: [],
  };
}
