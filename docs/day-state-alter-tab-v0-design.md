# DayStateRecord / Night Check / Alter タブ v0 — 統合設計（docs-only）

- 日付: 2026-06-11
- 作成: Claude（Build/Product 合同設計、CEO 諮問への回答）
- ステータス: **設計のみ。コード変更ゼロ。実装は本書の CEO 承認後**
- 前提資料: `docs/reality-gradient-engine-assessment.md`（追補 A 含む）/ 土台精査ワークフロー 7 系統（2026-06-11、file:line 検証済み）
- 答える問い: CEO 質問 a)（性格と身体）、b-1〜b-8（実装判断粒度の 8 問）、c)（1分単位の状態 / Reality Graph）
- 改訂: 2026-06-11 敵対的レビュー反映済み（HIGH 2 件 = 採点方向の統一・予測凍結の導入 / MED 8 件 / LOW 7 件）
- **改訂 v0.1（2026-06-11 同日・CEO/GPT 監査反映）**: ①人体 4 部位 → **3 系統バッテリー（脳=集中 / 心臓=心の余力 / 体=体力）+ 周辺カード**へ転換（外出耐性は人体水位から周辺カードへ移動）②estimates を再構成（emotionalReserve / outingTolerance / dayFeasibility 追加、socialBandwidth は導出入力へ降格）③ミニ Composer を v0 に復帰（チャット欄は残す = CEO 構想）④Reality Graph 全体図を追加（§2.4）⑤採点 3 系統化（夜の主問 2 + followup 1、部位タップ補正は採点補助と明文化）⑥5 段量子化フィルは固定仕様にしない（visualFill 連続・数字非表示は維持）。UI 詳細は `docs/alter-tab-visual-contract.md`、分担は `docs/handoff-session-a-logic.md` / `docs/handoff-session-b-ui.md` に分冊

---

## 0. 結論サマリ

| # | 問い | 結論 |
|---|---|---|
| a | 性格レイヤーは心であって体ではないのでは | **正しい。** 軸は「状態」ではなく「係数」として使う。身体データは生理センサーが存在しないため、シフト・予定構造・天気・本人タップの**代理推定 + 確信度 + 夜の採点**で持つ（§1） |
| b-1 | DayStateRecord v0 の最小フィールド | facts / estimates（v0.1: 3 系統バッテリー + 周辺 4 見立て、全て ConfidentValue）/ estimatesFrozen / userInputs / nightCheck / carryOverOut。新規 enum 4（recoveryNeed・emotionalReserve・outingTolerance・dayFeasibility）（§3） |
| b-2 | 採点対象と禁止 | 連続値（48% 等）は**採点不能 → 表示禁止・正本保存禁止**。採点対象は enum 帯の見立て 3 個（energyLevel・recoveryNeed・dayFeasibility）と drift。focusReserve / emotionalReserve / outingTolerance は補正タップによる採点補助のみ。数値は導出中間体としてのみ許可（§4） |
| b-3 | Night Check の 1 問 | 「今日は、最後まで余力がありましたか？」アンカー付き 5 択 + 条件付き 1 followup。チップ→フィールド対応表を確定（§5） |
| b-4 | plan_drift_events の write path | Stage 0 pure → Stage 1 localStorage → Stage 2 Supabase（migration 1 本 + 夜 1 回の INSERT。append-only 維持・UPDATE 不要）→ Stage 3 cross-day read（B1 gate）（§6） |
| b-5 | Alter タブ vs Dock | **前回の Dock 推奨を撤回し、専用タブ案を採用**。根拠 3 点: 情報量・N-3 適合性・進行中 dogfood の非汚染。v0.1: ミニ Composer（既存 route source:"plan"）を含む（§7） |
| b-6 | 45 軸接続 v0 | 3 軸（individual_vs_social / plan_vs_spontaneous / emotional_regulation）を「見立ての事前分布」のみに接続。1 軸目は既配線（WIRE_JUDGMENT_MODE=true）の再利用（§8) |
| b-7 | 人体バッテリー | v0.1: **3 系統（脳=集中/心臓=心の余力/体=体力）が人体内部を巡る表現**。外出耐性は周辺カードへ。visualFill は連続値可・数値非表示・「見立て」バッジ・根拠チップ・ワンタップ補正・unknown 正直表示。「今日の開始残量」不採用（§9 + visual-contract） |
| b-8 | docs-only で決めること | 本書 = 5 mini-design の統合版。実装 GO 時に 5 分冊（§10） |
| c | 1分単位の状態 | 「1分ごとに**保存**」ではなく「開いた瞬間に1分精度で**導出**」。store slow / derive fast。Reality Graph は正しい北極星で、骨格（DayGraph）は既存（§2） |

---

## 1. 前提を疑う — 性格レイヤーと身体データの正面整理（質問 a への回答）

### 1.1 CEO の指摘は正しい

Stargazer 45 軸は心理特性の観測であり、**今日の体力の測定ではない**。前回報告の「性格レイヤーでは数値保持が実現済み」は「数値+確信度+永続化という**器の形式**が実証済み」という意味であって、「身体状態が取れている」という意味ではない。ここを混同すると設計が壊れる。

### 1.2 軸の正しい役割 — 「状態」ではなく「係数」

同じ予定密度でも、人によって消耗が違う。軸はその**変換係数**として使う:

| 役割 | 例 | 使い方 |
|---|---|---|
| 応答係数 | individual_vs_social が solo 側 → 社交予定 1 件あたりの消耗を高めに見積もる | 見立ての導出式の係数 |
| 弱い事前分布 | 観測ゼロの朝、energy の初期値を傾ける | confidence ≤ 0.35・hedged のみ |
| 補正の条件付け | 「夜勤明けの日に見立てが外れやすい」を軸×文脈で学習 | Night Check 結果の帰属先 |

軸を「今日のあなたは疲れている」の根拠にすることは**禁止**（状態と特性の混同 + 断定）。

### 1.3 身体データの現実 — 何が無く、何で代理するか

土台精査の確定事実: **生理データの取得経路はゼロ**（HealthKit / Google Fit / Fitbit / heartRate / sleep の一致なし）。今日から使えるのは:

| 信号 | 出所（実在確認済み） | 性質 |
|---|---|---|
| 勤務形態（夜勤判定可） | shift import → `external_anchors`（source_type='shift_image'）+ `plan_day_indicators`（kind='off'/'off_request'） | **事実** |
| 予定構造（密度・移動・余白） | DayGraph（eventNode/gapNode/timeBucket）+ `MovementSegmentResolved.estimatedDurationMin` + feasibility availableMin | **事実** |
| 天気 | Open-Meteo（localStorage キャッシュ 1h） | **事実** |
| 本人タップ | `ActivityMoodCode`（**'tired' を含む 6 値**）/ origin の `bodyEcho`（head/chest/stomach/limbs 質的入力） | **本人申告** |
| 前日の実績 | `alter_morning_plan_history`（直近 1 日のみ fetch 可） | 事実（読取は B1 gate に注意） |

