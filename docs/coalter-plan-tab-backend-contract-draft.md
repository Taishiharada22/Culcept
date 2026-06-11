# CoAlter in /plan タブ — バックエンド契約ドラフト v0（UIモック分析準拠）

**作成日**: 2026-06-12
**ステータス**: docs-only draft。**CEO の UI/レイアウト実装が先行し、完成後に本契約を実レイアウトへ合わせて改訂する**（CEO 指示の分業フロー）。本書は UI が bind できる安定インターフェースの先出し。
**前提**: local only（GitHub suspended・production 不可）。`/plan` は `PLAN_ROUTE_LIVE` gate 配下のまま。
**関連**: [travel-mode-plan-os-extension-design.md](travel-mode-plan-os-extension-design.md) / [m2-personalization-port-design.md](m2-personalization-port-design.md)

---

## §1 UIモック分析（2026-06-12 添付画像）

構成: ヘッダ（日付・天気・ペアアバター Kento/Mio・メニュー）/ 左パネル「プランインテリジェンス」（地図+統計・共有コンディション chips・候補プラン3案・おすすめの調整）/ 右パネル チャット（2人+CoAlter・共有コンディション要約・クイックアクション・入力欄）。

**モックから読み取れる確定的な含意（バックエンド要件）**:

1. **チャット＝Understand の常設面**: Kento「移動は長くしたくない/20時帰宅」+ Mio「カフェや美術館でゆっくり話したい」→ chips「移動は軽め / 20:00まで / 会話しやすい場所」。自由文→構造化条件のライブ抽出（Travel-β Stage 1 がチャットに常駐する形）。
2. **「予算: ミディアム」は会話に出ていない** → プロフィール/事前 state 由来のデフォルト。**UI がすでに M2 PersonalizationPort の存在を前提にしている**（M2 最優先の傍証）。
3. **「個別条件は要約して共有」の注記** → M5 説明プライバシー（private 条件はプラン形に影響しつつ、相手向けには要約のみ）が UI 仕様として明文化されている。
4. **3案カード**: タイトル+タグ2+徒歩km+価格帯(¥表記)+帰着時刻+ミニ地図+「この案をベースに調整」。= 名前のあるトレードオフ（案A 水辺とアート/ゆったり・案B 下町グルメ/フォトジェニック・案C 公園とカフェ/のんびり）+ 比較ボタン。
5. **「おすすめの調整」= 効果プレビュー付き増分編集**:「ランチをもっと近くに→移動0.4km減」「帰宅を早める→19:45頃」「予算を下げる→10%減」。**適用前に効果が分かる** → ソルバは増分再計算（local repair）と差分予測を提供する必要がある（M4 の局所修復機構と同一）。
6. **クイックアクション（チャット側）= 左パネルの調整と同一操作の別ビュー**:「もっと近く/予算を下げる/この案で進める」。→ チャットとプランパネルは**同一セッション状態の2つの射影**。
7. **統計パネル**: 移動合計 / 「予定の余裕: ゆとりあり」ゲージ（=密度・slack 指標）/ 想定帰宅。= ソルバ出力のサマリ。
8. **リアクション（👍❤️）**: 条件への同意シグナル。→ 条件の重み・合意検出・fairness 入力として利用可能。
9. **地図のノード番号+色分け経路**: itinerary graph（ノード順序+移動エッジ）。既存 TransportSegment 資産（W3-PR-10）の表示系と整合。
10. **このモック自体は日帰り行程**（帰宅20:40・徒歩2.8km）でありながら旅行プラン表示として通用する → **旅行/普通モードは同一エンジンの窓幅違い**であることを UI 自身が証明している（domain-neutral core の方針と一致）。

## §2 中核原則

