# Phase 3 — Predictive Day Orchestration Architecture

> **Status**: docs-only、 設計凍結 v6 (= 2026-05-21)
> **Phase**: Plan Phase 3 (= Phase 2-D〜2-I の上に積む新層)
> **Scope**: 設計のみ。 本 docs commit で 実装 zero、 migration zero、 env 変更 zero、 dependency 追加 zero。
> **次の決定点**: 本 docs commit 後、 Phase 3-J 実装着手は **別 CEO 判断**。

---

## 0. North Star (= 北極星)

### 0.1 中心問い

> 「これは、 user の **第二の自己** として必要か?」

### 0.2 立脚 (= Phase 3 とは何か)

Phase 3 は **予定提案 AI ではない**。 「AI がスケジュールを最適化する」 路線 (= Motion / Reclaim / Sunsama / Cron / Amie / Sortd / Routine / Notion AI) と全面的に立脚を異にする。

Phase 3 = **Past-Self-Reflection OS** + **Predictive Day Orchestration**:

- **Past-Self**: 「過去の自分が現在の自分に話しかける透明な配達人」 として Alter を再定義する。
- **Predictive**: ユーザーが組んだ予定の **足りない部分** (= 出発時刻 / 移動 / 余裕) を、 **本人の過去観測** を根拠に補完する。
- **Day Orchestration**: 1 日を 「予定の点の集合」 ではなく、 **1 本の道 (= 起点 → 予定 → 移動 → 空白 → 終点)** として組み立てる。

### 0.3 既存 Calendar AI との立脚差 (= 設計上の差別化仮説、 継続検証対象)

| 軸 | 既存トップアプリ (= Motion/Reclaim/Sunsama 等) | Aneurasync Phase 3 |
|---|---|---|
| 目的 | 自動 schedule / habit 最適化 | 過去の自分との対話 |
| 提案 source | external (= task list, habit goal, popularity) | internal observation only |
| 失敗開示 | hide | gentle factual reflection |
| 数字表示 | confidence %, score | 永久非可視 (= 内側からの言葉のみ) |
| cold start | 即フル稼働 | Onboarding Quietude (= 7 日 silent) |
| 提案の心理重 | accept / decline binary | accept / rehearsal / dismiss (= 3 択) |
| 沈黙 | UI 消失 | Quiet Status (= user 探索時のみ) |
| AI 主体 | 「AI が提案」 と自己主張 | No-AI-Subject (= 主語完全禁止) |
| 1 日のモデル | 時間 grid / task list | Path Metaphor DayGraph (= 道) |
| 移動 | API 自動 | DayGraph + Departure Correction (= 過去の自分の声) |

これら 「設計上の差別化軸」 は本 docs 時点では仮説。 主要 Calendar / AI Scheduler との比較は **継続検証対象** (= Appendix B 参照)。 マーケ断定 (= 「N 軸全差別化」) は本 docs では行わない。

### 0.4 Phase 3 が解決する 3 つの 「足りなさ」

1. **時間の足りなさ**: ユーザー指定出発時刻が過去乖離より楽観的な場合、 過去観測から補正を **別 layer** で提示する。
2. **場所の足りなさ**: 場所未確定 anchor に対し、 Lived Geography (= Phase 2-G) と Origin Vault (= Idea 23) から **静かに** 場所候補を返す。
3. **空白の足りなさ**: 1 日の空白時間に、 **観測由来** (= 直近 4 週で 3+ 回反復) のパターンが存在する場合のみ subtle に表示する。 cold start や signal 不足では silent。

---

## 1. Scope

### 1.1 5 sub-phase 概要

```
Phase 3 = Predictive Day Orchestration

├── Phase 3-J  Observation Proposal
│              [本 docs commit 後、 J-1a〜J-3 まで CEO 判断で着手]
│
├── Phase 3-K  Predictive Day Graph
│              [docs 全網羅、 実装は別 CEO 判断]
│
├── Phase 3-L  Transportation Adapter Interface (= mock のみ)
│              [docs 全網羅、 実装は別 CEO 判断]
│
├── Phase 3-M  Arrival Risk Memory + Analogical Bridging
│              [docs 全網羅、 実装は別 CEO 判断]
│
└── Phase 3-N  実 Transport API 接続
               [docs 全網羅、 実装は CEO 承認必須]
```

### 1.2 本 docs commit 後の初期実装範囲

**Phase 3-J-1a 〜 J-3 までを 1 段** として、 CEO 判断で着手。 各 commit は ~120-350 LOC、 独立 testable。

J-3 完了後に **7 日 smoke 期間** を設定。 期間後の CEO 判定で:
- J-4 (= accept path) 〜 J-7 (= smoke 完了) の継続着手
- または J-3 で停止して Phase 3-K に直行 vs 一旦凍結

### 1.3 Phase 2 不可侵原則 (= 絶対遵守)

- Phase 2-D 〜 2-I の **全 9 凍結 branch は不変**。 Phase 3 docs branch から merge / cherry-pick / rebase で接触禁止。
- Phase 3 実装は Phase 2 helper / type / UI を **read-only 再利用**。 既存 component を mutate しない。
- Phase 2 で完成した道具:
  - `formatLocationDisplayParts` (= 2-F、 場所表示)
  - `formatCanonicalLocationText` (= 2-D、 場所文字列)
  - `PlaceCandidatesPanel` (= 2-D + 2-H、 Place picker)
  - `classifyPlaceIntent` (= 2-H、 意図分類)
  - `inferLocationCategory` (= 2-H、 category 推論)
  - `detectTimedAnchorOverlaps` (= 2-E、 時刻重なり)
  - `pickCategoryIcon` / `pickBrandIcon` / `pickCategoryColorClass` (= 2-I、 icon system)
  - `computeLivedGeographyFallback` (= 2-G、 生活圏中心)
  - `TransportSegment` (= W3-PR-10、 移動 segment、 既に main 着地済)
  - `GlassCard / GlassBadge / GlassButton / GlassModal` (= base 設計)

これら全て **import のみ**、 Phase 3 で **mutate / 拡張 / 上書き禁止**。

### 1.4 やらないこと (= 概要、 詳細は §9)

Phase 3 全体で:
- 自動スケジュール (= Motion / Reclaim 路線回避)
- 不可逆提案 (= 飛行機 / ホテル / 病院 等の予約)
- LLM 呼出 (= 提案 reason は template)
- 通知 / push (= 提案は in-app のみ)
- DB migration (= localStorage で先行)
- 新 dependency
- AI 主語の使用
- 警告色 / 強制感

---

## 2. Invariants (= 51 項)

絶対に崩さない原則。 違反は build fail (= ESLint / 型 / smoke 検証で機械的に強制可能なものは強制化)。

### 2.1 Core 思想 invariant (= 1-12)

1. **強制しない**: 提案は表示するが action は user 主導。
2. **silent dismiss を尊重**: 無視は観測信号、 retry / 通知 / nag しない。
3. **学習する**: accept / modify / dismiss 全 path が profile を深める。
4. **privacy first**: sensitive anchor は signal source / proposal target 両方除外。
5. **Phase 2 成果再利用**: 新規 helper を増やさず、 既存 (D/E/F/G/H/I) を組合せる。
6. **UI 統一**: 3 tab で同じ `ProposalChip` コンポーネント (= Cross-tab single helper)。
7. **silent fallback**: confidence 低い → 提案出さない (= Phase 2-G 思想継承)。
8. **observed > inferred**: 観測 (= 直近行動) > 推論 (= AI 生成)。
9. **第二の自己**: 提案文言は 「あなたが XX」 「いつもの XX」 (= 内側からの言葉)。
10. **データ汚染禁止**: `ProposedAnchor` は別 entity、 採用までは `ExternalAnchor` を mutate しない。
11. **migration / dependency 増やさない**: localStorage versioned key で先行、 DB 化は Phase 3-N 議論時。
12. **LLM 呼ばない**: 提案 reason は template、 cost / latency / 一貫性のため永久。

### 2.2 表現 invariant (= 13-18)

13. **Half-life decay**: 提案表示で internal confidence × 0.85、 採用で reset。
14. **Cross-day memory**: dismiss log は 7 日 retention、 同 proposal は 7 日経過まで再出さない。
15. **Confidence 非可視化**: user に % / score を見せない。 「いつもの」 「最近の」 「先週の」 で確信度表現。
16. **Anchor source trace**: 採用 proposal は `sourceType="proposal"` で trace 可能。
17. **Internal data disclosure only**: 提案 reason は user 自身のデータからのみ。 外部統計 / cohort 比較 / popularity 永久禁止。
18. **Reflection-triggering copy**: 行動誘導 (= 「すべき」) 禁止、 内省 trigger (= 「最近 XX が空いていますね」) のみ。

### 2.3 Self-Direction invariant (= 19-24)