つまり「体力」は測れない。**測れないものを測れる顔で出さない**のが本設計の第一原則であり、だから (i) 全ての身体系見立ては `ConfidentValue`（inferred・低 confidence）で持ち、(ii) ワンタップ補正を常設し、(iii) 夜に採点する。JITAI 文献上もセンサーなしの文脈推定で受容性 +40% 改善が実証済みで、**センサー欠如は v0 の障害ではない**。HealthKit 等の将来統合は外部連携 = CEO 承認事項であり、v0 のスコープ外。

---

## 2. 状態の全体像 — Reality Graph と v0 の切り出し（質問 c への回答）

### 2.1 「1分単位で持つ」の正確な定義

目標を「1分ごとに保存する」と読むと間違える。保存則は **store slow / derive fast**:

- **保存するもの（遅い）**: per-day の台帳（DayStateRecord）、予定（anchors）、補正イベント、夜の採点。
- **導出するもの（速い）**: MomentState — 開いた瞬間に、現在時刻 × DayGraph × DayStateRecord から純関数で計算。`now / nextFixedEventAt / 出発までの分数（feasibility 既存値）/ timeBucket / 介入可能窓`。保存しない。push しない（N-3）。

これで「いつ開いても 1 分精度の状態がある」が成立し、毎分保存の問題（採点価値ゼロのデータ膨張、B2/R6 の常時監視ゲート抵触）を全部回避する。

### 2.2 GPT の Reality Graph 6 ノードと既存資産の対応

| GPT のノード | 既存資産 | v0 で作るか |
|---|---|---|
| UserState（日次） | DailyGuidanceFrame（毎ターン使い捨て） | **作る = DayStateRecord（本書の主対象）** |
| MomentState | feasibility / transport / TimeBucket（部品あり） | **作る = pure 導出関数 1 本のみ・保存なし** |
| EventRealityNode | **DayGraph が既に存在**（eventNode/gapNode + latencyTolerance + slack + density）。GPT の想定より進んでいる | 作らない（既存の束ね直し。命名のみ） |
| RequestRealityFrame | compose 取込（AddAnchorComposeContainer）+ DG frame 抽出 | 作らない（既存トラック） |
| PlaceCandidateReality | A4 Place Affinity トラック | 作らない（既存トラック継続。※所在が branch 間で要確認） |
| RealityDiff | A3 What-if（inverse + comparison、dogfood ON） | 作らない（既存トラック継続） |
| PredictionLedger | **欠落** | **作る = Night Check（本書）** |

結論: Reality Graph は正しい北極星だが、v0 の新規物は **DayStateRecord + Night Check + MomentState 導出関数 + Alter タブ** の 4 つだけ。グラフの骨格（DayGraph）は既にある。

（§2.3 は欠番）

### 2.4 Reality Graph 全体図 — Alter タブはこのグラフの操縦席である（v0.1 追加・GPT 指摘 4 対応）

**Alter タブは「状態メーター画面」ではない。Reality Graph 全体の入口・操縦席である**。DayStateRecord は中心部品だが、Event / Place / Request / Diff まで繋がって初めて完成形になる。v0 はこのうち太字の 2 ノード + 操縦席を作る。

```
                    ┌─────────────────────────────┐
                    │   Alter タブ（操縦席・v0）      │
                    │  人体バッテリー / 周辺カード /    │
                    │  Night Check / チップ / Composer │
                    └──┬──────────┬──────────┬─────┘
                       │ 表示・補正  │ 採点      │ 会話→構造抽出（後段）
                       v           v          v
   ┌────────────┐  ┌━━━━━━━━━━━━┓ ┌━━━━━━━━━━━━━┓
   │ MomentState │←─┃**DayStateRecord**┃→┃**PredictionLedger**┃
   │（開いた瞬間に │  ┃ 今日の台帳（v0） ┃ ┃ Night Check + drift ┃
   │ 導出・保存なし）│  ┗━━━━┯━━━━━━━┛ ┗━━━━━━━━━━━━━┛
   └────────────┘       │ 係数: Stargazer 軸（§8）/ HDM heart 状態（read-only）
        ┌───────────────┼───────────────┬───────────────┐
        v               v               v               v
  ┌────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────┐
  │EventRealityNode│ │RequestRealityFrame│ │PlaceCandidate │ │RealityDiff │
  │= DayGraph(既存)│ │= compose 取込(既存)│ │Reality = A4   │ │= A3 What-if│
  │ event/gap/density│ │ + DG frame 抽出  │ │(既存トラック)  │ │(dogfood 中)│
  └────────────┘ └──────────────┘ └──────────────┘ └──────────┘
```

接続規約: Alter タブは各既存トラックの**消費者**であり再実装しない（Life Ops 境界の「縦は横の machinery を再実装しない」と同じ契約）。A3 の差分・A4 の場所候補は、各トラックの CEO 判断後にタブへ「流れ込む」— タブ側はその受け口（§7.2 の調整案 CTA・場所候補スロット）だけ確保する。

---

## 3. DayStateRecord v0 — Data Contract（質問 b-1 への回答）

### 3.1 設計原則

1. 語彙規律（v0.1 改訂）: **既存概念の重複語彙を作らない**。値 enum は既存定義を import して再利用し、既存に対応物が無い概念のみ最小バンドで新設する。新設は 4 つ: recoveryNeed / emotionalReserve / outingTolerance / dayFeasibility（いずれも土台精査で既存対応物の不在を確認済み。体質スタミナ級の概念は軸が存在しないため**不採用**）。
2. 事実と見立てを区画で分離: 事実（facts）は採点不要・数値可。見立て（estimates）は全て `ConfidentValue` で採点対象。
3. 1 日 1 レコード。PK 相当 = (user, date)。`alter_morning_plan_history` と同じ構え。

### 3.2 型定義（実装時に `lib/plan/dayState/dayStateTypes.ts` として新設）

