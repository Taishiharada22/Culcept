"use client";

/**
 * Stage 4 L4-a — 上部レイヤー本番マウント entry point
 *
 * 正本: layout plan v0.3 §7.1 / Core UX v1.1 §3.1 上部レイヤー位置
 *
 * `presenceExecutorEnabled` flag OFF (既定) で **null を返す** = 既存 ChatClient 完全不変。
 * flag ON (Stage 4 L4-l 以降の CEO 別審議で flip) で本番上部レイヤーを mount。
 *
 * 本 phase (L4-a) では:
 *   - mount 場所のみ確保 (ChatClient.tsx の chat 領域上部)
 *   - flag OFF で render = null (snapshot test PASS の根拠)
 *   - flag ON 時の content は最小 placeholder。後続 phase で順次本番化:
 *     - L4-b signal adapter 接続
 *     - L4-f mode 切替 UI
 *     - L4-g 共有メモリ surface
 *     - L4-h 緊急介入視覚層
 *
 * 不可侵 (plan §0.4 / §7 全体):
 *   - flag OFF で既存 ChatClient render が 1 bit も変わらない
 *   - production behavior 不変原則: Stage 4 L4-a 〜 L4-k 全 phase で flag は OFF 固定
 */

import { COALTER_FLAGS } from "@/lib/coalter/flags";

/**
 * 本番上部レイヤー mount entry point。flag OFF で null。
 *
 * 本 component は server / client いずれでも render 可。
 * flag は env 経由で SSR / CSR 両方で同じ値を返す。
 */
export default function UpperLayerMount() {
  if (!COALTER_FLAGS.presenceExecutorEnabled) {
    return null;
  }
  return <UpperLayerMountActive />;
}

/**
 * flag ON 時の上部レイヤー本体 (placeholder、L4-b 以降で順次差し込み)。
 *
 * 本 phase は最小 placeholder のみ。Stage 4 L4-l flip 時には full UI が
 * 揃っている前提 (L4-f/g/h で順次本番化)。
 */
function UpperLayerMountActive() {
  return (
    <div
      role="region"
      aria-label="CoAlter 上部レイヤー"
      className="border-b max-w-lg mx-auto w-full"
      style={{
        background: "#ffffff",
        borderColor: "#e8e8ec",
        padding: "8px 12px",
      }}
      data-testid="coalter-upper-layer-mount"
    >
      {/* L4-b 以降で 上部レイヤー content (state header / chip / mode switcher /
          memory surface rail / urgent layer overlay) を差し込む */}
      <div style={{ fontSize: 11, color: "#8888a0" }}>
        🔵 CoAlter 上部レイヤー (Stage 4 L4-a placeholder、L4-b/f/g/h で本番化)
      </div>
    </div>
  );
}