19. **Self-Direction Triad**: `continue_pattern` / `recover_pattern` / `intentional_break_observed` の 3 軸。 `intentional_break` は提案ではなく観測としてのみ扱う。
20. **Entropy Budget**: 認知負荷 point 制 (= 1 提案 1pt / 修正 2pt / 一括 3pt)、 1 日 max 3pt、 dismiss 履歴で auto-scale。
21. **Self-Evidence Trail**: 内部 evidence record (`{ signalType, observation, timestamp }`)、 UI 非可視。
22. **Minimum Intervention**: 既存補完 > 新規作成。 提案 priority は補完 1-3 → 観測 4 → 新規作成 5 (= 最後)。
23. **Reversibility >= 50**: Phase 3-J 提案は safe 圏のみ (= 飛行機 / ホテル等は永久対象外)。
24. **Self-Contradiction → Observation**: 反復パターンと最近行動の乖離は提案ではなく観測文 (= 「最近 XX が空いていますね」)。

### 2.4 DayGraph invariant (= 25-30)

25. **DayGraph is Projection**: stored second-source 化禁止 (= W3-PR-10 教訓継承)、 computed view。
26. **StartPoint Silence**: 起点不明時 home default ではなく silent (= 1tap confirmation は許可、 §8.1 参照)。
27. **EndPoint Default = Home**: 但し 22:00+ anchor あれば override (= Soft Endpoint Drift)。
28. **Departure Correction is Suggestion**: anchor.startTime は user 設定維持、 補正は別 layer 提示のみ。
29. **Past-Self Voice**: Explainable Plan は過去の自分が話す文体に固定。 「Alter が」 「私が」 主語禁止。
30. **Memory Half-Life + Compression**: 30 日超は pattern 化、 個別 event 削除。

### 2.5 補正 invariant (= 31-36)

31. **Gentle Reflection**: 責める copy 禁止、 user 主体 reflection (= 「前回 余裕が少し足りませんでした」 / NG: 「先週この提案を断った時遅刻しました」)。
32. **Minimal Memory + User Export/Delete**: localStorage、 sensitive 除外、 Settings から user 即座に消せる export / delete API 必須。
33. **One-tap Origin Clarification with Skip**: 必要時のみ minimum confirmation、 「指定しない」 必須。
34. **No-AI-Subject Copy**: AI 主語禁止 (= 「Alter は」 「私は」 「I suggest」)、 user 主語 or 無人称、 Past-Self Voice。
35. **Origin Vault Persistence**: 一度選んだ起点を context 別に学習、 質問反復禁止。
36. **Onboarding Quietude**: 初期 7 日 silent、 8-30 日 max 1/週、 30+ 日通常。

### 2.6 Contract invariant (= 37-40)

37. **Proposal Integrity Contract**: 5 性質 (= `neverMutatesAnchor` / `userActionRequired` / `canBeIgnoredWithoutPenalty` / `sourceEvidenceRequired` / `sensitiveExcluded`)。 型 + compliance test で機械的強制。
38. **Test Override Affordance**: `TestOverrideContext` は test/smoke harness のみで injection、 production code path で import 禁止 (= ESLint rule で build-time enforcement)。
39. **No Penalty for Ignore**: dismiss 履歴を UI で nag に変換禁止、 sentiment 変化禁止 (= 「あなたは X 回 dismiss しました」 系永久禁止)。
40. **Theory-of-Mind Pause**: 24h dismiss 3+ で 24h proposal pause、 user signal 観測で auto 抑制。

### 2.7 視覚言語 invariant (= 41-46)

41. **DayGraph as Complementary Layer**: 既存 Calendar / Flow / Map を mutate せず alongside / overlay 配置。 grid 自体は維持。
42. **Memory Chip Style**: 提案 UI は memory metaphor (= dashed border, italic, slate-500)、 通知 / banner / alert / drop-shadow metaphor 永久禁止。
43. **Verb Glyph Subtlety**: anchor 動詞 glyph は 10px micro、 主アイコンより小さく、 警告色禁止。
44. **Ghost Acknowledgement**: dismiss 提案は 30 日 ghost として保持、 但し default 非表示 (= opt-in only)。
45. **Natural Time Bookend**: 日の出 / 日の入りを DayGraph に表示 (= 緯度経度から計算、 外部 API 不要)。
46. **Ambient Time Color**: 時刻で背景 tint、 但し opacity 30-40% の薄さ、 明瞭主張禁止。

### 2.8 a11y + 配置 invariant (= 47-51)

47. **Ghost Anchor Opt-In Only**: default 非表示、 Settings opt-in で表示、 sentiment 中立。
48. **Accessibility-First Visual**: 全視覚要素は色だけで情報伝達しない、 OS 設定遵守 (= prefers-reduced-motion / high-contrast / dark mode)、 WCAG 2.1 AA 準拠。
49. **DayGraph Layer Integration**: 既存 Calendar / Flow / Map に新規 component として alongside / overlay 配置、 既存 component を mutate しない。
50. **Memory Lens Privacy**: 過去 DayGraph は localStorage only、 30 日超 pattern 化必須、 cross-device 同期禁止。
51. **Anchor Story = Past-Self Voice**: anchor tap overlay の文体は Past-Self Voice 厳守、 警告色禁止。

---

## 3. Commit Stairs (= 全 29 commit)

### 3.1 Phase 3-J (= 11 commit、 J-1a〜J-3 = 7 commit を初期 GO 対象)

#### J-1a: types + ProposalDirection + Integrity Contract type (~120 LOC)

ファイル:
- `lib/plan/proposal/proposalTypes.ts` (= `ProposedAnchor`, `ProposalReason`, `ProposalConfidence`, `ProposalSource`)
- `lib/plan/proposal/proposalDirection.ts` (= `Direction` enum: `continue_pattern` / `recover_pattern` / `intentional_break_observed`)
- `lib/plan/proposal/proposalIntegrityContract.ts` (= `ProposalIntegrityContract` interface + const + `assertProposalCompliance`)

Tests:
- 各 type の shape 検証
- contract compliance 5 性質検証
- 8 unit case

#### J-1b: Self-Evidence + copy rules + No-AI-Subject lint + Evidence Tiered + Linguistic Mirror (~180 LOC)

ファイル:
- `lib/plan/proposal/selfEvidenceRecord.ts`
- `lib/plan/proposal/copy/proposalCopy.ts` (= template table)
- `lib/plan/proposal/copy/evidenceTieredCopy.ts` (= 3 tier: 確信 / 観測 / hedge)
- `lib/plan/proposal/copy/linguisticMirror.ts` (= user token 観測)
- `lib/plan/proposal/copy/noAiSubjectLint.ts` (= ESLint rule definition)

**注**: 実装時に重ければ J-1b-1 / J-1b-2 / J-1b-3 に分割可。 但し分割は実装着手時の CEO 判定。

Tests:
- evidence record 構造検証
- copy template 全文体検査
- AI 主語 grep blocking
- evidence 強度 → 文体分岐
- linguistic mirror token 一致

#### J-1c: Entropy Budget + Onboarding Quietude + Theory-of-Mind Pause + TestOverrideContext (~200 LOC)

ファイル:
- `lib/plan/proposal/entropyBudget.ts`
- `lib/plan/proposal/onboardingQuietude.ts`
- `lib/plan/proposal/userStateInference.ts` (= 24h dismiss counter)
- `lib/plan/proposal/testOverrideContext.ts` (= test/dev only、 production import 禁止)
- `lib/plan/proposal/dismissLog.ts` (= 7 日 retention)

Tests:
- budget pt 制御
- quietude 7/30 日 phase
- user state pause 検出
- override context production import 検出 (= ESLint test)

#### J-1d: Reversibility + Anchor Verb Map + Latency Tolerance (categorization only) + RiskMemoryReader interface (~180 LOC)

ファイル:
- `lib/plan/proposal/reversibilityMap.ts`
- `lib/plan/dayGraph/anchorVerbMap.ts`
- `lib/plan/dayGraph/latencyToleranceMap.ts` (= categorization only、 Departure Correction は M)
- `lib/plan/dayGraph/arrivalRiskMemoryReader.ts` (= interface only、 J では null reader)

Tests:
- reversibility score table
- verb mapping (= keyword → eat/work/rest/move/care/social/unknown)
- latency classification (= strict/tight/flexible/none)
- reader interface compliance (= null reader path)

#### J-1e: Self-Contradiction Detector + Day Mood v0 + Pattern Repetition (~150 LOC)

ファイル:
- `lib/plan/proposal/selfContradictionDetector.ts`
- `lib/plan/dayGraph/dayMood.ts` (= heavy/light/recovery v0、 anchor 統計のみ)
- `lib/plan/proposal/patternRepetition.ts` (= 反復 N+ 回 counter)

Tests:
- contradiction 検出 (= 反復 3+ + 直近 2 回乖離)
- day mood 分類
- 反復 counter (= 4 週 window)

#### J-2: Memory Chip UI + ProposalSheet + No-AI-Subject runtime lint (~350 LOC)

ファイル:
- `app/(culcept)/plan/components/ProposalChip.tsx` (= Memory Chip style、 dashed border + italic + slate-500)
- `app/(culcept)/plan/components/ProposalSheet.tsx` (= 複数 chip の bottom sheet)
- `lib/plan/proposal/copy/noAiSubjectRuntimeCheck.ts` (= runtime detection、 dev mode warning)

Tests:
- chip render with all proposal types
- AI 主語 runtime detection
- sheet stack ordering

#### J-3: dismiss path + 7 日 memory + half-life decay (~200 LOC)

