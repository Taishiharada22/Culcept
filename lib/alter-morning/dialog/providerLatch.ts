/**
 * Provider Failure Latch — W3-PR-8 rev 3 commit 24
 *
 * 位置づけ:
 *   DialogState.providerFailureStreak に基づいて user-facing message を
 *   degrade 文に差し替える pure helper。phase authority は変更しない。
 *   plan.items の合成・LLM・I/O 呼び出し禁止。
 *
 * 動機（2026-04-22 commit 23c live preview 観測）:
 *   Run 2 Turn 2 「9時くらい」で Gemini 503 → OpenAI fallback 成功のケースが
 *   観測された。ai/run 層の fallback が成功したので user には見えないが、
 *   CEO 方針では failure latch を「現実の blocker」と位置付け、次段階で
 *   provider 総失敗時（pipeline throw）に user 画面を明示的に degrade する
 *   必要がある。
 *
 *   commit 20 (buildFailedPipelineResult) が items>0 を維持するので HTTP 500
 *   は防げるが、user 側は「何事もなかったように message が返る」ため、
 *   実際に provider が degrade していることを user に伝える導線が無かった。
 *
 * 設計方針:
 *   1. phase authority 不変。morningResponse.phase / plan は触らない。
 *   2. message / clarifyQuestion のみ差し替える。
 *   3. streak=0 では noop（shouldReplace=false）。正常時は完全不介入。
 *   4. streak=1 で degrade 発火（「ちょっと届きにくい」ニュアンス）。
 *   5. streak≥2 で severe 段階（「少し時間を置いて」）。
 *   6. 世界観: Aneurasync alter voice（短く・柔らかく・断定しない・絵文字なし）。
 *      目安 20-28 文字。
 *
 * 呼び出し順位（route.ts 側）:
 *   commit 19 promote → **commit 24 latch** → commit 23 clarifyFallback
 *   latch が発火したら clarifyFallback は skip（degrade 文を守る）。
 *
 * 禁止事項:
 *   - phase / plan / personalizeHints の書き換え
 *   - session.dialogState の書き換え（reducer の責務）
 *   - 外部 I/O (DB / LLM / Places API)
 *   - streak 値の書き換え（pure 関数）
 *
 * 設計書:
 *   - docs/alter-morning-strict-confirmation-design.md §2.11 providerRecovery
 *   - docs/alter-morning-pr8-rev3-implementation-detail.md §3 (providerRecovery)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ProviderLatchParams {
  /**
   * DialogState.providerFailureStreak の現在値。
   * route 側が shadow 更新後の値を渡す（今 turn の PROVIDER_FAILED 反映済み）。
   */
  providerFailureStreak: number;
  /**
   * 差し替え対象の現在 message（既に commit 19 promote 後の値を想定）。
   * noop 判定には使わない（streak だけが唯一の decider）が、ログ用の
   * before_len を呼び出し側で取れるように渡す契約のまま温存する。
   */
  currentMessage: string;
}

export interface ProviderLatchResult {
  /** true のとき呼び出し側は morningResponse.message / clarifyQuestion を書き換える */
  shouldReplace: boolean;
  /** shouldReplace=true のときの差し替え先 message。false のときは null */
  nextMessage: string | null;
  /** debug / structured log 用の判定理由（英数字 + "_" のみ） */
  reason: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 閾値
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * streak=1 で既に degrade を発火する。
 *   理由: commit 20 buildFailedPipelineResult は items>0 を維持するので
 *   user には見かけ上正常な返答が出るが、実際には prior state の使い回しで
 *   最新発話が反映されていない可能性が高い。
 *   1 回の総失敗でも「届きにくい」ニュアンスを短く伝えるのが誠実。
 *
 * streak≥2 で severe 文言に切替。時間を置くように促す。
 */
const LATCH_TRIGGER_STREAK = 1;
const SEVERE_STREAK = 2;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メッセージ（alter voice 準拠）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * streak=1: 最初の total failure 到達時。
 *   24 文字。断定せず、short re-try を促す柔らかい文。
 */
const MESSAGE_STREAK_1 = "今ちょっと届きにくいかも。少し待って、もう一度。";

/**
 * streak≥2: 連続失敗。時間を置く提案。
 *   22 文字。焦らせず、後でもう一度話そうと誘う。
 */
const MESSAGE_STREAK_SEVERE = "まだ少し重いみたい。時間おいてまた話そう。";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * providerFailureStreak から user-facing degrade メッセージを決める pure 関数。
 *
 * 呼び出し側の責務:
 *   - shadow block で PROVIDER_FAILED を dispatch し終えた後の DialogState を参照
 *   - shouldReplace=true のとき morningResponse.message / clarifyQuestion を書き換える
 *   - shouldReplace=true の場合は後段の clarifyFallback を skip する
 */
export function computeProviderLatch(
  params: ProviderLatchParams,
): ProviderLatchResult {
  const streak = Math.max(0, Math.floor(params.providerFailureStreak));

  if (streak < LATCH_TRIGGER_STREAK) {
    return {
      shouldReplace: false,
      nextMessage: null,
      reason: "noop_no_streak",
    };
  }

  if (streak >= SEVERE_STREAK) {
    return {
      shouldReplace: true,
      nextMessage: MESSAGE_STREAK_SEVERE,
      reason: "latched_severe",
    };
  }

  // streak === 1
  return {
    shouldReplace: true,
    nextMessage: MESSAGE_STREAK_1,
    reason: "latched_first",
  };
}
