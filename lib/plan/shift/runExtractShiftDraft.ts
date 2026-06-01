/**
 * Draft extraction runtime orchestrator for server action（SR B1b-2C-7）
 *
 * 役割: server action `extractShiftDraftAction` の本体ロジック。
 *   FormData 受け取り → guard chain → planner → adapter → cells変換 → safe result。
 *
 * 設計核心（CEO 補正 2026-06-01）:
 *   - cost 発生入口のため、**adapter 呼出前** に以下を全て通す:
 *       flag / staging allowlist / production deny / authenticated user /
 *       GEMINI_API_KEY / B1B_VLM_MODEL / file mime / file size / metadata
 *   - 上記いずれか NG → **adapter を呼ばず** safe error を返す（test で固定）
 *   - server action 本体（"use server"）と分離して **DI deps** で受け、test で fake adapter を注入可能に
 *   - **process.env / supabase / server-only / fetch / Gemini** は本 module からは読まない
 *     ・呼ばない（action 側が wire する）
 *   - Blob は server action 内のみで扱う：return / log / DB / client へ Blob を渡さない
 *   - result に raw response / base64 / API key を載せない（test で固定）
 *
 * 範囲外: dev host page / upload UI / ShiftImportModal接続 / 保存 / DB / production / 本流入口。
 */

import { planDraftExtraction } from "./draftExtractionPlanner";
import {
  runDraftExtraction,
  DraftExtractionError,
  type DraftExtractionAdapter,
  type DraftExtractionErrorKind,
} from "./draftExtractionAdapter";
import { assistedDraftToShiftReviewCells } from "./assistedDraftToShiftReviewCells";
import type { ShiftReviewCell } from "./shiftReviewClassification";

// ─────────────────────────────────────────────────────────────
// 型
// ─────────────────────────────────────────────────────────────

export type ExtractShiftDraftErrorKind =
  | "flag_disabled"
  | "unauthenticated"
  | "env_misconfigured"
  | "invalid_input"
  | DraftExtractionErrorKind;

export interface ExtractShiftDraftSuccess {
  ok: true;
  /** safe summary: ShiftReviewCell は { day, date, rawCode, confidence } のみ。Blob / base64 含まず */
  cells: ShiftReviewCell[];
  chunkSummary: { perChunkCounts: number[] };
}

export interface ExtractShiftDraftFailure {
  ok: false;
  error: {
    kind: ExtractShiftDraftErrorKind;
    /** safe copy。raw response / API key / stack を含めない（test で固定） */
    message: string;
  };
}

export type ExtractShiftDraftResult = ExtractShiftDraftSuccess | ExtractShiftDraftFailure;

export interface ExtractShiftDraftEnv {
  /** PLAN_SHIFT_DRAFT_HOST === "true" */
  flagOn: boolean;
  /** NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL */
  supabaseUrl: string | undefined;
  /** GEMINI_API_KEY */
  geminiApiKey: string | undefined;
  /** B1B_VLM_MODEL */
  vlmModel: string | undefined;
  /**
   * SR B1b-2C-9-FIX-2: VLM 画像入力モード。
   *   - "split"（既定）: 旧経路 header+personRow 2 枚
   *   - "combined": 新経路 combined 1 枚
   * **server-side only**（client が FormData に書いても信用せず、env で再評価）
   */
  vlmInputMode?: "split" | "combined";
}

/** adapter factory に渡す最小 config。timeout / retry は adapter 既定値を使う。 */
export interface ExtractShiftDraftAdapterConfig {
  apiKey: string;
  model: string;
}

export interface ExtractShiftDraftDeps {
  env: ExtractShiftDraftEnv;
  /** staging allowlist 用 ref（既存 devFixtureHost と同 pattern） */
  stagingRef: string;
  /** production deny 用 ref */
  productionRef: string;
  /** 認証 user の id（未認証なら null）。action は supabase.auth.getUser() を wire */
  getUserId: () => Promise<string | null>;
  /** adapter factory（action は server-only Gemini factory を wire） */
  createAdapter: (config: ExtractShiftDraftAdapterConfig) => DraftExtractionAdapter;
}

// ─────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────