ファイル:
- `lib/plan/proposal/dismissProposal.ts`
- `lib/plan/proposal/halfLifeDecay.ts`
- `lib/plan/proposal/dismissMemoryFilter.ts` (= 7 日 retention)

Tests:
- dismiss → log 追加
- 翌日同 proposal 出ない (= 7 日 silent)
- half-life decay 計算

**★ J-3 完了後、 7 日 smoke 期間 + CEO 判定。 以下は別 GO 判断。**

#### J-4: accept path + Quiet Undo Window (~200 LOC)

- `lib/plan/proposal/acceptProposal.ts` (= `sourceType="proposal"` POST)
- `lib/plan/proposal/quietUndoWindow.ts` (= 5 min subtle undo)
- 既存 `createAnchorSource` 再利用

#### J-5: modify path (~120 LOC)

- ProposalChip → `EditAnchorModal` 起動 (= Phase 2-D Place picker 経由)
- 修正後 accept 経由
- 既存 `EditAnchorModal` props 拡張 (= initialDraft 受領のみ)

#### J-6: tab integration (= Calendar + Map のみ) (~200 LOC)

- `CalendarTab` day cell 下に ProposalChip × max 1 chip / day
- `MapTab` SelectedAnchorCard 内 hint chip
- `FlowTab` 初期 scope 外 (= Phase 3.5 / J-8)

#### J-7: smoke + privacy / Entropy / Reversibility / Triad / Quietude / Contract 検証

- 実機 smoke 全 success scenario
- privacy gate / confidence gate / max/day gate 検証
- Proposal Integrity Contract compliance test

### 3.2 Phase 3-K (= 5 commit、 docs 全網羅、 実装別 CEO 判断)

#### K-1: DayGraph data structure + builder + Path Metaphor SVG renderer + Day Threshold Bookend (~500 LOC)

ファイル:
- `lib/plan/dayGraph/dayGraphTypes.ts` (= §4 全 interface)
- `lib/plan/dayGraph/dayGraphBuilder.ts` (= pure computed projection)
- `lib/plan/dayGraph/sunCalculator.ts` (= NOAA 標準アルゴリズム、 緯度経度 → 日の出 / 日の入り)
- `app/(culcept)/plan/components/DayGraphView.tsx` (= SVG renderer)
- `app/(culcept)/plan/components/DayThresholdBookend.tsx`

Memory Lens past-date support 含む。

#### K-2: Origin Vault + StartPoint/EndPoint resolver + Soft Endpoint Drift + 1tap UI (~400 LOC)

ファイル:
- `lib/plan/dayGraph/originVault.ts` (= context 別永続化)
- `lib/plan/dayGraph/endpointResolver.ts` (= Soft Drift 含む)
- `app/(culcept)/plan/components/OriginClarificationPrompt.tsx` (= 1tap UI、 skip 必須)

#### K-3: Day Mood + Inverse Trend + Buffer Budget + Anchor Verb Glyph rendering (~400 LOC)

ファイル:
- `lib/plan/dayGraph/dayMoodTrend.ts` (= 7 日 trend 観測)
- `lib/plan/dayGraph/bufferBudget.ts` (= daily + weekly accounting)
- `components/ui/icons/verb/*` (= 6 verb glyph SVG)
- DayGraph renderer の glyph 表示拡張

#### K-4: 3 tab DayGraph view + Ambient Day Color + Ghost Anchors opt-in (~400 LOC)

ファイル:
- 既存 `CalendarTab` / `FlowTab` / `MapTab` に DayGraph view 追加 (= 各 tab 配置仕様、 §8.6 参照)
- `lib/plan/dayGraph/ambientDayColor.ts` (= 時刻 tint mapping、 a11y respect)
- `lib/plan/dayGraph/ghostAnchorFilter.ts` (= opt-in flag、 default off)
- Settings に opt-in toggle 追加

#### K-5: Rehearsal Mode (~400 LOC)

ファイル:
- `lib/plan/proposal/rehearsalMode.ts` (= 仮置き / 採用 / 戻す 3 択 state machine)
- DayGraph delta calculator (= 出発時刻 shift / buffer 消費)
- 「仮に置く」 trigger UI

### 3.3 Phase 3-L (= 2 commit、 mock のみ実装)

#### L-1: TransportRouteAdapter interface + MockAdapter (~200 LOC)

```typescript
interface TransportRouteAdapter {
  searchRoute(input: {
    origin: GeoPoint;
    destination: GeoPoint;
    arrivalTime?: string;
    departureTime?: string;
    modes: ReadonlyArray<"walk" | "train" | "bus" | "car" | "flight">;
  }): Promise<Route[]>;
}

class MockTransportAdapter implements TransportRouteAdapter {
  // 固定 route で smoke
}
```

#### L-2: W3-PR-10 TransportSegment bridge + smoke (~150 LOC)

- 既存 `TransportSegment` を DayGraph movement に流用
- 二重実装回避

### 3.4 Phase 3-M (= 7 commit、 docs 全網羅、 実装別 CEO 判断)

#### M-1: ArrivalObservation record + Minimal Memory + Settings Export/Delete (~300 LOC)

```typescript
interface ArrivalObservation {
  routeHash: string;          // not raw address
  deviationMin: number;
  observedAt: string;
  contextTags: string[];      // ["rain", "monday_morning"]
}
```

- localStorage versioned key
- Settings 画面に Export (= JSON) / Delete (= 全消去) ボタン
- 30 日超は pattern 化

#### M-2: Departure Correction + Latency Tolerance × Risk Memory 接続 (~250 LOC)

- Latency Tolerance map と Arrival Risk Memory を join
- 過去乖離 + tolerance → 補正提示
- anchor.startTime は不変、 別 layer 提示

#### M-3: Counter-Factual Bookmark (= gentle reflection、 30 日 retention) (~150 LOC)

- 30 日 retention の dismiss-correlation log
- Past-Self Voice 文体厳守
- 警告色禁止

#### M-4: Memory Compression + Trust Half-Life + Pattern Hierarchy (~300 LOC)

- Lv 0 (個別 event) → Lv 1 (week pattern) → Lv 2 (meta pattern)
- 半減期 weight (= 1 週: 1.0 / 1-4 週: 0.7 / 1-3 ヶ月: 0.4)
- 30 日経過で Lv 0 削除、 Lv 1 のみ保持

#### M-5: Analogical Pattern Bridging + Anchor Story UI (~350 LOC)

- feature vector (= verb + latency + category + tod + dow) で nearest neighbor
- anchor tap で過去 context overlay (= Past-Self Voice)
- LLM 不使用、 cosine similarity

#### M-6: Negotiated Time actual mapping (~150 LOC)

- 散らばり度 (= 標準偏差) → 表現解像度 mapping
- 5+ 回同時刻 ± 3 分: 「9:45 出発」
- ± 5 分: 「9:45 頃」
- ± 10 分: 「9 時半 〜 10 時頃」
- ± 15+ 分: 「10 時前あたり」

#### M-7: smoke + privacy gate

### 3.5 Phase 3-N (= 4 commit、 実 API、 CEO 承認必須)

#### N-1: API 選定 + 規約 / 料金 / privacy review

候補:
- 駅すぱあと WebサービスAPI (= ヴァル研究所)
- NAVITIME API
- Google Directions API
- HERE Maps

審査軸 (= CEO 承認時):
- 商用利用可否
- 利用規約 (= 表示制約、 cache 期間)
- 料金構造 (= per-call / monthly fixed / tier)
- privacy (= 何データが external に送られるか)
- fallback (= API down 時の挙動)
- 精度

#### N-2: API adapter 実装 + rate limit + fallback + kill switch

- 既存 L-1 interface を実 API で実装
- per-user / per-day rate limit
- 失敗時 mock 経由 fallback
- env flag `NEXT_PUBLIC_TRANSPORT_API_ENABLED` で kill switch

#### N-3: canary rollout (= % gating)

- 初期 1% user
- 段階的 5% → 20% → 50% → 100%
- 各段階で smoke

#### N-4: 本番 GO 判定

CEO 承認必須。

---

## 4. DayGraph Data Structure

