/**
 * lib/plan/aneuraReadoutGate.ts
 *   — 評価OS / Aneura readout 一族の production 解放マスター flag（統一・default OFF）
 *
 * 背景: 「評価OS / Aneura readout」系の read/display surface は各々 `CONST && NODE_ENV !== "production"`
 *   で dogfood/dev 限定（production hard block）だった。local 最新で見えていたこれらを production の
 *   ユーザー体験へ戻すため、各 gate を「(従来) || isAneuraReadoutProdEnabled()」に置換する。
 *
 * 厳守（UI Freeze / 安全境界）:
 *   - default OFF: env 未設定なら現 production と完全同一（false）。退化なし。
 *   - read/display 専用: A 系（理由/適合/比較/状況補正…）は DB write / network / 課金 / 順位変更を伴わない。
 *   - localStorage 観測（postVisit / candidate-lens preference）は別 flag（isAneuraObserveProdEnabled）。
 *   - 既存の個別 flag（NEXT_PUBLIC_PLACE_CANDIDATE_LENS_UI / 各 dogfood）は壊さず OR で併存。
 *   - client surface ゆえ NEXT_PUBLIC_（build 時 inline・反映に redeploy 要）。
 *   - ★canary scope guard（2026-06-28・safety baseline）: env true でも **runtime opt-in を AND**。
 *     env true = 全 production ユーザー rollout を防ぐ。非 opt-in には表示も観測もしない（[[aneuraCanaryOptIn]]）。
 */
import { isAneuraCanaryOptedIn } from "@/lib/plan/aneuraCanaryOptIn";

/**
 * 評価OS / Aneura readout 一族（A・純表示）の production 解放。
 *   env: NEXT_PUBLIC_ANEURASYNC_READOUTS_PROD === "true"（default OFF） **∧ canary opt-in**。
 */
export function isAneuraReadoutProdEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ANEURASYNC_READOUTS_PROD === "true" && isAneuraCanaryOptedIn();
}

/**
 * localStorage 観測（B・postVisit 答え合わせ / candidate-lens preference）の production 解放。
 *   env: NEXT_PUBLIC_ANEURASYNC_OBSERVE_PROD === "true"（default OFF） **∧ canary opt-in**。
 *   DB write / network なし・localStorage のみ。表示 flag（READOUTS）とは分離。初回 canary では OFF 想定。
 */
export function isAneuraObserveProdEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ANEURASYNC_OBSERVE_PROD === "true" && isAneuraCanaryOptedIn();
}
