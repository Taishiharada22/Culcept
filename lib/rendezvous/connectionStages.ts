/**
 * Rendezvous 状態別コピーテーブル
 *
 * 設計原則:
 * - 数値で説得しない（精度・スコア・分析を前に出さない）
 * - 未来を断定しない
 * - 今の進捗と次の一歩だけを見せる
 * - 期待感は出すが、誇張しない
 * - 「現実が近づいている感覚」を伝える
 */

// ─── 状態判定に必要な入力 ───
export type ConnectionStageInput = {
  /** Stargazer 観測回数 */
  observationCount: number;
  /** Rendezvous 候補件数（feed から取得） */
  candidateCount: number;
  /** 進行中の接続があるか（メッセージ交換中 etc） */
  hasActiveConnection: boolean;
  /** ユーザー名（headline 挿入用） */
  userName?: string;
};

// ─── 状態定義 ───
export type ConnectionStageKey =
  | "unobserved"          // 未観測
  | "early_observation"   // 観測初期
  | "mid_observation"     // 観測中盤
  | "connection_ready"    // 接続準備
  | "candidates_emerging" // 候補浮上
  | "connection_active";  // 接続進行中

export type ConnectionStage = {
  stateKey: ConnectionStageKey;
  /** セクション見出し（常に "Rendezvous"） */
  title: "Rendezvous";
  /** 1行ヘッドライン */
  headline: string;
  /** 補助文（1〜2行） */
  body: string;
  /** 分かっていることチップ（2〜4個） */
  chips: string[];
  /** CTA */
  cta: { label: string; href: string; icon: string } | null;
  /** 避けるべき表現（実装時の参照用、ランタイムでは不使用） */
  avoid: string[];
  /** 軸プログレスバー */
  axes: { name: string; fill: number; active: boolean }[];
};

// ─── 状態判定 ───
export function resolveConnectionStage(input: ConnectionStageInput): ConnectionStageKey {
  const { observationCount, candidateCount, hasActiveConnection } = input;

  // 接続進行中（メッセージ交換があれば最優先）
  if (hasActiveConnection) return "connection_active";

  // 候補浮上（候補が1件以上あり、十分な観測がある）
  if (candidateCount > 0 && observationCount >= 20) return "candidates_emerging";

  // 接続準備（観測が十分だが候補はまだ）
  if (observationCount >= 30) return "connection_ready";

  // 観測中盤
  if (observationCount >= 10) return "mid_observation";

  // 観測初期
  if (observationCount >= 3) return "early_observation";

  // 未観測
  return "unobserved";
}