- **One session, two projections, per-viewer payload**: `CoAlterPlanSession` を唯一の状態とし、チャット面とプラン面はその射影。**同一セッションでも viewer によって payload が異なる**（M5: private 条件・本人向け rationale は本人にのみ）。
- **モードはスコープパラメータ**: `mode: "daily" | "travel"` はエンジン分岐ではなく、計画窓（単日 vs 日付範囲）・宿スロット有無・予算スケールの差。
- **pinch 分割・レイアウトは UI 専権**: バックエンドはパネル非依存。realtime 配信方式（Supabase Realtime / polling）は UI 統合時に確定。

## §3 型契約スケッチ（v0）

```typescript
type CoAlterPlanSession = {
  id: string;
  pairStateId: string | null;          // null = solo
  mode: "daily" | "travel";
  window: { date: string } | { start: string; end: string; nights: 1 | 2 };
  stage: "understanding" | "curating" | "resolving" | "confirmed";
  conditions: SharedCondition[];
  candidates: PlanCandidate[];         // 2-3案
  selectedCandidateId: string | null;
  adjustments: AdjustmentSuggestion[]; // 選択案に対する増分編集候補
};

type SharedCondition = {
  id: string;
  label: string;                        // 例「移動は軽め」
  kind: "mobility" | "time" | "place_quality" | "budget" | "pace" | "other";
  severity: "red_line" | "hard" | "soft" | "preference";   // greenfield Idea 5
  source: "chat" | "profile_prior" | "correction_memory";  // prior = M2 由来
  visibility: "shared" | "private";                        // M5
  contributors: { userId: string; agreed: boolean | null }[]; // リアクション反映
};

type PlanCandidate = {
  id: string;
  title: string;                        // 「水辺とアートを楽しむ一日」
  tags: [string, string];               // 「ゆったり」「アート重視」
  recommended: boolean;
  stats: { walkKm: number; budgetBand: 1 | 2 | 3 | 4; returnEta: string; slack: "tight" | "normal" | "roomy" };
  route: { nodes: ItineraryNodeView[]; segments: SegmentView[] };  // 地図描画用
  rationale: ViewerScopedText;          // viewer 別（M5 leak check 済み）
  tradeoffLedger: string[];             // 「どちらの希望をどこで採用したか」
};

type AdjustmentSuggestion = {
  id: string;
  label: string;                        // 「ランチをもっと近くに」
  effectPreview: { walkKmDelta?: number; returnEtaNew?: string; costPct?: number };
  appliesTo: string;                    // candidateId
};

type ViewerScopedText = { forViewer: Record<string, string>; shared: string };
```

## §4 操作契約（UI→バックエンド）

| 操作 | 入力 | 効果 |
|---|---|---|
| sendMessage | text | Understand 抽出 → conditions 差分 + CoAlter 応答 |
| react | messageId, emoji | condition.contributors.agreed 更新（合意シグナル） |
| generateCandidates | — | Curate: ソルバ実行 → 2-3案 + 調整候補 |
| applyAdjustment | adjustmentId | 増分再計算 → 候補更新 + 新 effectPreview |
| selectCandidate / confirm | candidateId | Resolve: 確定 + fairness ledger 記録 +（将来）anchor export — **companions apply は HOLD 中のため export は設計のみ** |
| switchMode | "daily"\|"travel" | window/スロット構成の切替（条件は引き継ぎ） |

## §5 Travel-β ステージ ↔ UI 対応

Understand = チャット面（常駐）/ Curate = 候補プラン3案+調整 / Resolve = 「この案で進める」。greenfield の3段構造をそのまま UI に射影できており、**ステージ追加は不要**。

## §6 未決事項（UI 完成時に確定）

1. モード切替の位置と粒度（ヘッダ左上で daily/travel の2値か、日帰り/1泊/2泊まで含むか）
2. solo 利用時の右パネル表示（1人+CoAlter の対話形か）
3. リアクションの意味論（👍=条件同意として扱ってよいか）
4. 「比較する」押下時の比較ビュー（Plan Diff: greenfield Idea 14）の表示形
5. realtime 配信方式

🤖 Generated with [Claude Code](https://claude.com/claude-code)