```ts
// 再利用 import（実在確認済みの既存定義）:
//   ConfidentValue<T> / EvidenceSource  … lib/stargazer/alterHomeAdapter.ts:6904-6911
//   energy_level 値 "high"|"medium"|"low"|"depleted"|"unknown" … 同 :8051
//   social_bandwidth 値 "want_people"|"solo_preferred"|"either"|"unknown" … 同 :8056
//   DailyGuidanceMode "recover"|"reset"|"advance"|"maintenance"|"social"|"explore" … 同 :8039-8045
//   density "sparse"|"balanced"|"packed" … lib/plan/dayGraph/dayGraphAttributes.ts:56-59
//   TimeBucket … lib/plan/dayGraph/dayGraphTypes.ts:56-63
//   ActivityMoodCode（'tired' 含む 6 値）… lib/coalter/activity/intent.ts:104

type DayStateRecordV0 = {
  schemaVersion: 0;
  date: string; // "YYYY-MM-DD"（JST。plan_date と同じ規約）

  // ── §A facts: 事実（観測値。採点不要。数値そのまま保持してよい） ──
  facts: {
    anchorCount: number;
    density: "sparse" | "balanced" | "packed";        // 既存 export 型 DensityLevel（lib/plan/context/contextModifier.ts:73）を import。値は computeDayGraphAttributes の density 出力を再利用（dayGraphAttributes.ts:111。computeDensity は非 export — export 追加が要る場合は契約差し戻し）
    bookedMin: number;                                 // Σ eventNode.durationMin
    travelChainMin: number | null;                     // Σ MovementSegmentResolved.estimatedDurationMin（座標欠如時 null。heuristic 補完禁止 = 既存規律）
    eveningSlackMin: number;                           // Σ gapNode.durationMin where timeBucket ∈ {"evening","night"}（17:00-23:00）
    largestFreeBlockMin: number;                       // max gapNode.durationMin
    shift: { kind: "work" | "off" | "off_request" | "none";
             startTime?: string; endTime?: string;
             isNightShift: boolean | null };           // 勤務時間帯から導出（22:00-05:00 跨ぎ）
    weather: { condition: string; pop: number } | null;
  };

  // ── §B estimates: 見立て・現在値（全て ConfidentValue。補正タップで日中更新される。v0.1 再構成） ──
  estimates: {
    // 3 系統バッテリー（人体内部の水位。§9 / visual-contract 参照）
    energyLevel:      ConfidentValue<"high"|"medium"|"low"|"depleted"|"unknown">; // 体バッテリー（体力）— 既存 enum
    focusReserve:     ConfidentValue<"high"|"medium"|"low"|"unknown">;            // 脳バッテリー（集中余力）— v0 導出は弱い→unknown 許容
    emotionalReserve: ConfidentValue<"high"|"medium"|"low"|"unknown">;            // 心臓バッテリー（心の余力）— 新設。導出材料: bodyEcho.chest(tight/open/normal)・moodCode・DayState.emotion・対人予定密度・HDM heart 状態(read-only 参考)
    // 周辺カード用の見立て
    outingTolerance:  ConfidentValue<"low"|"medium"|"high"|"unknown">;            // 外出耐性（人体水位ではなく周辺カード）。GPT 指摘 1 対応の合成: combine(travelChainMin, weather, shift 疲労, socialBandwidth 信号, estimatedWalkLevel, 本人補正)
    dayFeasibility:   ConfidentValue<"likely_steady"|"mixed"|"likely_fragile"|"unknown">; // 今日の成立見込み（followup planVerdict で採点される第 3 の採点対象）
    // 内部保持（GPT 指摘 5: 概念を消さない。周辺カード「回復の質」「持ち越し」と保護的トーンに使う）
    recoveryNeed:     ConfidentValue<"low"|"medium"|"high"|"unknown">;
    dailyMode:        ConfidentValue<DailyGuidanceMode>;                          // 既存 6 値
  };
  // 注: socialBandwidth（既存 enum want_people/solo_preferred/either）は estimates から降格し、
  // emotionalReserve / outingTolerance の導出入力（DG 抽出シグナル）として扱う。

  // ── §B' estimatesFrozen: 採点用スナップショット（HIGH-2 対応の中核） ──
  // その日の初回導出時に estimates を凍結。以後、本人補正・再導出があっても不変。
  // Night Check の採点（システムの予測精度測定）は必ずこの凍結値に対して行う。
  // 凍結時点で source="user_confirmed" だったフィールドは「本人申告の追認」であり、
  // システム精度の集計（match 率）から除外して別系列で集計する。
  estimatesFrozen: {
    at: string;                                        // 凍結時刻 = その日の初回導出時
    values: DayStateRecordV0["estimates"];
  };

  // ── §C userInputs: 本人入力（最強 evidence。source="user_confirmed"） ──
  userInputs: {
    moodCode?: ActivityMoodCode;                       // 既存 enum（tired 等）
    // v0.1: 3 系統すべて余力方向（focusReserve/emotionalReserve/energyLevel）のため
    // 表示方向 = 格納方向。変換不要（§9.3）。recoveryNeed は系統タップの対象外
    //（内部保持・周辺カード材料のみ）。direction は格納フィールドの値空間で記録する。
    corrections: Array<{ at: string; field: keyof DayStateRecordV0["estimates"];
                         direction: "lower" | "match" | "higher" }>; // 系統・カード補正タップ
    // クイックチップ（元気/少し疲れた/眠い/外出は軽め）は estimates の該当フィールドを
    // source=user_confirmed (0.9) で直接更新し、corrections に履歴を残す。
    // 「集中したい」のみ保存しない ephemeral 信号（dailyMode 導出の desire 入力。
    // focusReserve には書かない — 願望と状態を混同しない）。
  };

  // ── §D nightCheck: 夜の答え合わせ（§5 で定義） ──
  nightCheck?: NightCheckResultV0;

  // ── §E carryOverOut: 持ち越し（v0 は「書くだけ」。翌朝の読取は B1 gate 後） ──
  carryOverOut?: {
    recoveryDebt: "none" | "some" | "high";            // nightCheck から導出
    unfinishedAnchor: boolean;                         // 未完了予定の有無
    lateNightEnd: boolean;                             // night/late_night に活動が及んだか
  };

  evidence: EvidenceTag[];
};

// 自由文字列禁止（LOW-5 対応）。raw text 禁止規律と N-3 regression を型で機械保証する。
type EvidenceTag =
  | "shift_night" | "shift_work" | "day_off"
  | "dense_schedule" | "long_travel_chain" | "low_evening_slack" | "large_free_block"
  | "weather_rain" | "weather_heat"
  | "user_tired_tap" | "user_mood_input" | "user_correction"
  | "carry_over_debt" | "axis_prior_used";
```

### 3.3 estimates 7 フィールドの導出式（v0。全て既存フィールドから）

| 見立て | 導出（優先順） | 初期 confidence |
|---|---|---|
| energyLevel（体バッテリー） | ①本人タップ/moodCode（user_confirmed 0.9）②shift.isNightShift=true → "low"（inferred 0.5）③前日 carryOver（B1 解錠後）④なし → "unknown"（0） | |
| focusReserve（脳バッテリー） | ①本人補正のみ確度高。②proxy: largestFreeBlockMin ≥ 90 かつ density ≠ packed → "medium"（inferred **0.3 上限**）③なし → "unknown" | 弱いことを仕様として明記 |
| emotionalReserve（心臓バッテリー・v0.1 新設） | ①bodyEcho.chest（user 入力: tight→low / open→high / normal→medium。user_confirmed 0.85）②moodCode・DayState.emotion（tired/anxious/frustrated → low 寄り。inferred 0.4）③対人予定密度（DayConditions.withWhom / DayState.social の many_people 連続。inferred **0.3 上限**）④HDM heart 状態（psychologicalCapacity / emotionalLoad — `lib/stargazer/heartIntegration.ts:30-60` を **read-only 参考**。対話文脈由来のため 0.3 上限・belief 書き戻し禁止）⑤なし → "unknown" | 弱い前提を仕様化 |
| outingTolerance（外出耐性・v0.1 新設） | combine: travelChainMin（多いほど低）× weather（雨/猛暑で低）× shift 疲労 × socialBandwidth 信号（solo_preferred は対人外出のみ低）× estimatedWalkLevel × 本人補正。**socialBandwidth 単独で決めない**（GPT 指摘 1 対応） | 入力数に応じ 0.3-0.6 |
| dayFeasibility（成立見込み・v0.1 新設） | facts のみから: density=packed ∧ travelChainMin 大 ∧ eveningSlackMin<60 → "likely_fragile" / sparse ∧ 余白充分 → "likely_steady" / 中間 → "mixed" | 0.4-0.6（事実由来でやや高め） |
| recoveryNeed | energyLevel ∈ {low, depleted} → "high"。eveningSlackMin < 60 で 1 段階上げ | energyLevel の confidence × 0.8 |
| dailyMode | resolveDailyMode（既存）に facts を渡す | 入力の min confidence |