```typescript
// Phase 3-K で導入する pure computed projection
// stored 化禁止、 recompute on every render (= W3-PR-10 教訓継承)

interface DayGraph {
  /** 対象日 (= "YYYY-MM-DD") */
  date: string;

  /** 起点 (= 前日 endpoint inheritance + vault + 沈黙 fallback) */
  startPoint: DayGraphPoint;

  /** 既存 ExternalAnchor を timeline sort */
  events: DayGraphEvent[];

  /** 既存 W3-PR-10 TransportSegment[] 流用 */
  movements: DayGraphMovement[];

  /** 計算: events 間の空白 */
  gaps: DayGraphGap[];

  /** 終点 (= 22:00+ anchor or home default、 Soft Drift) */
  endPoint: DayGraphPoint;

  /** Arrival Risk Memory からの補正提示 (= Phase 3-M 接続点) */
  riskAdjustments: ArrivalRiskAdjustment[];

  /** J-3 で計算済の proposal 群 */
  proposals: ProposedAnchor[];

  /** Day Mood (= heavy / light / recovery) */
  dayMood: "heavy" | "light" | "recovery";

  /** 7 日 trend (= Idea 20) */
  weeklyDayMoodTrend: "rising_heavy" | "stable" | "recovering" | "neutral";

  /** Endpoint drift reason */
  endpointDriftReason:
    | "no_late_anchor"           // home default
    | "anchor_in_late_evening"   // endpoint = その anchor 場所
    | "next_day_stay_over"       // 翌日 startPoint inheritance
    | null;

  /** Onboarding phase (= Idea 24) */
  onboardingPhase:
    | "quietude_0_7d"
    | "limited_8_30d"
    | "normal_30d_plus";

  /** Buffer Budget */
  bufferBudget: BufferBudget;
}

interface DayGraphPoint {
  kind: "home" | "stay_over" | "current_location" | "previous_endpoint" | "unknown";
  location: LocationDisplayParts;  // Phase 2-F 流用
  confidence: "explicit" | "vault_inferred" | "previous_day_endpoint" | "user_skipped";
  source: "user_chose" | "origin_vault" | "previous_day" | "home_default" | "silent";
}

interface DayGraphEvent {
  anchor: ExternalAnchor;                // Phase 2 から read-only 参照
  isUnconfirmedPlace: boolean;            // Phase 2-D
  overlapsPrior: boolean;                 // Phase 2-E
  proposalAttached: ProposedAnchor | null; // J-3
  verb: "eat" | "work" | "rest" | "move" | "care" | "social" | "unknown"; // Idea 22
  latencyTolerance: "strict" | "tight" | "flexible" | "none";              // Idea 19
}

interface DayGraphMovement {
  segment: TransportSegment;             // W3-PR-10 流用
  expectedDurationMin: number;
  pastDeviationMin: number | null;       // Arrival Risk Memory (Phase 3-M)
  suggestedDepartureTime: string | null; // Past-Self Voice (Phase 3-M)
  explanationCopy: string | null;        // max 25 字、 Past-Self Voice 文体
}

interface DayGraphGap {
  startTime: string;
  endTime: string;
  durationMin: number;
  proposalAttached: ProposedAnchor | null;  // Phase 3.5 / J-8 で発展
}

interface ArrivalRiskAdjustment {
  anchorId: string;
  pastEventCount: number;
  averageDeviationMin: number;
  contextTags: string[];                  // ["rain", "monday_morning"]
  suggestedAction: "depart_earlier" | "depart_same" | "no_action";
  explanationCopy: string;                // Past-Self Voice 文体、 max 25 字
  reversibilityScore: number;             // internal、 UI 非可視
}

interface BufferBudget {
  daily: {
    earnedMin: number;
    spentMin: number;
    remainingMin: number;
  };
  weekly: {
    inheritedMin: number;
    remainingMin: number;
  };
}
```

---

## 5. Proposal Integrity Contract

### 5.1 5 性質

| 性質 | 意味 |
|---|---|
| `neverMutatesAnchor` | 提案は ExternalAnchor を mutate しない、 採用時のみ新規 anchor 作成 |
| `userActionRequired` | user の accept / modify / dismiss 三択 tap なしに confirm されない |
| `canBeIgnoredWithoutPenalty` | dismiss して不利益なし、 dismiss 履歴を UI で nag に変換禁止 |
| `sourceEvidenceRequired` | 提案は user 自身の観測 evidence を必ず保持 |
| `sensitiveExcluded` | sensitive anchor は signal source / proposal target 両方除外 |

### 5.2 型定義

```typescript
// lib/plan/proposal/proposalIntegrityContract.ts

export interface ProposalIntegrityContract {
  readonly neverMutatesAnchor: true;
  readonly userActionRequired: true;
  readonly canBeIgnoredWithoutPenalty: true;
  readonly sourceEvidenceRequired: true;
  readonly sensitiveExcluded: true;
}

export const PROPOSAL_INTEGRITY_CONTRACT: ProposalIntegrityContract = {
  neverMutatesAnchor: true,
  userActionRequired: true,
  canBeIgnoredWithoutPenalty: true,
  sourceEvidenceRequired: true,
  sensitiveExcluded: true,
} as const;
```

### 5.3 Compliance test

J-7 smoke で 全 proposal が contract compliance であることを検証。 違反は build fail。

```typescript
// 例: tests/unit/plan/proposalIntegrityContract.test.ts
describe("ProposalIntegrityContract", () => {
  it("never mutates ExternalAnchor", () => { /* ... */ });
  it("requires user action to confirm", () => { /* ... */ });
  it("dismiss does not generate penalty UI", () => { /* ... */ });
  it("every proposal carries evidence", () => { /* ... */ });
  it("sensitive anchors are excluded from both sides", () => { /* ... */ });
});
```

---

## 6. TestOverrideContext (= dev/test only)

### 6.1 Interface

```typescript
// lib/plan/proposal/testOverrideContext.ts
// production code path で import 禁止 (= ESLint rule で build-time enforcement)

export interface TestOverrideContext {
  forceOnboardingPhase?: "quietude_0_7d" | "limited_8_30d" | "normal_30d_plus";
  forceEntropyBudget?: number;
  forceReversibilityThreshold?: number;
  forceRepetitionThreshold?: number;
  bypassColdStartSilence?: boolean;
  bypassUserStatePause?: boolean;
}
```

### 6.2 Import 制約

```
Allowed:
  - tests/**/*.test.ts
  - tests/smoke/**
  - lib/**/__test__/**

Disallowed:
  - app/**
  - components/**
  - 他 production code

Enforcement:
  - ESLint rule: no-restricted-imports
  - CI で build fail
```

### 6.3 Production 振る舞い

production code path では `TestOverrideContext` を受け取らず、 デフォルト invariant ルール (= Onboarding Quietude / Entropy Budget 等) を厳守。

---

## 7. Visual Language

### 7.1 Path Metaphor DayGraph (= Phase 3-K-1 で実装、 docs では設計のみ)

ASCII プロトタイプ:

```
☀ 5:42 日の出

╶╶╶╶╶╶╶╶╶╶╶╶

○ 起点 (家)
│
│ 9:00-9:30 徒歩 → 電車 → 徒歩
│ ┊ 13 分 buffer
│
▣ 9:30 朝会議 (新宿)  [briefcase glyph]
│
│ 10:30-12:00 gap 90 min
│ ┊
│
▣ 12:00 ランチ (青山)  [spoon glyph]
│
│ 13:00-15:00 gap
│ ↪┄┄ ▢ 提案: カフェ (= Rehearsal Mode 中は dashed)
│
▣ 15:00 打ち合わせ  [briefcase glyph]
│
│ 16:30-19:00 gap
│
● 終点 (家)

╶╶╶╶╶╶╶╶╶╶╶╶

☾ 18:55 日の入り
✦ 22:30 通常就寝時刻 (= sleep pattern 推論、 indigo-300)
```

### 7.2 視覚要素 spec

| 要素 | symbol | spec | a11y label |
|---|---|---|---|
| 道の線 (movement) | `│` | 2px solid slate-300 | `aria-label="移動 X 分"` |
| 空白の線 (gap) | `┊` | 1px dotted slate-200 | `aria-label="空白 X 分"` |
| 仮の分岐 (rehearsal) | `┄┄` | 2px dashed slate-400 | `aria-label="仮の予定"` |
| 起点 | `○` | 1.5px stroke slate-400、 12px diameter | `aria-label="起点 {location}"` |
| 終点 | `●` | filled slate-700、 10px diameter | `aria-label="終点 {location}"` |
| confirmed anchor | `▣` | rounded square、 category color (= Phase 2-I)、 16px | `aria-label="{title}"` |
| proposal anchor | `▢` | rounded square、 dashed 1px slate-300、 16px | `aria-label="提案: {title}"` |
| ghost anchor (= opt-in) | `░` | rounded square、 opacity 0.15、 11px text | `aria-label="過去 dismiss された提案"` |
| verb glyph | (= 10px micro-icon) | outlined 1px slate-500 | (= anchor label に動詞付随) |
| sun bookend | `☀` `☾` | 12px slate-400 | `aria-label="日の出 5:42"` |
| time pulse marker | `✦` | 4px filled pulse slate-600 (= reduced-motion 時 static) | `aria-label="現在時刻 {HH:MM}"` |

色:
- category color は Phase 2-I `categoryColorMap` 継承
- **警告色 (red/orange-500+) 一切使用禁止** (= Invariant 42 強制)
- slate / amber-50 / indigo-50 / orange-50 の faint tint のみ

### 7.3 Memory Chip spec (= Phase 3-J-2 で実装)

```
[Memory Chip] visual spec:

  境界線: dashed 1px slate-300 (= 「まだ実体ではない」)
  背景:   category color × 5% opacity (= ほぼ無色)
  text:   italic slate-500 (= 「思い出されたもの」)
  字 size: 14px (= anchor と同等)
  影:     none (= 通知感回避)
  hover:  border 1px slate-400 (= 「触れたら実体化」)
  tap:    fade-in 200ms → 採用 path or Rehearsal Mode (= K-5 以降)

  禁止事項:
  - 警告色 (red/orange) 禁止
  - 「!」 「new」 「AI」 badge 禁止
  - drop-shadow 禁止
  - pulse animation 禁止 (= 通知感)
  - slide-in animation 禁止 (= banner 感)

  a11y:
  - ARIA: role="button" aria-label="提案: {title}"
  - keyboard: Enter/Space で活性化
  - prefers-reduced-motion: fade scale 無効
  - high-contrast: dashed → solid 1.5px に強化
```