// ─── コピーテーブル ───
export function getConnectionStage(input: ConnectionStageInput): ConnectionStage {
  const stateKey = resolveConnectionStage(input);
  const name = input.userName ?? "あなた";
  const obs = input.observationCount;

  switch (stateKey) {
    // ━━━ 1. 未観測 ━━━
    case "unobserved":
      return {
        stateKey,
        title: "Rendezvous",
        headline: "これから、あなたのことを知っていくところ",
        body: "観測が始まると、あなたに合いそうな人の手がかりが少しずつ見えてきます",
        chips: [],
        cta: { label: "最初の観測を始める", href: "/stargazer", icon: "🧠" },
        avoid: ["精度", "スコア", "マッチング", "出会いを探す"],
        axes: [],
      };

    // ━━━ 2. 観測初期（3〜9問）— 自己理解フェーズ ━━━
    case "early_observation":
      return {
        stateKey,
        title: "Rendezvous",
        headline: "少しずつ、あなたらしさが見え始めています",
        body: "判断の傾向や大事にしやすい価値観が見え始めると、出会いの輪郭も少しずつはっきりしてきます",
        chips: [
          "判断の傾向が見えてきた",
          "大事にしやすい価値観",
        ],
        cta: { label: "観測を続ける", href: "/stargazer", icon: "🧠" },
        avoid: ["精度不足", "データが足りない", "まだ使えない"],
        axes: [
          { name: "判断の傾向", fill: Math.min(35, obs * 5), active: true },
          { name: "価値観の方向", fill: Math.min(25, obs * 4), active: true },
        ],
      };

    // ━━━ 3. 観測中盤（10〜29問）— 相性理解フェーズ ━━━
    case "mid_observation":
      return {
        stateKey,
        title: "Rendezvous",
        headline: "誰と噛み合いやすいか、土台ができ始めています",
        body: "表面的な好みではなく、判断の癖や価値観の重なりから、相性の手がかりを探っています",
        chips: [
          "判断の癖がわかってきた",
          "価値観の重なり",
          "気分の揺れ方の癖",
        ],
        cta: { label: "日記を書いて深める", href: "/origin", icon: "📝" },
        avoid: ["分析中", "処理中", "スコアリング"],
        axes: [
          { name: "判断の癖", fill: Math.min(75, 35 + (obs - 10) * 2), active: true },
          { name: "価値観の重なり", fill: Math.min(60, 25 + (obs - 10) * 1.8), active: true },
          { name: "気分の揺れ方", fill: Math.min(50, (obs - 10) * 2.5), active: true },
        ],
      };

    // ━━━ 4. 接続準備（30問以上、候補なし） ━━━
    case "connection_ready":
      return {
        stateKey,
        title: "Rendezvous",
        headline: "現実の交差につながる輪郭が整ってきました",
        body: "判断特性や価値観の深い部分が見え始めています。近い感覚の人が現れたとき、見逃しにくくなっています",
        chips: [
          "判断の傾向がはっきりした",
          "価値観の深い軸",
          "揺らぎの癖",
          "相性の土台ができた",
        ],
        cta: { label: "観測を深める", href: "/stargazer", icon: "🌤" },
        avoid: ["候補算出中", "待機中", "準備完了"],
        axes: [
          { name: "判断の傾向", fill: Math.min(92, 75 + (obs - 30) * 0.5), active: false },
          { name: "価値観の深い軸", fill: Math.min(85, 60 + (obs - 30) * 0.7), active: false },
          { name: "揺らぎの癖", fill: Math.min(78, 50 + (obs - 30) * 0.8), active: false },
          { name: "相性の土台", fill: Math.min(65, (obs - 30) * 2), active: true },
        ],
      };

    // ━━━ 5. 候補浮上（候補あり） ━━━
    case "candidates_emerging":
      return {
        stateKey,
        title: "Rendezvous",
        headline: "あなたに近い感覚が、現実の中に見え始めています",
        body: "観測データをもとに、深い部分で重なりそうな相手が少しずつ浮かび上がってきました",
        chips: [
          "価値観の重なり",
          "判断の噛み合い",
          "揺らぎの近さ",
        ],
        cta: { label: "交差を見てみる", href: "/rendezvous", icon: "∞" },
        avoid: ["マッチしました", "相性◯%", "候補が◯人"],
        axes: [
          { name: "判断の傾向", fill: 92, active: false },
          { name: "価値観の深層", fill: 88, active: false },
          { name: "揺らぎの癖", fill: 80, active: false },
          { name: "相性の土台", fill: 72, active: false },
        ],
      };

    // ━━━ 6. 接続進行中（メッセージ交換中） ━━━
    case "connection_active":
      return {
        stateKey,
        title: "Rendezvous",
        headline: "観測が、実際の接点に変わり始めています",
        body: "会話が進むほど、観測だけでは見えなかった重なりが少しずつ見えてきます",
        chips: [
          "会話から見えた共通点",
          "判断の噛み合い",
        ],
        cta: { label: "会話を続ける", href: "/rendezvous", icon: "💬" },
        avoid: ["マッチ済み", "成立", "確定"],
        axes: [
          { name: "判断の傾向", fill: 95, active: false },
          { name: "価値観の深層", fill: 90, active: false },
          { name: "揺らぎの癖", fill: 85, active: false },
          { name: "相性の土台", fill: 80, active: false },
        ],
      };
  }
}
