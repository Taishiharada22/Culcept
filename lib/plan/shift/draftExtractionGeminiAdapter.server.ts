/**
 * Gemini draft extraction adapter — server-only marker（SR B1b-2C-4-c-2）
 *
 * 役割: API key を扱う Gemini adapter を **client bundle に混入させない** ための marker。
 *   本ファイルは `import "server-only"` 一行 + core の alias re-export のみ。
 *
 * 使い方（host = 将来の server action）:
 *   import { createGeminiDraftExtractionAdapter } from "@/lib/plan/shift/draftExtractionGeminiAdapter.server";
 *
 * env（GEMINI_API_KEY / B1B_VLM_MODEL）を読むのは **host 側（server action）の責務**。
 *   adapter は config を引数で受け取る（env 非依存）。
 *
 * 注: 本ファイルを test 側で import すると `server-only` が throw する。test は
 *   `draftExtractionGeminiAdapterCore.ts` を直接 import する規約。
 */
import "server-only";

export {
  createGeminiDraftExtractionAdapterCore as createGeminiDraftExtractionAdapter,
  type GeminiDraftExtractionAdapterConfig,
} from "./draftExtractionGeminiAdapterCore";