（socialBandwidth は DG 抽出/本人入力/軸事前分布（§8・hedged のみ）から得る**導出入力シグナル**であり、見立てとしては保存しない）

導出の中間計算で 0-1 連続値を使ってよいが、**レコードに正本として保存するのは enum + confidence のみ**（§4 の規律）。

凍結の規律（HIGH-2 対応）: その日の初回導出時点で `estimatesFrozen` にスナップショットを取り、以後不変。本人タップ・再導出は `estimates`（現在値）だけを更新する。凍結前に本人入力が既にあった場合、そのフィールドは凍結値に入るが source=user_confirmed のためシステム精度集計から除外される（本人申告の追認を「予測が当たった」と数えない）。

---

## 4. 採点規律 — 何を採点し、何を禁止するか（質問 b-2 への回答)

### 4.1 「集中余力 48%・体力 61%」は採点可能か → **不可能。よって正本にしない・表示しない**

理由: 連続値の ground truth が存在しない（センサーなし。夜の自己申告は 5 段アンカーが妥当性の限界 — 単一項目尺度研究より）。採点できない数値は「数式コスプレ」になる（assessment §5-1、decision-log L200 PRG「偽数値禁止」と同一原則）。

### 4.2 三層の規律

| 層 | 数値の扱い | 例 |
|---|---|---|
| 導出中間体（メモリ内） | 連続値 OK。保存しない | 密度比 0.72 を計算に使う |
| 正本（DayStateRecord） | enum 帯 + confidence + evidence のみ。**facts 区画の実測分数は例外的に数値 OK**（測定値であり予測ではないため採点不要） | energyLevel: "low" (0.5, inferred) / eveningSlackMin: 85 |
| ユーザー表示 | **見立て・予測への数値付与は禁止**（%・score・確率・残量数値。A3 HARD 不変条件と同じ線）。時刻（HH:MM）と予定構造由来の分数は事実表示として許可するが、推定所要（estimatedDurationMin 由来）を数値で出すときは帯語（「移動が多め」）を優先する（MED-1 対応）。5 段帯 + 根拠語 + 「見立て」バッジ | 「からだの余力: やや少なめ（見立て）」 |

### 4.3 採点対象の確定リスト

**over/under の規約（HIGH-1 対応・本書全体で唯一の定義）**: 採点は常に「凍結見立て vs 実際」で表現する。
- **over = 見立てが実際より高かった（過大見積もり）** → 翌日の同条件 prior を 1 段下げる
- **under = 見立てが実際より低かった（過小見積もり）** → 翌日の同条件 prior を 1 段上げる

| 採点対象 | actual の取り方 |
|---|---|
| estimatesFrozen の **energyLevel と recoveryNeed**（夜の主問） | Night Check の 5 段アンカー回答 → match / over / under |
| estimatesFrozen の **dayFeasibility**（followup。v0.1 で追加 = 第 3 の採点対象） | followup の planVerdict: as_seen → likely_steady が正解 / partial_drift → mixed / major_drift → likely_fragile、として match / over（堅く見すぎ＝実際は崩れた）/ under（脆く見すぎ＝実際は保った）を判定 |
| 予定の成立（drift） | Night Check followup → `plan_drift_events`（driftType + predicted + actual。v0 では intensityFelt を**書かない** — per-event の実測が無いものを埋めない。MED-8 対応） |
| **focusReserve / emotionalReserve / outingTolerance** | 夜の主問では採点**しない**。**部位タップ・カードタップ補正を採点補助として使う**（GPT 指摘 3 の明文化）: 補正タップ = その時点の本人申告 actual として correction 履歴に蓄積し、頻繁に「もっと低い」が付く部位は導出式の係数を見直す材料にする。match 率には入れない |
| dailyMode の妥当性 | v0 では採点しない（多義的で 1 問に乗らない）。v1 検討 |

**dayFelt ↔ energyLevel 帯の対応表（MED-4 対応）**:

| dayFelt | actual 換算 | 凍結見立てとの判定 |
|---|---|---|
| 5 かなり余った | high | 見立て high → match / medium → match（±1 内）/ low・depleted → **under** |
| 4 少し余った | high〜medium | 見立て high・medium → match / low・depleted → under |
| 3 ちょうど | medium | 見立て medium → match / high・low → match（±1 内）/ depleted → under |
| 2 足りなかった | low | 見立て low → match / medium → match（±1 内）/ high → **over** / depleted → under |
| 1 まったく足りなかった | depleted | 見立て depleted → match / low → match（±1 内）/ medium・high → **over** |

（unknown は採点対象外として記録のみ。recoveryNeed は dayFelt 1-2 → actual "high"、3 → "medium"、4-5 → "low" として同規約で判定）

禁止リスト（採点不能のため正本化・表示禁止): 連続値スコア全般、collapseRisk 数値、軸由来の「性格だから」帰属、本人が入力していない感情状態の断定。

---

## 5. Night Check v0（質問 b-3 への回答）

### 5.1 配信と頻度

- **push しない**（N-3 確定決定）。`DeliveryMode = "on_open"` の意味論（receptivity-gate.ts:25,194 — 開いた時だけ用意されている）に従い、**Alter タブを夜（timeBucket ∈ evening / night / late_night = 17:00-05:00）に開いた時にカードが居る**形。late_night を含めるのは夜勤者対応（本設計が中核信号とする shift.isNightShift の生活時間帯で当日回答を可能にする。MED-7 対応）。
- 未回答のまま翌朝開いた場合は「昨日の答え合わせ」として 1 回だけ繰り越し（Day Reconstruction 研究: 昨日までの想起は許容）。それも逃したら消す（追わない）。
- 頻度上限 1 日 1 回（EMA 研究: 1 日 1 回 ≈ 91% 遵守、複数回で 77%）。

### 5.2 質問・選択肢・書き込み先（確定案）

**主問（必須・5 段アンカー付き）**

> 「今日は、最後まで余力がありましたか？」

| チップ | nightCheck 保存値 | estimatesFrozen への採点（§4.3 の規約・対応表に従う） | carryOverOut |
|---|---|---|---|
| かなり余った | dayFelt: 5 | 見立てが low/depleted なら **under 判定**（実際より低く見ていた）→ 翌日の同条件 prior を上げる | recoveryDebt: "none" |
| 少し余った | dayFelt: 4 | §4.3 対応表 | "none" |
| ちょうど | dayFelt: 3 | §4.3 対応表（match なら confidence 強化） | "none" |
| 足りなかった | dayFelt: 2 | §4.3 対応表に従う（energyLevel: 凍結 high のみ **over** → prior 下げ。recoveryNeed: actual=high → 凍結 low/medium なら **under** → prior 上げ） | "some" |
| まったく足りなかった | dayFelt: 1 | §4.3 対応表に従う（actual = "depleted" 換算。energyLevel: 凍結 medium・high → **over** / low・depleted → match） | "high" |