### 7.4 Anchor Verb Glyph spec (= Phase 3-K-3 で実装)

| Verb | Glyph (= 10px outlined) | a11y label |
|---|---|---|
| eat | spoon-fork (= 横並び 2 本) | `動詞: 食事` |
| work | briefcase (= 矩形 + 取っ手) | `動詞: 仕事` |
| rest | crescent moon (= 三日月) | `動詞: 休息` |
| move | footstep (= 足型 2 つ) | `動詞: 移動` |
| care | heart outline (= 心臓型、 slate-500、 警告色禁止) | `動詞: ケア` |
| social | conversation bubble | `動詞: 社交` |
| unknown | (= 無表示) | (= 無し) |

配置: anchor node 右上、 4px margin。

### 7.5 Day Threshold Bookend spec (= Phase 3-K-1 で実装)

- 緯度経度から NOAA 標準アルゴリズムで計算 (= 外部 API 不要)
- 既存 home location 利用
- 全 icon 12px、 slate-400
- 通常就寝時刻は 22:00 以降 location anchor pattern から推論

### 7.6 Ambient Day Color spec (= Phase 3-K-4 で実装)

| 時間帯 | Tint | Tailwind class |
|---|---|---|
| 5:00-9:00 | warm faint | bg-amber-50/30 |
| 9:00-12:00 | bright neutral | bg-white |
| 12:00-15:00 | neutral | bg-white |
| 15:00-18:00 | cool faint | bg-slate-50/30 |
| 18:00-22:00 | warm dim | bg-orange-50/40 |
| 22:00-5:00 | deep faint | bg-indigo-50/30 |

a11y 必須:
- `prefers-reduced-motion: reduce` → tint 無効化
- `prefers-contrast: more` → tint opacity → 0
- dark mode → 別 palette (= slate-900 base + 各時刻の subtle tint)

### 7.7 Ghost Anchor spec (= Phase 3-K-4 で実装、 opt-in only)

- default 非表示
- Settings opt-in toggle で表示開始
- opacity 0.15、 11px text
- hover で opacity 0.4 + Past-Self Voice tooltip
- 30 日 retention、 30 日経過で完全消失
- 警告色禁止、 sentiment 中立
- a11y: `aria-label="過去 dismiss された提案 (3 日前)"`

### 7.8 Memory Lens spec (= Phase 3-K-1 で実装)

- 過去日 cell tap → bottom sheet で過去 DayGraph
- 30 日以内: 完全表示
- 30 日超: pattern level summary (= Memory Compression)
- 90 日超: cell に subtle 「思い出されない日」 marker
- localStorage only、 cross-device 同期禁止
- Settings で 「過去 DayGraph 表示」 全体 OFF 可能

### 7.9 Anchor Story spec (= Phase 3-M-5 で実装)

- DayGraph 内の anchor tap で bottom-anchored tooltip
- 過去 sample 3 件まで
- sample 0 → silent
- Past-Self Voice 文体厳守
- 警告色禁止

例:
```
[anchor: 朝会議 9:30 新宿] tap

┌──────────────────────────────────────┐
│ 似た過去の anchor:                       │
│ 前回 朝の会議で 8 分早めに出ました         │
│ 3 月の月曜朝、 似た場所で同じ流れ         │
└──────────────────────────────────────┘
```

### 7.10 a11y 横断要件 (= 全視覚要素適用)

| 軸 | 要件 |
|---|---|
| 色 | 唯一の情報手段にしない (= 形 / 位置 / label 併用) |
| reduced-motion | 全 animation を opacity 切替のみに退化 |
| high-contrast | border 強化 / opacity 透明度低下 |
| dark mode | 全要素に dark palette 提供 |
| screen reader | ARIA label 必須、 path 構造を text 化 |
| keyboard | tab / arrow で全要素 navigable |
| WCAG | 2.1 AA contrast ratio (= 4.5:1 normal / 3:1 large) |

### 7.11 Animation timing

| 動作 | timing |
|---|---|
| proposal fade-in | 200ms opacity 0→1 + scale 0.97→1.0 |
| accept transition | 300ms morph (Memory Chip → confirmed anchor) |
| rehearsal delta | 400ms re-render with annotation |
| ghost fade-in | 5000ms (= 30 日かけて opacity 0.15→0) |
| pulse marker | 2s breathe (= reduced-motion で static) |

---

## 8. UX Flows

### 8.1 1tap Origin Clarification flow (= Phase 3-K-2)

```
Trigger 条件 (= 全 AND):
1. user が Plan tab を開いた
2. 当日 anchor 1+ 存在
3. startPoint が Origin Vault でも前日 endpoint でも解けない
4. user が 当日 まだ skip していない (= per-day 1 回 only)

UI:
┌─────────────────────────────────────────┐
│ 今日はどこから?                           │
│                                         │
│ [自宅] [現在地] [前回の終点] [指定しない] │
└─────────────────────────────────────────┘

- subtle background、 警告色なし
- 「指定しない」 → DayGraph 起点なしで描画
- 選択後 → Origin Vault に context 別保存
- 同 context 次回 silent
```

### 8.2 Rehearsal Mode 3 択 flow (= Phase 3-K-5)

```
Proposal Chip Tap
  ↓
┌─────────────────────────────────────────┐
│ 仮に置く  |  採用する  |  無視            │
└─────────────────────────────────────────┘

[仮に置く] tap:
  ↓
  localStorage rehearsalFlag = { proposalId, ttl: 30min }
  DayGraph re-render with tentative anchor (= dashed)
  Delta surface (= Past-Self Voice 文体):
    - 「出発が 15 分早まります」
    - 「帰宅時間は変わりません」
    - 「buffer が 5 分減ります」
  ↓
  ┌───────────────────────────────────────┐
  │ 採用する  |  戻す                       │
  └───────────────────────────────────────┘
  ↓
  [採用する] → ExternalAnchor 化 + Quiet Undo Window (= §8.3)
  [戻す]    → rehearsalFlag 削除、 dismiss log なし
  [30min 経過] → 自動 flag 削除 (= 時間切れ silent)
```

### 8.3 Quiet Undo Window flow (= Phase 3-J-4)

```
Proposal Accept (= 直接 or Rehearsal 経由)
  ↓
  ExternalAnchor 作成 + localStorage { acceptedAt: timestamp, proposalId }
  ↓
  5 分以内: 提案 chip 跡地に subtle 「戻す」 link
    (= text-slate-400 small、 警告色なし)
  ↓
  [戻す] tap → anchor 削除 + dismiss log なし
  5 分経過 → link 消失、 anchor 通常運用
```

### 8.4 Memory Lens 過去日閲覧 flow (= Phase 3-K-1)

```
CalendarTab grid 過去日 cell tap
  ↓
  bottom sheet で過去 DayGraph
  ↓
  30 日以内: 完全 DayGraph (= 当時の anchor / movement)
  30 日超: pattern level summary
  90 日超: 「思い出されない日」 marker
  ↓
  閉じる → CalendarTab に戻る
```

### 8.5 Anchor Story tap flow (= Phase 3-M-5)

```
DayGraph 内 anchor tap (= long-press 不要)
  ↓
  feature vector 計算 + Analogical Pattern Bridging
  ↓
  past sample 3 件抽出 (= cosine similarity 高位)
  ↓
  bottom-anchored tooltip 表示
    - Past-Self Voice 文体
    - 過去 sample 0 → silent (= overlay 非表示)
  ↓
  overlay tap or 別 anchor tap → 閉じる
```

### 8.6 DayGraph Layer 配置 (= 全 tab 共通設計)

| Tab | 既存 (= Phase 2 不変) | Phase 3 追加 | Trigger |
|---|---|---|---|
| CalendarTab | 月/週 grid + day cell | bottom sheet (= 高さ 80vh) で DayGraph | day cell tap |
| FlowTab | 時系列 anchor list | 上部 30% に DayGraph header (= 折り畳み可)、 下部 70% 既存 list | 常時表示 |
| MapTab | 地図 + pin | 下部 80px に DayGraph mini-strip (= 横向き compress) | 常時表示 |
| AnchorDetailModal | 既存 anchor 詳細 | (= 不変、 Phase 3 影響なし) | — |

---

## 9. やらないこと (= 53 項)

### 9.1 Phase 3 全体禁止 (= 1-16)

1. 自動スケジュール (= Motion / Reclaim 路線)
2. 不可逆提案 (= 飛行機 / ホテル / 美容院 / 婚活 / 病院 / 預金)
3. LLM 呼出 (= 提案 reason は template、 永久)
4. 通知 / push (= アプリ外通知)
5. 外部 Calendar sync (Google / Apple)
6. Habit auto-block (= Reclaim 路線、 思想違反)
7. DraftPlan / W1-6 連携 (= 凍結 branch)
8. CoAlter / `/talk` / Mirror 連携
9. DB migration (= localStorage で先行)
10. 新 dependency
11. 警告色 / pulse / banner / drop-shadow (= 通知 metaphor)
12. AI 主語 (= 「Alter は」 「私は」 「I suggest」)
13. confidence % / score の UI 表示
14. 外部統計 / cohort 比較 / popularity ranking
15. 「すべき」 系コピー (= 強制感)
16. 数字 (= 「85% match」 「signal strength 0.7」) の user 表示