const KNOWN_CODES = ["H", "HREQ", "E", "E-18", "N", "L", "G", "BD"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB（PNG/JPEG crop の十分上限）
const ACCEPTED_MIMES: ReadonlySet<string> = new Set(["image/png", "image/jpeg"]);

/** safe copy（user-facing 文言・raw error / API key を含めない） */
const SAFE_MESSAGES: Record<ExtractShiftDraftErrorKind, string> = {
  flag_disabled: "下書き取り込みは現在ご利用いただけません。",
  unauthenticated: "ログインが必要です。",
  env_misconfigured: "下書き取り込みの設定が完了していません。",
  invalid_input: "入力をご確認ください。",
  timeout: "読み取りに時間がかかっています。もう一度お試しください。",
  rate_limited: "読み取りが混み合っています。しばらくしてからお試しください。",
  model_error: "読み取りサービスが応答していません。しばらくしてからお試しください。",
  invalid_response: "読み取り結果を解析できませんでした。もう一度お試しください。",
  chunk_range_violation: "読み取り範囲が揃いませんでした。もう一度お試しください。",
  merge_duplicate: "読み取り内容が重複しました。もう一度お試しください。",
  coverage_incomplete: "読み取り内容が揃いませんでした。もう一度お試しください。",
  auth_missing: "下書き取り込みの認証が設定されていません。",
  unknown: "読み取りができませんでした。原稿をご確認の上もう一度お試しください。",
};

// ─────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────

function fail(kind: ExtractShiftDraftErrorKind): ExtractShiftDraftFailure {
  return { ok: false, error: { kind, message: SAFE_MESSAGES[kind] } };
}

type ParsedInput =
  | {
      mode: "split";
      headerBlob: Blob;
      personRowBlob: Blob;
      year: number;
      month: number;
      daysInMonth: number;
    }
  | {
      mode: "combined";
      combinedBlob: Blob;
      year: number;
      month: number;
      daysInMonth: number;
    };

function isAcceptedBlob(b: unknown): b is Blob {
  return (
    b instanceof Blob &&
    b.size > 0 &&
    b.size <= MAX_FILE_SIZE &&
    ACCEPTED_MIMES.has(b.type)
  );
}

/**
 * SR B1b-2C-9-FIX-2: mode は **server 決定**。client が FormData に何を入れても、
 *   parseFormData は server 側 mode で「期待する field のみ」を読む。**他 mode の field
 *   が混入していたら invalid_input**（mixed input 禁止）。
 */
function parseFormData(
  formData: FormData,
  mode: "split" | "combined"
): ParsedInput | null {
  // metadata 共通
  const yearStr = formData.get("year");
  const monthStr = formData.get("month");
  const daysStr = formData.get("daysInMonth");
  if (typeof yearStr !== "string" || typeof monthStr !== "string" || typeof daysStr !== "string")
    return null;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const daysInMonth = Number(daysStr);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(daysInMonth) || daysInMonth < 28 || daysInMonth > 31) return null;

  if (mode === "combined") {
    const combinedFile = formData.get("combined");
    if (!isAcceptedBlob(combinedFile)) return null;
    // mixed input 禁止: split mode の field が紛れていたら拒否
    if (formData.get("header") != null || formData.get("personRow") != null) return null;
    return { mode: "combined", combinedBlob: combinedFile, year, month, daysInMonth };
  }
  // split mode
  const headerFile = formData.get("header");
  const personRowFile = formData.get("personRow");
  if (!isAcceptedBlob(headerFile) || !isAcceptedBlob(personRowFile)) return null;
  // mixed input 禁止: combined field が紛れていたら拒否
  if (formData.get("combined") != null) return null;
  return {
    mode: "split",
    headerBlob: headerFile,
    personRowBlob: personRowFile,
    year,
    month,
    daysInMonth,
  };
}

// ─────────────────────────────────────────────────────────────
// 本体
// ─────────────────────────────────────────────────────────────

/**
 * Server action runtime orchestrator（pure-ish, deps 注入で test 可能）。
 *
 * Gate chain（adapter 未呼出で safe error）:
 *   ① flag_disabled / ② env_misconfigured（staging/prod ref/api key/model）/
 *   ③ unauthenticated / ④ invalid_input（file/metadata）
 *
 * 通過後にのみ adapter を生成して runDraftExtraction を呼ぶ。
 */
export async function runExtractShiftDraft(
  formData: FormData,
  deps: ExtractShiftDraftDeps
): Promise<ExtractShiftDraftResult> {
  // ── ① flag ──
  if (!deps.env.flagOn) return fail("flag_disabled");

  // ── ② env: staging allowlist + production deny ──
  const url = deps.env.supabaseUrl ?? "";
  if (!url.includes(deps.stagingRef) || url.includes(deps.productionRef)) {
    return fail("env_misconfigured");
  }

  // ── ③ env: GEMINI_API_KEY / B1B_VLM_MODEL ──
  const apiKey = (deps.env.geminiApiKey ?? "").trim();
  const model = (deps.env.vlmModel ?? "").trim();
  if (apiKey === "" || model === "") {
    return fail("env_misconfigured");
  }

  // ── ④ authenticated user ──
  const userId = await deps.getUserId();
  if (userId === null || userId === undefined || userId === "") {
    return fail("unauthenticated");
  }

  // ── ⑤ mode 決定（server-side env で再評価。client は信用しない）──
  const vlmInputMode: "split" | "combined" =
    deps.env.vlmInputMode === "combined" ? "combined" : "split";

  // ── ⑥ FormData 検証（mime/size/metadata + mode 別 field + mixed input 禁止）──
  const parsed = parseFormData(formData, vlmInputMode);
  if (parsed === null) return fail("invalid_input");

  // ── ⑦ plan（pure・Blob 非依存・mode 込みで prompt 切替）──
  const plan = planDraftExtraction({
    year: parsed.year,
    month: parsed.month,
    daysInMonth: parsed.daysInMonth,
    knownCodes: KNOWN_CODES,
    vlmInputMode,
  });

  // ── ⑧ adapter 生成（cost 発生入口・全 gate 通過後にのみ） ──
  const adapter = deps.createAdapter({ apiKey, model });

  // ── ⑨ runtime（fail-hard）+ cells 変換 + safe error mapping ──
  try {
    const { cells, perChunkCounts } = await runDraftExtraction(
      parsed.mode === "combined"
        ? { plan, mode: "combined", combinedBlob: parsed.combinedBlob }
        : {
            plan,
            mode: "split",
            headerBlob: parsed.headerBlob,
            personRowBlob: parsed.personRowBlob,
          },
      adapter
    );
    const reviewCells = assistedDraftToShiftReviewCells(cells, {
      year: parsed.year,
      month: parsed.month,
      daysInMonth: parsed.daysInMonth,
    });
    // 注: ShiftReviewCell は { day, date, rawCode, confidence } のみ。
    //     Blob / base64 / dataURL は含まれない（test で固定）。
    return {
      ok: true,
      cells: reviewCells,
      chunkSummary: { perChunkCounts },
    };
  } catch (e) {
    if (e instanceof DraftExtractionError) {
      const kind = e.kind as ExtractShiftDraftErrorKind;
      // raw e.message は **使わない**（adapter 既に safe copy だが、runner 側でも統一 SAFE_MESSAGES に丸める）
      return fail(kind);
    }
    return fail("unknown");
  }
}