**followup（条件付き・anchor が 1 件以上あった日のみ・スキップ可）**

> 「予定は、見立て通りに運びましたか？」

| チップ | 書き込み |
|---|---|
| だいたい通り | nightCheck.planVerdict: "as_seen"。drift 記録は書かない |
| 一部ずれた | 予定リスト（その日の anchors）を 1 タップ選択 → 選んだ予定ごとに driftSelections へ記録（driftType を skipped/delayed/time_changed から 1 タップ選択）。Stage 1 では localStorage 内に保持し、**Stage 2 でこれを `plan_drift_events` へ写像**: predicted（凍結レコードと anchor から）+ actual（**completed は driftType から導出**: skipped→false / delayed・time_changed→true。intensityFelt は v0 では書かない）+ evidenceSource: "explicit" + evidenceStrength: "strong"（MED-2/MED-8 対応） |
| 大きくずれた | 同上（複数選択可） |

```ts
type NightCheckResultV0 = {
  answeredAt: string;
  answeredFor: string;            // 対象日（繰り越し回答の区別）
  dayFelt: 1 | 2 | 3 | 4 | 5;
  planVerdict?: "as_seen" | "partial_drift" | "major_drift";
  driftSelections?: Array<{ anchorId: string;
                            driftType: "skipped" | "delayed" | "time_changed" }>; // MED-2 対応
  // v0.1 の採点対象は 3 フィールド（§4.3。型でも制限する）
  verdicts: Partial<Record<"energyLevel" | "recoveryNeed" | "dayFeasibility", "match" | "over" | "under">>;
};
```

設計根拠: 単一項目はアンカー付きなら妥当（ROF 尺度系）、5 段が欠損最少・負担最小、当日限定の具体アンカーが想起バイアスを抑える。タップ数は通常 1、drift があっても 3 以内。**自由テキストなし**（raw text 禁止の既存規律と一致）。UI は既存 `AlterFollowup`（3 タップ followup の前例）の構造を踏襲。

### 5.3 学習への戻し方（v0 の範囲）

v0 は「記録 + 翌日の 1 段補正」まで: §4.3 の規約に従い、**over（高く見すぎ）→ 翌日の同条件（shift 種別 × density 帯）の prior を 1 段下げ / under（低く見すぎ）→ 1 段上げ**、match → confidence +0.1（上限あり）。`gradeNightCheck()` の fixture テストに**方向検証ケースを必須**とする（HIGH-1 の再発防止）。**weightCalibration 風の本格較正・反復パターン検出（Wave 4）は v0 外**（手を広げない）。

---

## 6. Write Path 段階設計（質問 b-4 への回答）

### 6.1 確定事実（土台精査より）

- `plan_drift_events`: 14 列。RLS は SELECT/INSERT/DELETE のみ、**UPDATE policy は意図的不在（append-only）**。retention なし。INSERT 元コードは現存ゼロ。
- 書き込み前例: `upsertPlanHistory`（fail-soft try/catch、PK (user_id, plan_date)、isPlanWorthSaving ガード、hashUserId ログ）。
- localStorage 前例: versioned key（`_vN`）+ `safeSetItem`（quota 自動回復）+ 30 日 stale purge + removeOldVersionKeys。
- dogfood flag 規律: **const boolean・env 不使用**（CEO 2026-05-24 規律。lib/plan/list/featureFlags.ts 形式）。

### 6.2 4 段階（各段に CEO gate）

| Stage | 内容 | 保存先 | gate | rollback |
|---|---|---|---|---|
| **0: pure** | 型 + `buildDayStateRecord()` + `gradeNightCheck()` 純関数 + fixture テスト。UI/保存なし | なし | 本設計の承認のみ（A-4-b harness と同じ構え） | revert のみ |
| **1: local dogfood** | Alter タブ（§7）から localStorage に書く。key: `plan_day_state_v0` / `plan_night_check_v0`（versioned 規約準拠、safeSetItem 使用）。**新規 Supabase クエリゼロ**: facts の入力（anchors / dayIndicators / shift）は PlanClient が既に fetch 済みの props を再利用するだけ（stop gate「DB・Supabase read」に新規抵触しない。LOW-6 対応） | localStorage のみ | **「新規データ保存」+「UI 追加」stop gate → CEO GO 必要**。const flag `DAY_STATE_DOGFOOD_ENABLED=false` 既定 | flag を false（データはローカルで無害。30 日 purge で自然消滅） |
| **2: DB** | (a) migration 1 本: `day_state_records`（PK (user_id, date)、record JSONB、CHECK date 整合、RLS 4 policy auth.uid()=user_id、updated_at trigger — 全て alter_morning_plan_history の写し）。書込トリガーは 3 つ: ①初回凍結時 ②補正タップ時 ③Night Check 回答時（per-day 1 行への upsert・fail-soft。LOW-7 対応）。(b) `plan_drift_events` への初 INSERT: Night Check の driftSelections を**夜 1 回・predicted と actual を同時に埋めた行として INSERT**（UPDATE 不要 = append-only 完全準拠）。(c) **Stage 1 の localStorage データは backfill しない**（基準線は Stage 2 で再取得。Stage 1 データは設計検証専用とし、30 日 purge で消えてよい。MED-3 対応） | Supabase | **DB migration = CEO 承認事項（Operating Rules 1）**。書き込みは fail-soft・自分の行のみ | テーブルは残置（破壊的変更なし）。書き込み flag off |
| **3: cross-day read** | 翌朝に前日 record の carryOverOut を読む（energy prior へ）。**繰り越し Night Check（昨日分を朝に回答）後の前日 carryOverOut 再導出と当日レコードへの反映規則は Stage 3 設計時に定義**（LOW-2。v0 では「当日レコードは再導出しない」を暫定とする） | 読取のみ | **Phase B readiness gate（B1: 観測 ≥14 日等）に従属**。先回り通知は B2/R6 で別 GO | 読取コードの flag off |

注意点 2 つ: (i) Stage 1 で DayStateRecord と Night Check は**同時に**入れる（採点なしの見立て蓄積は §4 の規律違反になる）。(ii) drift の actual 記入は「朝 predicted 行を書いて夜 UPDATE」では**なく**「夜にまとめて 1 行」— append-only を崩さず、実装も最小。

### 6.3 実装対象ファイル候補（Stage 0-1）

