import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  parseStructuredJsonWithRecovery,
  sanitizeStructuredJsonText,
} from "../../lib/ai/structuredJson";

describe("structuredJson recovery", () => {
  it("extracts JSON from fenced text with surrounding prose", () => {
    const parsed = parseStructuredJsonWithRecovery(`
Here is the payload.

\`\`\`json
{"prompt":"質問文","options":[{"label":"左","score":-0.7},{"label":"中左","score":-0.2},{"label":"中右","score":0.3},{"label":"右","score":0.7}]}
\`\`\`

Done.
    `);

    expect(Array.isArray(parsed)).toBe(false);
    expect((parsed as Record<string, unknown>).prompt).toBe("質問文");
  });

  it("repairs newlines, trailing commas and stray quotes inside strings", () => {
    const raw = `{
      "prompt":"気になる場面で
どう動く？",
      "options":[
        {"label":"まず "様子を見る"","score":-0.7,},
        {"label":"少し待って合わせる","score":-0.2},
        {"label":"自分から軽く動く","score":0.3},
        {"label":"すぐ主導する","score":0.7},
      ],
    }`;

    const sanitized = sanitizeStructuredJsonText(raw);
    expect(sanitized).toContain('"prompt":"気になる場面で どう動く？"');
    expect(sanitized).toContain('"label":"まず  様子を見る "');

    const parsed = parseStructuredJsonWithRecovery(raw) as Record<string, unknown>;
    expect(parsed.prompt).toBe("気になる場面で どう動く？");

    const options = parsed.options as Array<Record<string, unknown>>;
    expect(options).toHaveLength(4);
    expect(String(options[0]?.label ?? "")).not.toContain("\"");
  });

  it("unwraps a JSON string that contains a serialized object", () => {
    const raw = "\"{\\\"prompt\\\":\\\"質問文\\\",\\\"options\\\":[{\\\"label\\\":\\\"左\\\",\\\"score\\\":-0.7},{\\\"label\\\":\\\"中左\\\",\\\"score\\\":-0.2},{\\\"label\\\":\\\"中右\\\",\\\"score\\\":0.3},{\\\"label\\\":\\\"右\\\",\\\"score\\\":0.7}]}\"";

    const parsed = parseStructuredJsonWithRecovery(raw) as Record<string, unknown>;
    expect(parsed.prompt).toBe("質問文");
    expect(Array.isArray(parsed.options)).toBe(true);
  });
});
