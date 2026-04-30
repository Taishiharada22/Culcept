/**
 * CoAlter Stage 2 — LocalState interface (L2-f 媒体非依存層)
 *
 * 正本: runtime contract §2.1.2 local state (各 client ローカル、server 関与せず)
 *
 * local state = 各クライアントが独自に保持する UI 状態。
 * server / 相手 client に同期しない。両側で違って見えるのが正常な状態。
 *
 * shared state (sharedState.ts) と LocalState の両者で同じフィールドを保持しない
 * (overlap ゼロ、test で構造的検証)。
 */

/**
 * Client ローカル UI 状態 (runtime §2.1.2 列挙項目)。
 */
export interface LocalState {
  /** 入力中テキスト (送信前 draft、相手に見せない) */
  inputDraft: string;

  /** hover / focus 状態 (UI 要素 id ベース) */
  hoverElementId: string | null;
  focusElementId: string | null;

  /** 一時展開 UI (tooltip / ホバー展開カード等の途中状態、key=要素 id) */
  tooltipsOpen: ReadonlySet<string>;

  /** スクロール位置 (px) */
  scrollY: number;

  /** アニメーション中間フレーム識別子 (再生中 anim id 群) */
  animationsInFlight: ReadonlySet<string>;
}

/**
 * 全 LocalState フィールドの key 列挙 (網羅性 test 用)。
 */
export const LOCAL_STATE_KEYS = [
  "inputDraft",
  "hoverElementId",
  "focusElementId",
  "tooltipsOpen",
  "scrollY",
  "animationsInFlight",
] as const satisfies ReadonlyArray<keyof LocalState>;

/**
 * 初期 LocalState (空の UI 状態)。
 */
export function initialLocalState(): LocalState {
  return {
    inputDraft: "",
    hoverElementId: null,
    focusElementId: null,
    tooltipsOpen: new Set(),
    scrollY: 0,
    animationsInFlight: new Set(),
  };
}