- 新規（Session A・Stage 0: 純関数 4 本 + 型 1 = 5 ファイル）: `lib/plan/dayState/dayStateTypes.ts` / `buildDayStateRecord.ts` / `gradeNightCheck.ts` / `deriveMomentState.ts` / `buildAlterBatteryViewModel.ts`（全て pure）+ `lib/plan/dayState/__tests__/*`（fixture）
- 新規: `app/(culcept)/plan/tabs/AlterTab.tsx` + `app/(culcept)/plan/components/alter/`（メーター・NightCheck カード）
- 変更: `app/(culcept)/plan/PlanClient.tsx`（TABS 配列 L149-156 + type PlanTab L144 + 分岐 L974-1009 + import — 月ビュー C3 と同パターン、変更面積 4-5 ファイル）
- 変更: `lib/plan/featureFlags.ts`（const flag 追加）
- Stage 2 のみ: `supabase/migrations/2026XXXX_day_state_records.sql`

### 6.4 触ってはいけないもの（不接触リスト）

- 進行中 dogfood の表面（FlowTab/CalendarTab の A0-A4 表示、reason 行、What-if）— 観測汚染防止
- `plan_drift_events` への UPDATE / 既存 RLS の変更
- `REALITY_ALTER_BRIDGE_LIVE` の enable（禁止リスト継続）/ morningPipeline / Home AskHero / push・notification 経路（R6 stop gate）/ production env 全般
- `alter_morning_plan_history` のスキーマ（読むだけ）

---

## 7. Alter タブ vs Dock — 再評価（質問 b-5 への回答）

### 7.1 結論: **Dock 推奨を撤回し、専用タブを採用する**

前回（assessment §6）は「タブを増やさない / List に Dock」を推奨した。土台精査で得た新事実により再評価した結果、**CEO のタブ案が正しい**:

1. **現状は 3 タブ**（calendar「カレンダー」/ flow「リスト」/ map「マップ」— PlanClient.tsx L144-156）。前回私は 4 タブ（Flow と List が別）と誤認していた。4 つ目の追加は MAIN_NAV（5 項目）より少なく、モバイルでも破綻しない。
2. **情報量**: CEO 構想（現在状態 + 人体メーター + チャット + 調整案 + Night Check）はボトムシートに収まらない。無理に収めると CEO が最初に懸念した「文字が小さくなる」が起きる。
3. **N-3 適合性はタブの方が高い**: タブは構造的に「user が開いた時だけ」(タップ＝明示的 opt-in)。Dock の常駐一言は、List を開くたび受動的に目に入る = ambient nudge に近く、N-3 監査では一行ごとに審査対象になる。
4. **進行中 dogfood の非汚染**: A0-A4 の 7 日/14 日判断は List/Calendar 表面の「うるささ・沈黙」を観測中。そこへ Dock を足すと観測が汚れる。タブなら共有表面の変化は **tab bar のピル 1 個のみ**（正確には: ピルは他タブを開くたび視界に入る ambient 要素なので N-3 監査対象に含め、A0-A4 の 7 日判断後に ON する。MED-6 対応）。タブの中身は既存表面のコードに触れない。
5. A.10「チャット中心にしない」とは両立する: タブの主役は「人体バッテリー + 今日の読み」（上段）。**v0.1 改訂（CEO 構想・GPT 指摘 2 対応）: ミニ Composer（「Alterに話しかける…」入力バー）を v0 に含める**。これは新規チャット実装ではなく**既存 Alter route への入口**: POST body は既存型の `source?: string` でそのまま受領可能なため新 API 不要（"plan" 固有の route 分岐は追加しない。payload = `{ message, sessionId, source: "plan", mode: "warm" }`、`hooks/useAlterChat.ts` の軽量パターンを踏襲、セッションは `PLAN_ALTER_SESSION_KEY`（新設定数。Stage 1 で定義）で独立管理）。表示は直近 1-2 往復のみのコンパクト表示で、チャットを画面の主役にしない。会話内容→DayStateRecord への構造抽出は後段（Stage 1.5 以降）。「Alter が住んでいる感」と状態の自然吸収の両方をこれで担保する。

### 7.2 タブ構成 v0（上から）

```
[Alter タブ]（ラベル案: "ALTER"。N-3 契約語彙「ALTER で見る」と同系）
1. Alter ヘッダー（"Alter" + 状態 1 行見立て + 根拠語）   ← estimates.dailyMode + evidence（断定なし・観測トーン）
2. 人体バッテリー（§9: 脳/心臓/体の 3 系統水位 + 各コールアウト）← AlterBatteryViewModel
3. 周辺カード（Reality Context Cards）: 外出耐性 / 夜の余白 / 睡眠 /
   昨日の負荷 / 回復の質 / 明日への持ち越し / 今日の成立見込み      ← facts + estimates（各カードの v0 充足は visual-contract §4 の通り）
4. 今日の流れ（事実ベースの密度タイムライン。予測曲線は不採用）     ← DayGraph 既存値（TimelineSpine 転用）
5. Night Check カード（夜のみ／繰越時は朝）
6. 入力チップ列: 「元気 / 少し疲れた / 眠い / 集中したい / 外出は軽め」 ← §3 userInputs へ（チップ→フィールド対応は visual-contract §3.6）
7. ミニ Composer（「Alterに話しかける…」→ 既存 route source:"plan"）+ 直近 1-2 往復表示
8. CTA 2 つ: 「今日を組む」（compose）/ 「調整案を見る」（A3 接続までモック導線）
```

調整案の中身（守る/楽/攻める級の分岐提示）は v0 で**生成しない** — それは A3 soft connection（案 A/B/C、CEO 判断待ち）の領分であり、二重化させない。タブには A3 の結果が将来流れ込む受け口（CTA とスロット）だけ確保する。UI の詳細仕様・コンポーネント分解・アートディレクションは `docs/alter-tab-visual-contract.md` に分冊（本書は構造とデータ契約のみ）。

### 7.3 リスクと手当て

| リスク | 手当て |
|---|---|
| 来訪頻度が低く据え物化 | empty-day 入口「ALTER で見る ›」（既存 EmptyDayEntry）と Home AskHero からのリンクをタブへ deep-link（将来）。v0 は計測のみ（開封日数/7 日） |
| AI ページ化（GPT の警告した「AIアシスタント感」） | チャットを最下段・補助に固定。上段は常に状態と予定 |
| Home AskHero との役割重複 | Home = 入口・世界観・汎用判断、タブ = 今日の運用。重複機能（汎用チャット）はタブに置かない |
| dogfood への影響 | タブ自体を const flag 既定 OFF。ON でも他タブのコード不変 |

段階導入: タブ（dogfood）→ 開封・補正・Night Check 回答率を 7-14 日観測 → 価値が出た要素だけ List へ昇格検討（Dock はその時の選択肢として保留）。

---

## 8. Stargazer 軸 → /plan 接続 v0（質問 b-6 への回答）

### 8.1 接続する軸は 3 つ（全て正確な軸 ID。axisRegistry.ts 実在確認済み）

| 軸 ID | 接続先 | 使い方 |
|---|---|---|
| `individual_vs_social`（+ 副次 `stress_isolation_vs_social`） | socialBandwidth の事前分布 / 社交予定の消耗係数 | **既配線の再利用**: deriveJudgmentMode（WIRE_JUDGMENT_MODE=true、personalModelStargazerAdapter.ts:289-305）の出力（集中型/分散型/関係エネルギー型/中庸型）をそのまま読む。新配線ゼロ |
| `plan_vs_spontaneous` | 崩れ感度: 計画型 → drift 時の recoveryNeed を 1 段上げ / 自発型 → 余白を機会として扱う | 見立て導出の係数のみ |
| `emotional_regulation` | confidence 抑制: 低 regulation × 高負荷日 → 見立ての confidence を下げ、表現を hedged に固定 | 表示トーンの制御のみ |