### 9.2 提案関連禁止 (= 17-28)

17. 新規 anchor の自動作成 (= Minimum Intervention 違反)
18. Day Mood の UI 開示 (= internal only)
19. Buffer Budget の数字 UI 開示 (= 曖昧 text のみ)
20. Reversibility score の UI 開示
21. Entropy Budget の数字 UI 開示
22. 採用率最大化を KPI に置く (= 「気づき率」 が真の KPI)
23. proposal の sentiment 変化 (= dismiss しても Alter は感情中立)
24. 「あなたは X 回 dismiss しました」 系の集計表示
25. dismiss → 「Alter が悲しんでいる」 系の演出
26. proposal を modal で出す (= subtle chip のみ)
27. 単一 proposal を 2 surface 同時表示
28. proposal を CalendarTab grid 内に inline 表示 (= grid 圧違反)

### 9.3 DayGraph 関連禁止 (= 29-39)

29. DayGraph の DB 永続化 (= computed projection、 stored 化禁止)
30. DayGraph の cross-device 同期
31. 起点不明時 home 自動決め打ち (= 1tap 確認 + skip 必須)
32. 終点を 22:00 以前の anchor で決める (= 22:00+ 以降のみ)
33. 過去 DayGraph の cross-device 同期 (= localStorage only)
34. 過去 DayGraph で confirmed 以外 (= proposal / ghost) 表示
35. Calendar grid を DayGraph で置換 (= 既存 grid 維持、 DayGraph は補完)
36. 既存 Calendar / Flow / Map component の mutate
37. 既存 anchor の startTime を Departure Correction で自動更新
38. 健康データ取得 (= sleep pattern は anchor 観測のみ)
39. 「sleep pattern を analyze しました」 等の演出

### 9.4 Memory + Risk 関連禁止 (= 40-46)

40. raw movement history の長期保存 (= 30 日超は pattern 化のみ)
41. raw address sequence の保存 (= route hash のみ)
42. Counter-Factual Bookmark の Phase 3-J 実装 (= M 以降)
43. Counter-Factual の警告色表示
44. 「Alter があなたを観察し続けています」 系の演出
45. 失敗 (= 遅刻) を 「failure」 として記録 (= context tag 必須)
46. dismiss を 「拒絶」 として encode (= 「観察」 として扱う)

### 9.5 視覚 + a11y 関連禁止 (= 47-53)

47. Ghost Anchor の default 表示 (= opt-in only)
48. 色を唯一の情報手段とする視覚設計
49. prefers-reduced-motion 設定の無視
50. prefers-contrast: more 設定の無視
51. dark mode 未対応の視覚 component
52. 「AI」 / 「new」 / 「!」 badge の Memory Chip 表示
53. proposal chip の banner / toast / drop-shadow style

---

## 10. Smoke 項目 (= 67 項)

### 10.1 提案基本 (= 1-15)

1. 空白時間で chip 発火 (= 平日 14:00-16:00 空 + lived geography → ProposalChip 表示) [Phase 3.5 / J-8]
2. 予定なし日の bulk 提案 (= 土曜 anchor 0 + 4 週パターン → ProposalSheet 2 chip) [J-6]
3. 場所未確定 anchor の hint (= unconfirmed + Phase 2-G PASS → MapTab hint) [J-6]
4. 採用 → anchor 化 [J-4]
5. 修正 → Place picker (= Phase 2-D 経由) [J-5]
6. 無視 → silent dismiss、 翌日同提案出ない (= 7 日 memory) [J-3]
7. sensitive 除外 (= 場所 / 時間が提案に出ない)
8. 強制感 absent (= 全 copy 検査、 警告色なし、 「すべき」 なし)
9. 提案上限 (= max 1 / surface / day、 2+ 出ない) [J-6]
10. cold start silent (= signal 0 → 提案 0)
11. Phase 2-G centroid 反映 [J-6]
12. Phase 2-I brand icon 表示 [J-2]
13. Phase 2-E overlap 連動 (= 重なり時 suppress)
14. Phase 2-F display coherence
15. 削除済 anchor 再提案 90 日 suppress

### 10.2 Self-Direction + Budget (= 16-25)

16. Self-Direction Triad 正しい分類 [J-1a]
17. Entropy Budget 3pt 超過時 suppress [J-1c]
18. dismiss 履歴で budget 縮小 [J-1c]
19. Self-Evidence Trail UI 非可視 [J-1b]
20. Minimum Intervention (= 補完 priority > 新規)
21. Reversibility score < 50 proposal 出ない [J-1d]
22. Self-Contradiction → 観測文出力 [J-1e]
23. Counter-Factual Bookmark v0 (= 30 日 retention) [Phase 3-M]
24. Proposal Integrity Contract 5 性質全て [J-7]
25. TestOverrideContext production import 検出 [J-1c]

### 10.3 DayGraph + 起点終点 (= 26-37)

26. StartPoint 沈黙 (= 前日 endpoint なし時 home default 押し付けず silent) [K-2]
27. EndPoint = home default、 22:00+ anchor あれば override [K-2]
28. DayGraph Projection (= stored second-source なし) [K-1]
29. Day Mood 計算 (= heavy → 提案 -1pt、 recovery → 提案 0) [K-3]
30. Buffer Budget daily / weekly accounting [K-3]
31. Path Metaphor render (= 時間 grid ではなく 1 本の道) [K-1]
32. Adapter Interface MockAdapter [L-1]
33. W3-PR-10 Bridge (= TransportSegment 流用、 二重実装なし) [L-2]
34. Departure Correction (= anchor.startTime 不変、 別 layer) [M-2]
35. Past-Self Voice (= copy 「あなたは / 先月のあなたは」 で固定) [M-2]
36. Memory Compression (= 30 日経過で pattern 化)
37. Analogical Pattern Bridging (= cosine similarity nearest neighbor) [M-5]

### 10.4 補正 + 文体 (= 38-44)

38. Past-Self Voice 検証 (= 「Alter」 「私」 「I」 含まれない) [J-1b lint]
39. Gentle Reflection 検証 (= 「遅刻」 「失敗」 「ダメ」 なし、 「余裕」 「ゆとり」 統一) [J-1b lint]
40. One-tap Origin Clarification (= prompt 表示、 skip 選択肢必須) [K-2]
41. Origin Vault Persistence (= 同 context 2 回目 silent) [K-2]
42. Onboarding Quietude (= Day 0-7 で proposal 0、 Day 8-30 max 1/週、 Day 30+ 通常) [J-1c]
43. Latency Tolerance (= 飛行機 strict、 カフェ flexible) [J-1d]
44. Anchor Verb Map (= 「寝る」 で proposal 0 sacred time) [J-1d + K-3]

### 10.5 Contract + UX (= 45-50)

45. Proposal Integrity Contract compliance (= 全 5 性質) [J-7]
46. TestOverrideContext production import 禁止 (= lint fail) [J-1c]
47. Theory-of-Mind Pause (= 24h dismiss 3+ → 24h proposal 0) [J-1c]
48. Evidence Tiered Copy (= 5+ / 3-4 / hedge 3 段分岐) [J-1b]
49. Linguistic Mirror (= user 「ジム」 vs 「gym」 で proposal copy 一致) [J-1b]
50. Quiet Undo Window (= accept 5min 以内 undo 可、 dismiss log なし) [J-4]

### 10.6 No Penalty + Rehearsal (= 51-58)

51. No Penalty for Ignore (= dismiss 履歴は UI で集計表示されない) [J-3]
52. Phase 3-K-5 Rehearsal Mode (= 仮置き → 戻すで dismiss log 増えない) [K-5]
53. Calendar grid retention (= Phase 3 実装で既存 grid 不変) [K-4]
54. DayGraph Layer Integration (= 既存 component を mutate せず追加配置) [K-4]
55. Ghost Opt-In default off (= Settings toggle 後のみ表示) [K-4]
56. a11y reduced-motion (= Memory Chip fade-in 等抑制)
57. a11y high-contrast (= dashed border / opacity 強化)
58. a11y dark-mode (= 全視覚 idea が別 palette、 視認性維持)

### 10.7 a11y + Memory + Story (= 59-67)

59. a11y screen reader (= path / glyph / ghost / bookend が読み上げ可)
60. Memory Lens past-date (= 過去日 tap で DayGraph、 30 日超 pattern 化) [K-1]
61. Anchor Story tooltip (= anchor tap で過去 observation、 sample 0 silent) [M-5]
62. Day Threshold Bookend (= 日の出 / 入り計算が緯度経度から正確) [K-1]
63. Ambient Day Color (= opacity 30-40% 範囲内) [K-4]
64. No Warning Color (= 全 Phase 3 UI で red / orange-500+ 不使用) [smoke grep]
65. No Notification Metaphor (= drop-shadow / pulse / slide / banner 不存在) [smoke grep]
66. Soft Endpoint Drift (= 22:00+ anchor で endpoint override) [K-2]
67. Sun Calculator (= NOAA アルゴリズム、 外部 API 不要) [K-1]

