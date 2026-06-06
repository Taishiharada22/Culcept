/**
 * Reality Control OS — A1-5-5e Capture Observe-Mode Summary（pure・no-run・barrel 非 export）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.28/§8.33
 *
 * 役割: `CaptureServiceResult`（§8.28）を **redacted な would-capture summary** に射影する pure 関数。
 *   observe-mode（write を有効化する前に「何が捕捉されるか」を観測する段階）で使う canonical projection。
 *   smoke（実 extractor + fake write client）と将来の runtime observe-mode（5g）が同一の判定を共有する。
 *
 * 厳守:
 *   - **pure**（IO なし・型のみ import・server-only 不要）。barrel 非 export。
 *   - **redacted**: raw を持ち込まない。`reason` は reason **code** のみ（gate reason / intake reason / write code）。
 *   - **wouldCapture = outcome==="captured"**（gate ok ∧ extractor ok ∧ validate ok ∧ write payload 構築 ∧ write 経路到達）。
 *     **wouldEvidence = captured 時の wroteEvidence**（explicitDuration high → true / なし·low → false）。
 *   - observe-mode は **fake/no-run write client**（実 DB 非接続）で使う。real write は別段階（5f）。
 */

import type { CaptureServiceResult } from "./capture-service";

/** redacted would-capture summary（raw なし・reason code のみ）。 */
export interface WouldCaptureSummary {
  /** 捕捉される構造か（gate ok ∧ extractor ok ∧ validate ok ∧ write payload 到達）。 */
  readonly wouldCapture: boolean;
  /** duration evidence が書かれるか（explicitDuration high → true）。 */
  readonly wouldEvidence: boolean;
  /** capture service の outcome（redacted）。 */
  readonly outcome: CaptureServiceResult["outcome"];
  /** redacted reason code（gate reason / intake reason / write code）。raw を含まない。 */
  readonly reason: string | null;
}

/**
 * A1-5-5e: CaptureServiceResult → WouldCaptureSummary（**pure・redacted**・exhaustive）。
 *   captured のみ wouldCapture=true（wouldEvidence=wroteEvidence）。他は全て false。reason は code のみ。
 */
export function summarizeWouldCapture(result: CaptureServiceResult): WouldCaptureSummary {
  switch (result.outcome) {
    case "captured":
      return { wouldCapture: true, wouldEvidence: result.wroteEvidence, outcome: "captured", reason: null };
    case "gate_blocked":
      return { wouldCapture: false, wouldEvidence: false, outcome: "gate_blocked", reason: result.reason };
    case "no_intent":
      return { wouldCapture: false, wouldEvidence: false, outcome: "no_intent", reason: null };
    case "invalid_extraction":
      return { wouldCapture: false, wouldEvidence: false, outcome: "invalid_extraction", reason: result.reason };
    case "intake_rejected":
      return { wouldCapture: false, wouldEvidence: false, outcome: "intake_rejected", reason: result.reason };
    case "write_failed":
      return { wouldCapture: false, wouldEvidence: false, outcome: "write_failed", reason: result.code };
    case "suppressed":
      // A1-5-11-4: write-side dedup で書かなかった（既存 active fresh 重複）。redacted reason code のみ。
      return { wouldCapture: false, wouldEvidence: false, outcome: "suppressed", reason: "duplicate_active_fresh" };
  }
}