### 8.2 接続の規律（既存慣行をそのまま採用）

- **confidence 閾値**: < 0.2 不使用 / 0.2-0.5 hedged で半係数 / ≥ 0.5 通常係数（bodyLens.ts:145-149 の既存 3 段を踏襲）。拡張軸は CAP 0.45 のため事実上 hedged 止まり。
- **directlyObservedAxes 優先**（profile/route.ts:358-385 のルールに従い、推論軸で直接観測軸を上書きしない）。
- **PRG 原則**: belief を読み取り専用で使い、決定時の modifier に限定。DayStateRecord 側から belief への書き戻し禁止。
- **PhaseFramingHint 連動**（hdmPhaseGate.ts）: Phase < 2 = no_personal_framing → 軸係数は内部計算のみで、表示文には人格の気配を出さない。
- **WIRE flag**: 新規係数は `WIRE_DAY_STATE_PRIORS = false` 既定。**Stage D として追加**（Stage C は WIRE_RECENT_RHYTHM に既割当 — personalModelStargazerAdapter.ts:25,65。LOW-3 対応）。

### 8.3 表示ルール（過剰人格推定の防止）

- 軸名・性格を原因として表示することを**全面禁止**（「あなたは内向的だから」「性格的に」は NG）。
- 根拠チップに出してよいのは**観測可能な事実のみ**: 「人と会う予定が 3 日続いています」「移動の多い週です」。
- 軸の影響は evidence タグ `axis_prior_used` として内部記録し、Night Check の採点で係数の有効性を検証する（外れ続ける軸係数は自動で半減）。

---

## 9. 人体バッテリー安全設計（質問 b-7 への回答。v0.1 で 4 部位 → 3 系統に転換）

### 9.1 中心思想（CEO 確定構想）

**人の体 = ユーザーのバッテリー本体**。その内部を 3 系統の残量が液体・光のように巡る:

| 系統 | 位置 | フィールド | 意味 | 色系 |
|---|---|---|---|---|
| 脳バッテリー | 頭部 | focusReserve | 集中・思考余力・判断の余白 | パープル〜青紫 |
| 心臓バッテリー | 胸・心臓 | emotionalReserve | 心の余力・気持ちの余白 | ピンク〜ローズ |
| 体バッテリー | 胴体〜全身 | energyLevel | 体力・身体の稼働余力 | ブルー〜ミント |

- **外出耐性は人体の水位ではない** → 周辺カード（outingTolerance）へ移動（v0 初稿の脚メーターを廃止。GPT 指摘 1 と CEO 構想の一致点）。
- **毎朝 100% に戻らない**: 昨日・睡眠・負荷の影響を引き継ぐ（表示は v0 から「昨日の影響を受けています」と示せるが、見立てへの数値的引き継ぎは B1 gate 後 — §6.2 Stage 3）。
- 「今日の開始残量」というラベルは**不採用**（CEO 確定）。タイトル候補: 「あなたのバッテリー」/「いまの余力」。
- 製品語彙との接続: origin の `bodyEcho`（chest: tight/open/normal 等）が既にある身体観の語彙であり、心臓バッテリーの本人入力源でもある。外来 Fitness UI ではなく Aneurasync 固有の身体観として描く。

### 9.2 不変条件（HARD）

1. **数値非表示**: %・点数・0-100 をどの画面にも出さない（A3 不変条件と同線）。**水位（visualFill）は内部数値由来の連続値 0-1 でよい**（5 段量子化を固定仕様にしない — CEO 確定。液体が巡る有機的表現は精密計測の顔にならない）。テキストは帯語（ほとんど残っていません/少なめ/ふつう/余裕あり/読めていません — very_low 帯にも N-3 適合語を定義済み）のみ。詳細ビューでも帯語+confidence 語+根拠まで（数値解禁は採点履歴が成熟してからの CEO 判断 — GPT 指摘 1 の将来余地として記録）。
2. **「見立て」バッジ常設**（N-3 契約語彙。「推定」より製品語彙に合致）。
3. **根拠チップ 2-3 個**を各系統に併記（寄与因子表示は信頼を上げる — 外部研究確認済み）。事実語のみ・帯語優先: 「夜勤明け」「予定が密」「移動が多め」「雨」（推定所要分数を数値で出さない。§4.2 の精密化ルールに従う）。
4. **ワンタップ補正**: 系統タップ → 「もっと低い / 合ってる / もっと高い」 → 即時に水位更新 + source を本人（user_confirmed, confidence 0.9）へ。補正は採点補助として蓄積（§4.3）。direction は格納値空間で記録（§3.2）。
5. **unknown の正直表示**: 読めない系統は薄い輪郭 + 「まだ読めていません」。埋めるための偽推定をしない。
6. **禁止語**: おすすめ/最適/推奨/改善/警告/危険/注意/リスク（N-3）+ 診断調（疲労度・ストレス値）+ 医療/健康スコア風表現。使う語は「見立て」「観測」「余力」「余白」。
7. **不安増幅の防止**: トレンドグラフ・streak・他者比較・通知・赤色警告は v0 に置かない。表示は開いた時のみ更新（live tick なし。ヘッダーの「ライブ」表記を使う場合は「開いた瞬間に最新導出」の意味に限定し、常時監視を示唆しない）。

### 9.3 ラベルと方向（全系統「余力」方向で自然に統一）

3 系統は全て「余力」概念（focusReserve / emotionalReserve / energyLevel）なので、v0 初稿で問題だった方向反転（回復必要度）は**構造的に解消**された。recoveryNeed は内部保持と周辺カード（「回復の質」「明日への持ち越し」の材料）に残る（GPT 指摘 5: 概念は消さない。詳細ビューで「回復が必要そうです」という表現余地も残す）。

ラベル確定案: 脳 = 「集中の余力」/ 心臓 = 「心の余力」/ 体 = 「からだの余力」（代替: あたまの余白 / こころの余白 / 体力の残量）。

表示コピー例（規律準拠の見本）:
- ✅ 「からだの余力は少なめに見ています。根拠: 夜勤明け・移動が多め」
- ✅ 「心の余力は少し余裕がありそうです。根拠: 夜の余白あり・人と会う予定少なめ」
- ✅ 「まだ読めていません。今日の様子から学びます」
- ❌ 「体力 61%」「疲労に注意」「回復を推奨」「今日の開始残量」

ビジュアル詳細（シルエット・液体表現・レイアウト・コンポーネント分解・画像生成プロンプト）は `docs/alter-tab-visual-contract.md` を正本とする。

---

## 10. 進め方 — docs 構成・検証・判断（質問 b-8 への回答）

### 10.1 docs 構成

本書が論理側 mini-design の統合版。**v0.1 で以下の分冊を確定**（セッション分離 = GPT 提案を採用）:

1. **本書**（`docs/day-state-alter-tab-v0-design.md`）= 論理契約の正本（Data Contract / 採点規律 / Night Check / write path / 軸接続 / Reality Graph）
2. **`docs/alter-tab-visual-contract.md`** = UI 視覚契約の正本（人体バッテリー / 周辺カード / ViewModel / コンポーネントマップ / アートディレクション / 画像生成 seed / 参照画像監査）
3. **`docs/handoff-session-a-logic.md`** = Session A（Reality Logic / State Engine）への引き継ぎ書 — pure 関数 4 本 + fixture のみ
4. **`docs/handoff-session-b-ui.md`** = Session B（Alter Tab UI / Layout）への引き継ぎ書 — mock ViewModel 読み取りのみ・ロジック再定義禁止

セッション分担の規律: 本セッション = 契約凍結のみ（実装しない）。Session A は型と純関数（UI/CSS/保存なし）、Session B は AlterTabBody 配下のみ（PlanClient のタブ配線・ロジック定義・保存に触れない）。両者は本書と visual-contract を読み取り専用の契約として扱い、**契約変更が必要になったら実装せず本セッション系（契約管理）に差し戻す**。

### 10.2 最小 dogfood 検証（Stage 1、7-14 日）

| 観測項目 | 合格線（仮） |
|---|---|
| Night Check 回答率 | ≥ 5/7 日（1 日 1 回・タップ ≤3 の負担設計が機能しているか） |
| 見立て match 率（energyLevel・recoveryNeed） | ベースライン取得が目的。数値目標なし（v0 は採点の成立自体が成果）。**集計は estimatesFrozen のうち source ∈ {inferred, derived} のみ**（本人申告の追認を精度に数えない。HIGH-2 対応の層別） |
| メーター補正タップ | 補正が発生すること（= 補正 UI が見つかる・押せる）。補正後の納得感を口頭確認 |
| タブ開封 | ≥ 4/7 日。0-1 日なら配置・導線を再設計 |
| 既存 dogfood への影響 | A0-A4 の観測ログに変化がないこと（不接触の確認） |
| 28 日目チェック | 介入価値の減衰確認（HeartSteps 減衰タイムライン)を 30 日判断に組込み |

### 10.3 各質問の完了状態

| 質問 | 状態 |
|---|---|
| a / c | 設計回答**完了**（§1, §2） |
| b-1, b-2, b-3, b-5, b-6, b-7, b-8 | 設計**完了**（実装は未着手） |
| b-4 | 設計**完了**。ただし Stage 2 の migration 文面と Stage 3 の cross-day 詳細は**一部**（B1 gate の充足状況に依存するため Stage 1 の結果を見て確定） |
| 既知の未確定 | A4 Place Affinity / MobilityObservation の所在（branch/worktree 差分の可能性 — 実装着手時に要確認）。focusReserve の導出精度（v0 は弱い前提で unknown 許容） |

### 10.4 CEO 判断事項（v0.1 更新版）

1. **本設計 v0.1 + visual contract + handoff 2 通の承認**（3 系統バッテリー / estimates 再構成（新設 enum 4: recoveryNeed・emotionalReserve・outingTolerance・dayFeasibility）/ ミニ Composer 復帰 / 採点 3 系統化を含む）
2. **Session A 起動 GO**（Stage 0: pure 関数 4 本 + fixture。保存・UI なし。stop gate 非抵触 — GPT 監査も GO）
3. **Session B 起動 GO**（mock ViewModel での AlterTabBody 試作。PlanClient 配線なし・保存なし）
4. **Stage 1（タブ配線 + localStorage dogfood）GO** — 「UI 追加」「新規データ保存」stop gate の解錠。A0-A4 の 7 日判断（6/16 頃）後の着手（GPT 監査の条件付き GO と同条件）
5. Stage 2（DB migration / Supabase write）は **まだ NO**（GPT 監査と一致）。Stage 1 の Night Check 回答率・補正率・開封率を見て別途

---

## 11. 出典（土台精査の主要 file:line）

- タブ: `app/(culcept)/plan/PlanClient.tsx:144-156,223,817-840,974-1009` / `app/(culcept)/plan/page.tsx:34-68`
- N-3 入口: `lib/plan/emptyDayObservation.ts:76`（「ALTER で見る ›」）/ `app/(culcept)/plan/components/list/EmptyDayEntry.tsx`
- 語彙: `docs/decision-log.md:13583-13588`（N-3 禁止/許可語彙。LOW-1 で行番号訂正済み）/ `docs/a3-soft-connection-mini-design.md:31`（数字/%/score/確率なし・最適案/断定なし・沈黙原則）
- 状態部品: `lib/stargazer/alterHomeAdapter.ts:6904-6911,8048-8058,8322-8387` / `lib/stargazer/stateWeighting.ts:17-21` / `lib/origin/dailyOrbit/types.ts:40-49`（BodyEcho 定義）`:93-104`（DayState）`:276`（DailyOrbitEntry.bodyEcho）
- plan 数値: `lib/plan/dayGraph/dayGraphTypes.ts:56-78` / `dayGraphAttributes.ts:56-59` / `gapNodes.ts:128-157` / `latencyToleranceMap.ts:34,95-105` / `lib/plan/feasibility/dayFeasibilityComputation.ts:104-165` / `lib/plan/transport/transportTypes.ts:254-259`
- 信号: `lib/alter-morning/types.ts:619-632`（DayConditions）/ `supabase/migrations/20260530100000_sr_shift_import_source_type_and_day_indicators.sql` / `lib/coalter/activity/intent.ts:104,150`（ActivityMoodCode）/ `app/(immersive)/my-style/_lib/weatherService.ts:146-232`
- 書込: `supabase/migrations/20260430110100_plan_drift_events.sql`（append-only・RLS）/ `lib/plan/plan-drift-event.ts:41-127`（driftType 7 値・intensityFelt）/ `lib/alter-morning/persistence/planHistory.ts:126-159` / `lib/stargazer/localStorageHelper.ts:13-285` / `lib/plan/list/featureFlags.ts:38-42`（const flag 規律）
- 軸: `lib/stargazer/axisRegistry.ts` / `lib/plan/llm/personalModelStargazerAdapter.ts:289-305` / `lib/plan/llm/hdmPhaseGate.ts` / `lib/stargazer/bayesianAxisUpdater.ts` / `app/api/stargazer/profile/route.ts:358-385`
- 許可機構: `lib/plan/reality/receptivity-gate.ts:25,141-195`（on_open）/ `lib/plan/reality/authority-escalation.ts:13,29-40`
- UI 部品: `components/ui/glassmorphism-design.tsx:143-215,668-700,746-810`（GlassCard/GlassBadge/ProgressRing）/ `components/home/AlterFollowup.tsx`（3 タップ followup 前例）
- 外部研究: 単一項目尺度（ROF, SVS-GM1）/ 5 段階 vs 7 段階 / 1 日 1 回 EMA ≈ 90% / 帯表示と信頼 / 寄与因子表示 / 補正可能推定と信頼較正（URL は土台精査ログ参照）