---

## Appendix A. Failure Mode Analysis

### A-1. 心理的失敗

| Risk | 症状 | 予防 |
|---|---|---|
| 強制感 | 「Alter が私を導こうとしている」 | No-AI-Subject + Past-Self Voice + 「すべき」 系コピー禁止 + 警告色禁止 |
| 監視感 | 「Alter は私の失敗を覚えている」 | Gentle Reflection + Counter-Factual の Phase 3-M defer + 「あなたは X 回 dismiss」 系禁止 |
| 責められ感 | 「Ghost Anchor を見るたび後悔」 | Ghost Opt-In Only + sentiment 中立 + 警告色禁止 |
| 提案疲れ | 「毎日同じ提案」 | Half-life decay + 7 日 cross-day memory + Theory-of-Mind Pause |
| 数字疲れ | 「85% confidence と言われても」 | Confidence 非可視 + 内側からの言葉のみ |
| 圧迫感 | 「Calendar の grid が提案で埋まる」 | Memory Chip subtle + max 1 / day / surface + grid に inline 表示禁止 |

### A-2. 技術的失敗

| Risk | 症状 | 予防 |
|---|---|---|
| データ汚染 | ProposedAnchor が DB に保存される | Invariant 10 + Proposal Integrity Contract type lock + sourceType="proposal" trace |
| 二重 source of truth | DayGraph が stored される | Invariant 25 + computed projection 強制 + W3-PR-10 教訓継承 |
| privacy 違反 | raw address が外部 API に流出 | Phase 3-N まで外部 API 接続なし + Minimal Memory + route hash のみ保存 |
| accessibility 違反 | 色弱 user が情報読めない | Invariant 48 + WCAG 2.1 AA 準拠 + 色は唯一の情報手段にしない |
| build fail | TestOverrideContext が production に混入 | ESLint no-restricted-imports + CI 強制 |
| scope 爆発 | Phase 3-J が 5000 LOC 超 | J-1 を a/b/c/d/e に細分化 + J-3 で停止 + K/L/M/N は別判定 |

### A-3. 思想的失敗

| Risk | 症状 | 予防 |
|---|---|---|
| AI 主導化 (= Motion 化) | Alter が user を導き始める | Invariant 1 + 34 + 39 三重 lock + No-AI-Subject lint |
| 効率志向化 | 「採用率」 を KPI に置く | KPI は 「気づき率」 と明示 + Reflection-triggering copy |
| 通知爆撃 | 提案が banner / toast 化 | Invariant 42 Memory Chip Style + 通知 metaphor 永久禁止 |
| privacy 緩み | Settings export なし | Invariant 32 Minimal Memory + Settings Export/Delete 必須 |
| cold start 暴走 | 新規 user 初日に提案爆撃 | Invariant 36 Onboarding Quietude + 7 日 silent |
| 外部統計依存 | 「あなたに似た人は」 系コピー | Invariant 17 Internal data disclosure only + 外部統計禁止 |

---

## Appendix B. Design Hypothesis (= 差別化仮説、 継続検証対象)

本表は 「現時点での設計仮説」 として整理。 主要 Calendar / AI Scheduler との比較は **継続検証対象**。 検証は Phase 3 完了後の比較研究 (= 実機評価、 user study) で行う。

| Aspect | Motion | Reclaim | Sunsama | Cron/Amie | Routine | Notion AI | Aneurasync Phase 3 (= 仮説) |
|---|---|---|---|---|---|---|---|
| 目的 | auto schedule | habit block | daily plan | calendar UX | task+habit | tasks | 過去の自分との対話 |
| Day モデル | event list | habit grid | task list | grid | task list | tasks | DayGraph (= 線) |
| 提案軸 | task urgency | habit goal | priority | meeting | task | content | Self-Direction Triad |
| 負荷管理 | なし | なし | manual | なし | なし | なし | Entropy Budget |
| 提案根拠 | external | external | user input | calendar | task | external | internal observation only |
| dismiss 学習 | 限定 | あり | なし | なし | なし | なし | 7 日 memory + half-life |
| 起点予測 | home assume | home assume | manual | manual | manual | N/A | vault learning + 1tap + skip |
| 移動 | API 依存 | なし | manual | nav link | なし | N/A | DayGraph + Departure Correction |
| 遅刻記憶 | なし | なし | manual | なし | なし | N/A | Arrival Risk + context + half-life + compression |
| 失敗開示 | hide | hide | hide | hide | hide | hide | gentle factual reflection |
| Reversibility | なし | なし | なし | なし | なし | なし | internal score、 score >= 50 のみ |
| 沈黙 | UI 消失 | UI 消失 | UI 消失 | UI 消失 | UI 消失 | UI 消失 | Quiet Status (= 探索時のみ) |
| 数字 | 表示 | 表示 | 表示 | なし | あり | 表示 | 永久非可視 |
| 時間モデル | 日完結 | 日完結 | 週見る | 日完結 | 日完結 | N/A | Cross-Day Buffer Borrowing |
| 自己変化 | 静的 | 静的 | 静的 | 静的 | 静的 | 静的 | Trust Half-Life |
| Pattern 閾値 | 同等 | 同等 | 同等 | 同等 | 同等 | N/A | 3+ 回反復のみ |
| 起点不明時 | home assume | home assume | ask 毎日 | ask 毎日 | ask 毎日 | N/A | vault + 1tap + skip |
| 不可逆提案 | 提案 | 提案 | 提案 | 提案 | 提案 | N/A | 永久禁止 |
| Latency tolerance | なし | なし | なし | なし | なし | N/A | strict/tight/flexible 内部 map |
| Mood trend | なし | なし | なし | なし | なし | N/A | 7 日 trend 観測 |
| Endpoint drift | なし | なし | なし | なし | なし | N/A | anchor で動的更新 |
| Anchor verb | text only | text only | text only | text only | text only | text | table-based semantic |
| Onboarding silent | 即稼働 | 即稼働 | 即稼働 | 即稼働 | 即稼働 | 即稼働 | 7 日観測のみ |
| AI 主語 | 使用 | 使用 | 使用 | 使用 | 使用 | 使用 | 完全禁止 |
| Analogical reasoning | なし | なし | なし | なし | なし | 限定 | feature vector + nearest neighbor |
| Theory-of-Mind | なし | なし | なし | なし | なし | なし | dismiss 反応で auto pause |
| Self-doubt expression | confidence % | confidence % | なし | なし | あり | あり | evidence tiered hedge |
| Quiet undo | なし | なし | なし | なし | なし | あり | 5 分 subtle 撤回 |
| Linguistic mirror | normalized | normalized | normalized | normalized | normalized | normalized | user token そのまま反射 |
| Time hedging | exact | exact | exact | exact | exact | exact | 散らばり度 = 解像度 |
| Rehearsal Mode | なし | なし | なし | なし | なし | なし | 仮置き → 採用 / 戻す |
| Path Metaphor | grid | grid | list | grid | list | list | 1 本の道 |
| Memory Chip | notification | notification | card | (= 提案なし) | (= 提案なし) | bubble | memory metaphor |
| Verb Glyph | なし | なし | なし | なし | なし | なし | 10px micro |
| Day Bookend | なし | なし | sunset only | なし | なし | なし | sunrise + sunset + sleep pattern |
| Ambient Color | static | static | static | static | static | static | 時刻 tint (= a11y 対応) |
| Ghost Anchor | なし | なし | なし | なし | なし | なし | opt-in、 30 日 retention |

主要 30 軸 + α の仮説で異なる設計軸を整理した。 これらの 「異なる」 が実際の user 体験で差別化として機能するかは、 Phase 3 完了後の比較研究で検証する。

---

## Appendix C. Phase 4+ 接続点

### C-1. mood / 疲労 / 集中 signal 接続 (= Phase 4 予定)

Phase 3-J-1c に予約済の interface:

```typescript
interface ProposalSuppressor {
  shouldSuppress(proposal: ProposedAnchor, ctx: ProposalContext): boolean;
}
```

Phase 3 では `() => false` の no-op suppressor。 Phase 4 で mood-aware suppressor を追加。

### C-2. DraftPlan / W1-6 統合 hint (= 凍結 branch)

Phase 3 では W1-6 / DraftPlan 一切触らない (= 凍結 branch)。 Phase 4+ で統合検討時の接続点:

- W1-6 (= Life Context) の signal を Proposal の `evidence` field に統合
- DraftPlan の anchor draft を ProposedAnchor の draft field と統合

### C-3. CoAlter / `/talk` / Mirror 連携 (= Phase 5+)

Phase 3 では一切触らない。 Phase 5+ で:
- proposal chip から `/talk` session 起動 hint
- Mirror の自己理解 state を proposal copy に反映

### C-4. 実 Transport API 検討事項 (= Phase 3-N)

CEO 承認時の審査軸:

- 商用利用可否
- 利用規約 (= cache 期間 / 表示制約 / API key 取扱)
- 料金構造
- privacy (= 何データが external に送られるか)
- fallback (= API down 時)
- 精度
- backup / multi-vendor 戦略

候補:
- 駅すぱあと WebサービスAPI (= ヴァル研究所)
- NAVITIME API
- Google Directions API
- HERE Maps

### C-5. DB 永続化検討 (= Phase 3-N 議論時)

Phase 3-J/K/L/M は全 localStorage。 Phase 3-N 議論時に DB 化検討:

- ArrivalObservation の cross-device 同期 必要性
- Origin Vault の cross-device 同期 必要性
- DismissLog の cross-device 同期 必要性
- migration 設計
- privacy review

---

## Appendix D. References

### D-1. 学術基盤

- **Active Inference** (Friston, K.): Generative model の内側から世界を受け取る。 HDM v1 思想連動。
- **Constructed Emotion** (Barrett, L. F.): 感情は内部状態と外部 signal の構成、 mood signal の理論基盤。
- **Hippocampus → Cortex Memory Consolidation**: 個別 event が pattern に統合される神経科学。 Memory Compression (= Idea 15) の根拠。
- **Negative Capability** (Keats, J.): 不確実性に耐える能力。 Self-Doubt Surface (= Idea 27) の哲学的根拠。
- **Extended Mind Thesis** (Clark & Chalmers): 認知は皮膚内に閉じない。 第二の自己思想の基盤。

### D-2. UI / UX 規格

- **WCAG 2.1 AA**: 視覚障害 / 認知特性差を持つ user の access 保証。
- **Material Design / HIG (= Human Interface Guidelines)**: ただし Aneurasync 独自視覚言語が優先。
- **prefers-reduced-motion / prefers-contrast / prefers-color-scheme**: CSS media features。

### D-3. 既存 Calendar AI 製品調査 (= 2026 年時点)

- Motion (motion.app): AI auto-schedule。
- Reclaim (reclaim.ai): habit block。
- Sunsama (sunsama.com): daily ritual + week ahead。
- Cron / Notion Calendar: calendar UX 優先。
- Amie (amie.so): 高速 calendar UX。
- Routine (routine.co): task + habit。
- Fantastical (flexibits.com/fantastical): 自然言語入力。
- TimeTree (timetreeapp.com): 共有 calendar。

### D-4. 関連 Aneurasync 設計

- `docs/heart-dynamics-model-v1.md`: HDM v1 (= Alter 存在論)。
- `docs/alter-perspective-engine-design.md`: PE (= Perspective Engine、 Web 検索統合)。
- `docs/alter-episodic-recall-phase1-design.md`: Episodic Recall。
- `memory/aneurasync-philosophy.md`: 中心問い / 最高体験 / 判断基準。

### D-5. Phase 2 関連 docs

- `docs/alter-plan-phase2-f-display-coherence-mini-design.md` (= 場所表示一貫性)
- `docs/alter-plan-phase2-g-lived-geography-confidence-fallback-mini-design.md` (= 生活圏 fallback)
- `docs/alter-plan-phase2-h-place-intent-candidate-search-mini-design.md` (= 場所候補検索)
- `docs/alter-plan-phase2-i-category-icon-system-mini-design.md` (= category icon)

---

## Appendix E. Glossary

| 用語 | 定義 |
|---|---|
| **ProposedAnchor** | Alter が提案する anchor の draft 形式。 採用までは `ExternalAnchor` 化しない。 |
| **ProposalDirection** | 提案の 3 軸: `continue_pattern` / `recover_pattern` / `intentional_break_observed`。 |
| **ProposalReason** | 提案の起源: `pattern_repeat` / `lived_geography_centroid` / `day_pattern` / `unconfirmed_place_hint`。 |
| **Self-Direction Triad** | ProposalDirection の 3 軸を user 自己決定の枠組みとして提示する設計。 |
| **Entropy Budget** | 提案の認知負荷 point。 1 提案 = 1pt、 修正 = 2pt、 一括 = 3pt、 1 日 max 3pt。 |
| **Self-Evidence Trail** | 提案を支える内部 evidence record (= 観測根拠)、 UI 非可視。 |
| **Proposal Integrity Contract** | proposal の 5 性質 (= neverMutatesAnchor / userActionRequired / canBeIgnoredWithoutPenalty / sourceEvidenceRequired / sensitiveExcluded)。 |
| **Past-Self Voice** | 提案 / explanation の文体規約。 「過去の自分が現在の自分に話す」 主体、 AI 主語禁止。 |
| **No-AI-Subject Copy** | 文章主語の Alter / 私 / I を禁止する lint rule。 |
| **Onboarding Quietude** | 利用初期 7 日 silent、 8-30 日 max 1/週、 30+ 日通常の運用 phase。 |
| **Theory-of-Mind Pause** | user の dismiss 反応から疲労を察し、 24h proposal pause する設計。 |
| **Evidence Tiered Copy** | evidence 強度 (= 反復回数) で文体 3 段分岐する設計。 |
| **Linguistic Mirror** | user の title token を proposal copy に反射する設計。 |
| **Quiet Undo Window** | accept 後 5 分の subtle 撤回権。 |
| **Rehearsal Mode** | 採用前に DayGraph に仮置きして影響確認する設計 (= 「仮に置く」 / 「採用」 / 「戻す」 3 択)。 |
| **Reversibility Score** | proposal の取消可能性 score (= internal、 score >= 50 のみ Phase 3-J で提案)。 |
| **Latency Tolerance Map** | anchor の punctuality 重要度 mapping (= strict / tight / flexible / none)。 |
| **Anchor Verb Map** | anchor.title から動詞 (= eat / work / rest / move / care / social) 抽出する table。 |
| **Self-Contradiction Detector** | 反復 pattern と最近行動の乖離検出 → 提案ではなく観測文として出力。 |
| **DayGraph** | 1 日を 「起点 → 予定 → 移動 → 空白 → 終点」 の道として描く pure computed projection。 |
| **DayGraphPoint** | DayGraph の起点 / 終点。 explicit / vault_inferred / previous_endpoint / silent の 4 confidence。 |
| **DayGraphEvent** | DayGraph 内の anchor wrapper。 verb / latencyTolerance を含む。 |
| **DayGraphMovement** | DayGraph 内の移動 segment。 W3-PR-10 TransportSegment 流用。 |
| **DayGraphGap** | DayGraph 内の空白時間 (= Phase 3.5 / J-8 で提案発火対象)。 |
| **Origin Vault** | 起点の選択を context 別に永続化する設計 (= 質問反復禁止)。 |
| **Soft Endpoint Drift** | 22:00+ anchor で終点を home から override する設計。 |
| **Day Mood** | 当日 anchor 統計から推論する day 全体の重さ (= heavy / light / recovery)。 |
| **Inverse Day Mood Trend** | 7 日連続 heavy 後の recovery day を観測として提示。 |
| **Buffer Budget** | 余裕時間の daily / weekly accounting (= Cross-Day Borrowing)。 |
| **Path Metaphor** | 1 日を時間 grid ではなく 1 本の道として描く視覚言語。 |
| **Memory Chip** | 通知 metaphor ではなく記憶 metaphor で表示する proposal chip の視覚 style。 |
| **Ghost Anchor** | dismiss された提案を 30 日 retention で薄く保持 (= opt-in only)。 |
| **Anchor Verb Glyph** | anchor の動詞を 10px micro-icon で視覚化。 |
| **Day Threshold Bookend** | DayGraph 上下に日の出 / 日の入り表示 (= 自然時間 grounding)。 |
| **Ambient Day Color** | 時刻で背景を薄く tint する視覚 (= a11y 対応必須)。 |
| **Memory Lens** | 過去日の DayGraph を閲覧する設計。 |
| **Anchor Story** | anchor tap で過去 context (= Analogical Pattern Bridging) を Past-Self Voice で表示。 |
| **Arrival Risk Memory** | 過去到着実績 (= 遅刻 / 早すぎ / 余裕不足) の minimal storage。 |
| **Departure Correction** | Latency Tolerance + Arrival Risk Memory から出発時刻補正を別 layer で提示。 |
| **Counter-Factual Bookmark** | dismiss された提案と結果失敗の relation を 30 日 retention (= Phase 3-M)。 |
| **Memory Compression** | 30 日経過 event を pattern 化 (= Lv 0 → Lv 1 → Lv 2 階層)。 |
| **Trust Half-Life** | Arrival Risk Memory の各 event に半減期 (= 古い event は weight 低下)。 |
| **Analogical Pattern Bridging** | 新 anchor を feature vector で過去 anchor との nearest neighbor 計算 (= cold-start 解消)。 |
| **Negotiated Time** | 時刻提案を散らばり度で hedging (= 「9:45 出発」 vs 「9 時半 〜 10 時頃」)。 |
| **TestOverrideContext** | dev/test/smoke 専用 override context、 production import 禁止。 |
| **TransportRouteAdapter** | 交通 API の抽象 interface、 Phase 3-L で mock のみ、 Phase 3-N で実 API。 |

---

## 凍結

本 Architecture は 2026-05-21 時点で **設計凍結**。 これ以降の補正は本 docs commit 後の review で扱う前提。

- Phase 3-J 実装着手は本 docs commit 後の CEO 判定。
- Phase 3-K/L/M/N は J 完了後の別 CEO 判定。
- 全 Phase 2 branch (= 2-D 〜 2-I の 9 branch) は引き続き凍結。

---

