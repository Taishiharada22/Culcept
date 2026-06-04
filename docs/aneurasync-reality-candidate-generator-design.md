# Reality Control OS — Candidate Generator / Evaluator 設計（A1 系）

> 起草: Build Unit / 2026-06-04 / 起点 main `499b6801` / branch `feat/reality-candidate-generator`
> 範囲: 判断 OS の中核臓器「候補生成器（何を提案するか）＋ 候補評価器（どれだけ安全/良いか）」。
> 本書は **pure 層のみ**。UI / DB / route / runtime / staging / production には接続しない。

---

## 0. なぜ慎重に分割するか
候補生成器は「何を動かしてよいか・何を不可侵にするか・何を drop/shorten/move してよいか」を扱う中核。
雑に作ると「AI が予定を勝手に動かす」方向へズレる。よって **1 slice / 1 GO** で外科的に積む。

## 1. 安全アーキテクチャ（中核原則）
- `best-action` の **Gate-first** は候補を採用前に弾く。だが Gate は候補の **metrics を信じる**
  （metrics は呼び出し側が事前計算）。→ 唯一の穴は「生成器が metrics を甘く自己申告する」こと。
- 対策（構造で）: **generator は metrics を *申告できない*** 型 `CandidateDraft`（= `Omit<BestActionCandidate, "metrics">`）を出す。
  **evaluator だけが metrics を産み** `BestActionCandidate` を組む。
- 表現（正確に）: unsupported / unknown / missing は必ず安全側(fail)に倒し、
  **不安全候補が安全扱いされる経路を構造的に *減らす***（絶対化はしない＝実装バグ/未対応 op は残りうる）。
- evaluator は raw `DayGraph` でなく **抽象 `GenerationContext`（redacted・governance 付）** を使い、raw を引き込まない。

```
generator(A1-3+) → CandidateDraft[]            // metrics を持てない
                 → evaluateCandidate(A1-2-2+)  // evaluator が独立に metrics を付与
                 → BestActionCandidate[]
                 → rankCandidates(Gate-first)  // evaluator metrics を信頼
```

## 2. 分割と状態
| slice | 内容 | 状態 |
|---|---|---|
| **A1-1** | 候補生成器の器: `generateCandidates→[]` no-op / `GenerationContext`（dayNode↔anchors.governance join）/ `isTouchableForGeneration`・`isPreservedForGeneration`（authority を *消費*）/ touchable=isRepairTouchable∧非recovery_core, preserved=immovable∪recovery_core | ✅ landed |
| **A1-2-1** | `CandidateDraft` 型（metrics 持てない）/ `applyChangeSet(nodes,cs)` 最小純関数（atomic・fail-closed・no mutation・raw 不持込） | ✅ landed |
| **A1-2-2** | `evaluateSafetyMetrics`（feasible/recoveryProtected/deadlineSatisfied/wholePartCoherent を独立・保守的に算出。one-sided conservative・unknown→false） | ✅ landed |
| **A1-2-2.5** | Deadline Gate Alignment: best-action に独立 `deadline` gate（deadlineSatisfied=false→hard reject）。GateKind を 3 箇所同期 | ✅ landed |
| **A1-2-3** | `evaluateCandidate`（draft→BestActionCandidate・safety=evaluator 由来・客観 instability のみ・主観中立 0・rank は test 検証のみ） | ✅ landed |
| **A1-2-4a** | `overpack` のみ算出（過密 penalty・一方向・保守・util>0.7 のみ・unknown→0）。slackHealth/contextSwitches は defer | ✅ landed |
| **A1-3-R1a** | Repair overlap **trim-only**（earlier=lower-priority=touchable の end を B.start へ短縮・最大1件・update op 1・no move/add/remove/cascade） | ✅ landed |
| **A1-3-R1a-2a** | Repair trim-only **coverage expansion**（多重 overlap を all-or-nothing で全解消する 1 件の multi-op・trim 対象は明確に lower-priority/more-flexible な earlier のみ） | ✅ landed |
| **A1-4-0** | **Seed Placement Context / Complete prerequisite（design only）**: Complete を阻むのは placement 入力の不在。Gap-1(`PlanSeed` に duration 無)・Gap-2(`seedTraces` は lossy reduction)。`SeedPlacement`(構造化・redacted・自由文なし)＋`durationMin:number\|null` 第一級値→no candidate＋duration source(PRM seam)。型/実装は A1-4-1 以降 | 📐 設計のみ（実装別 GO） |
| **A1-4-1** | **SeedPlacement 変換・判定の土台**: `SeedPlacement`/`TimeWindow`/`DurationSource` 型 + `buildSeedPlacements`(active のみ・構造化のみ・raw 不持込・推測なし) + `isPlaceable`(duration 不明→false) + `isTentative`。durationMin 常に null＝実 seed は全て not-placeable。**候補/add op/default duration なし** | ✅ landed |
| A1-3-R1b〜 / 他 mode | move/cascade Repair / Complete / Build / Optimize（各別 GO・context+evaluator 経由） | ⏳ 別 GO |

## 3. A1-1 実装（landed）
- `lib/plan/reality/candidate-generator.ts`: `generateCandidates` は safe no-op（`[]`）。`buildGenerationContext` が
  dayNode↔anchors.governance を join し、authority（`isImmovable`/`isRepairTouchable`/`repairTouchOrder`/`hasProtection`）を
  *消費* して touchable / preserved に分類。anchor governance 欠落は保守的 immovable（fail-closed）。
- contract test: import_locked / hard_external / recovery_core を勝手に touchable 化しない（movable でも preserved）。

## 4. A1-2-1 実装（landed）
- `lib/plan/reality/candidate-evaluator.ts`:
  - `CandidateDraft = Omit<BestActionCandidate, "metrics">`（metrics/score/gate を**構造的に持てない**）。
  - `PlanNode`（id/startMin/endMin/governance?。**raw title/location 無し**）。
  - `applyChangeSet(nodes, cs) → ApplyResult`（**atomic**・**入力 mutate なし**・**raw 不持込**・**safety 判定しない**）:
    supported(add/remove/update) のみ / unsupported は fail / unknown・missing node は fail /
    before・after 不整合(stale) は fail / 失敗時は入力不変。
- test: CandidateDraft の key 限定 / supported ops / fail-closed 各種 / atomic / no mutation / no raw（issues も含め raw なし）。

## 4b. A1-2-2 実装（landed）
`lib/plan/reality/candidate-evaluator.ts` に `evaluateSafetyMetrics(draft, context) → SafetyMetrics`（4 安全 metric のみ）。
- **独立**: 既存 node の governance は **context（権威的）** から引く（draft の自己申告 snapshot を信じない）。
- **保守（one-sided）**: apply 失敗 / unknown は **全 false**。
  - `feasible` = applyChangeSet 結果が幾何妥当（duration>0・日境界内・overlap なし）
  - `recoveryProtected` = remove/update が recovery_core を触れば false（add は無害）
  - `deadlineSatisfied` = remove/update が hard/locked/immovable/critical を壊せば false
  - `wholePartCoherent` = budget(総時間≤1日) ∧ 日境界 overflow なし
- **未実装（範囲外）**: score / goalAttainment / rhythmFit / 主観 metric / BestActionCandidate 化 / rank 接続 / mode 生成。
- test: 非空性（safe→全 true）/ apply 失敗→全 false / recovery_core 触る→false / critical 壊す→false / overlap・zero duration・日境界外→false。

## 4c. A1-2-2.5 実装（landed）— Deadline Gate Alignment
**発見**: best-action では `deadlineSatisfied` が gate でなく score 項だった ＝ 保護対象 deadline を壊す候補が
「低 score で候補に残る」状態。秘書 OS として弱い（飛行機/試験/面接/通院予約/支払い系）。
**対応（案 A・独立 gate）**:
- `best-action.ts`: `GateKind += "deadline"` ＋ evaluateGates に `deadline` gate（`pass: m.deadlineSatisfied`、
  reason="breaks a protected deadline"）。**保護対象 deadline 破壊を説明可能な理由つき hard reject**。
- GateKind 列挙 3 箇所同期: `redaction-guard.GATE_TOKENS` / `dev-report.GATES` / 既存 "all 6 gates" test→7。
- `deadlineSatisfied` は A1-2-2 の **保守的 proxy** ゆえ「すべての deadline 問題を完全捕捉」はしない
  （保護対象クラス hard/locked/immovable/critical のみ false。soft/movable は false にしない＝過剰 reject しない）。
- deadline **score 項は残す**（gate 通過後は定数化・harmless。削除/score 再設計は別フェーズ）。
- test: deadlineSatisfied=false→deadline gate fail / rankCandidates で deadline 破壊候補は **best にならない**
  （高 score でも score 救済されない）/ soft/movable update→deadlineSatisfied=true（過剰 reject なし）。

## 4d. A1-2-3 実装（landed）— evaluateCandidate（draft→BestActionCandidate の橋）
`candidate-evaluator.ts` に `evaluateCandidate(draft, context) → BestActionCandidate`：
- **safety metrics は必ず `evaluateSafetyMetrics` 由来**（CandidateDraft に metrics 場が無い＝generator 自己申告不能）。
- 客観 metric は **`instability`（move+remove 数）のみ**実算出。
- subjective（goalAttainment/rhythmFit/slackHealth/overpack/contextSwitches/correctionMisalignment）は
  **中立 default 0**（水増ししない・本実装は A1-2-4 以降）。
- best-action は不変 → 標準 BestActionCandidate を産むのみで **Gate-first がそのまま効く**。
- test: safety=evaluator 一致 / subjective=全 0 / instability=客観 count /
  **rankCandidates で feasible·recovery·deadline·wholePart の gate-false 候補は best にならない**（score 救済なし）。
- 未実装（範囲外）: subjective 本実装 / 客観 score 拡充(A1-2-4) / Build·Complete·Repair·Optimize / rank の production 接続。

## 4e. A1-2-4a 実装（landed）— overpack-only conservative penalty
`evaluateCandidate` の `overpack` を 0→算出（`computeOverpack`）。
- **applied timeline のみ**（GenerationContext.nodes＋applyChangeSet 結果）。raw DayGraph 不使用。
- `util = busy / MAX_DAY_MIN`。**util > 0.7（COMFORT）のときだけ** penalty、超過分を 0..1 に clamp。
- **apply 失敗 / node 不足 → 0**（unknown を不当に救わず・不当に罰さず）。一方向 penalty のみ（positive を盛らない）。
- **slackHealth は defer**（active window / gap meaning / recovery core / user rhythm が無い状態で positive を入れると
  「空白が多いだけの候補」を持ち上げ＝何も決めない秘書に歪むため）。**contextSwitches も defer**（domain/activityType 待ち）。
- subjective（goalAttainment/rhythmFit/correctionMisalignment）も 0 維持。weights/gate 不変。
- test: sparse→0 / 過密(util>0.7)→>0 / apply 失敗→0 / **rank で高 overpack 安全候補は低 overpack 候補より下位** /
  gate-false は依然 score 救済されない。

## 4f. A1-3-R1a 実装（landed）— Repair overlap trim-only（初の生成器）
`candidate-generator.ts` の `generateFromContext` に Repair 分岐 `generateRepairTrim`。
- **生成物は CandidateDraft（metrics 持たない）**。generateCandidates の戻り型を CandidateDraft[] に。
- 戦略: 重複する隣接 2 node (A=earlier, B=later) のうち **earlier かつ lower-priority かつ touchable な A の end を
  B.start へ短縮**（A.start 固定＝純 shorten・reschedule なし）。重複部分だけを切る。
- **不可侵**: preserved/immovable/hard_external/recovery_core/import_locked/locked は絶対に触らない（context.touchable のみ）。
- **no candidate**: 重複なし / A 非 touchable / 包含 / trim 後 duration≤0 / 両 touchable で優先度同（推測しない） / mode≠repair。
- move/shift/cascade/add/remove はしない（後続 slice）。
- test: trim 生成（update 1・A のみ・start 固定）/ 各 no-candidate 条件 / **pipeline: generate→evaluate→rank で
  trim は safe(全 gate 通過)で best・unsafe を並べても trim が best（gate-first）**。
- 型: candidate-generator↔candidate-evaluator は **type-only 循環 import**（実行時に erase・runtime 循環なし・tsc 0）。

## 4g. A1-3-R1a-2a 実装（landed）— Repair trim-only coverage expansion
`generateRepairTrim` を R1a（最初の 1 overlap・1 op）→ **多重 overlap 対応**に一般化。
- **all-or-nothing**: sorted nodes の隣接 overlapping pair を全走査し、**全 pair が trim-only で解消可能なら**
  各 earlier node の end を直後 neighbor の start へ短縮する **1 件の multi-op CandidateDraft**。
  全 overlap を解消しない部分候補は feasible gate で落ちる可能性が高いため**全解消 1 件に限定**。
- **trim 対象厳格化（CEO 補正）**: 「earlier だから切る」ではなく、`isClearlyLowerPriority(A,B)` ＝
  **flexibilityRank(A) < flexibilityRank(B)（明確に more-flexible）∧ importance(A) ≤ importance(B)（重要度逆転でない）**
  かつ A が touchable のときのみ。＝**重要な前予定を切らない**。
- 各 node は隣接で earlier に最大 1 回＝**1 回だけ trim**（dedupe 構造的）。
- **no candidate**: mode≠repair / 重複なし / 包含 / trim 後 duration≤0 / A 非 touchable / 明確に lower-priority でない（同 flexibility・重要度逆転）。1 つでも該当で全体 null。
- move/cascade/reschedule/add/remove なし。preserved/protected/later は不変。R1a（単一 overlap）は N=1 の特殊例として subsume。
- test: 連鎖（A<B<C flexibility 降順）→2-op / 重要度逆転→no candidate(CEO 例) / all-or-nothing→no candidate / pipeline 全解消→feasible で best。

## 4h. A1-4-0 設計（design only・実装は別 GO）— Seed Placement Context / Complete prerequisite
> 記録: 2026-06-05 / **本節は設計記録のみ。型/実装は未着手**（A1-4-1 以降で別 GO）。read-only 接地に基づく。

**中核診断**: Complete を阻むのは「生成器不足」ではなく **placement 入力の不在**。2 gap に分離（+ gap でない 1 つ）:
- **Gap-1（データモデル）**: `PlanSeed`（`lib/plan/plan-seed.ts` L37–66）に **duration / hard earliest-latest / place / 明示 priority・flexibility が無い**。placement に使える構造化フィールドは `desiredDate`(YYYY-MM-DD) / `desiredTimeHint`(morning/afternoon/evening/anytime・**ソフト帯**) / `actionShape`(8 判断形・**非 duration**) / `confidence` / `status`(active のみ配置可) のみ。
- **Gap-2（reduction 損失）**: 生成器が見る `RealityInput.seedTraces` は `seedToSourceTrace`（`input-adapter.ts` L138–143,207）の **lossy reduction**。`{kind,ref,reason(自由文),confidence}` のみ残し **date/timeHint/actionShape/status を捨てる**。SourceTrace は監査 primitive であって placement primitive でない。Repair が placement 不要だったのは既存ノードの start/end を*修正*するだけだから。Complete は seed から*新規生成*するため when+duration が要る。
- **gap でない**: `add` op は既存（`change-set.ts` L34/53/124・`applyChangeSet` `case "add"`・safety は add を正しく扱う L224/232・instability は add 除外 L250）。Complete の追加基盤は揃っている＝change-set 拡張不要。

**方針**: Gap-2 を埋める **`SeedPlacement`**（構造化・redacted・自由文なし）を `PlanSeed` から直接（reduction 前に）導出し、Gap-1（duration）は **不明=第一級値→no candidate** で安全保留、PRM 供給で後から埋める seam を今切る。

**型スケッチ（design only・未実装）**:
- `SeedPlacement { seedRef; date?; window?:TimeWindow; durationMin:number|null; durationSource:"seed_explicit"|"prm_typical"|"correction"|"unknown"; dispositionHint?:"place"|"tentative"|"skip"; confidence; placementGrounding:"strong"|"weak" }`。
- `TimeWindow` = `desiredTimeHint` 由来の **ソフト帯**（hard earliest/latest にしない・clock 数値は day active window/PRM 由来でハードコードしない）。
- `DurationSource` = duration の provenance。**`durationMin:null`=不明を第一級値**（magic 定数を置かない）。
- priority/flexibility は seed 新フィールドにせず **生成ノードの governance** で表現（origin=alter_generated / authority=advisory / flexibility=movable・弱なら tentative）。place は省略（時間のみ配置）。`actionShape` は disposition ヒントのみ（skip/defer→置かない/tentative）で duration には使わない。

**raw text 不持込**: placement の全判断（date/window/duration/disposition/grounding）は enum/数値/日付のみ読む。`signal`/`desiredAction` は `SeedPlacement` から排除。ユーザー向け「なぜ」は `SourceTrace.reason`（display 専用・出力段 redaction-guard 済）に分離。＝placement 判断（構造化）と display 理由（自由文・集約時 redacted）を二系統に切る。

**duration 方針**: **sourced であって assumed でない**。実ソース（seed_explicit / prm_typical / correction）が無い限り `durationMin=null` → no candidate。**今日は PRM 未接続ゆえ default duration は不可**＝Complete 最小は概ね no-op（捏造より誠実・PRM 接続の forcing function。既知状態でありバグでない）。

**no candidate（推測しない・fail-closed）**: `status≠active` / `durationMin=null` / 配置先未定（date 無 ∧ timeHint 無/anytime ∧ PRM 既定日無）/ 選んだ日・帯の空き枠に入らない（既存/preserved を動かさず）/ 構造矛盾（過去日等）。1 つでも該当で候補を出さない。

**弱根拠→tentative/on-open/no-push**: `confidence<0.5`（isWeaklyGrounded 類比）∨ durationSource=unknown ∨ date+window 両欠落 → tentative（`proposedDisposition="confirm"`・push しない）。ただし **duration 不明は tentative でなく no candidate**（tentative は「置けるが根拠が柔らかい」時のみ）。

**Complete 最小の invariant（安全契約・実装時にテスト化）**:
- INV-A 無捏造: `durationMin=null ⇒ no candidate`
- INV-B 無 raw: `SeedPlacement` に自由文無し / 生成ノードに raw title 無し（snapshotToNode 規律再利用）
- INV-C fill-only: 空き時間占有のみ・既存を move/trim/remove しない・**重複 add は feasible gate が自動棄却**（生成側も品質のため隙間 pre-check）
- INV-D 聖域保全: preserved/recovery_core/anchored 窓へ置かない（`isPreservedForGeneration` 再利用）
- INV-E 最弱: 生成ノード=advisory/movable・弱なら tentative・locked/critical/protected 禁止
- INV-F status gate: `active` のみ適格
- INV-G evaluator 主権: `CandidateDraft`（metrics 無し）を出し既存 evaluator+gate が判定（**add は instability=0**→feasible/whole_part/overpack で評価）

**fixture（Complete 実装時に用意）**: active+date+window+explicit-duration（配置可）/ duration 無（→no candidate）/ date 無+window 無（→no candidate）/ 弱 confidence（→tentative）/ 非 active（→除外）/ raw text 有（→`SeedPlacement` から排除を assert）/ day 文脈（空日 / 充分な隙間あり / 隙間無→no candidate / recovery_core·anchored 窓→埋めない）。

**PRM/correction 後接続（seam のみ・配線は別 slice）**: 将来 `enrichSeedPlacement(placement, prm, corrections)` が `durationMin` を埋め（durationSource=prm_typical/correction）window を締め PRM 保護窓を off-limits 化。`durationMin:number|null`＋`durationSource` が型変更なしの差込口（`prm-event.ts` 既存）。A1-4-0 は seam のみ設計し PRM 配線はしない。

**A1-4-1 以降の分割案**:
- **A1-4-1**: `SeedPlacement`/`TimeWindow`/`DurationSource` 型 + `buildSeedPlacements`（純粋・構造化のみ・raw 排除）+ 単体テスト。**runtime 未接続・barrel 未追加**。
- **A1-4-2**: `generateComplete`（fill-only `add`・`durationMin=null⇒no candidate`・INV-C/D/E/F）+ テスト。
- **A1-4-3+**: `enrichSeedPlacement`（PRM 配線）。
- **分離**: Build（多 seed から日構築）/ Optimize（feasible 日の品質改善・slackHealth 等が要る）/ R1b（move/cascade Repair）とは別トラック。A1-4-0 はこれらに触れない。

## 4i. A1-4-1 実装（landed）— SeedPlacement 変換・判定の土台（候補生成なし）
`lib/plan/reality/seed-placement.ts`（新規 pure・**barrel 未追加・runtime 未接続**）。A1-4-0 §4h の型/判定を実装。**候補・CandidateDraft・add op は作らない**。
- **型**: `TimeBand`(morning/afternoon/evening) / `TimeWindow {band}`(ソフト・clock 数値なし) / `DurationSource`(seed_explicit/prm_typical/correction/unknown) / `SeedDispositionHint`(place/tentative/skip) / `PlacementGrounding`(strong/weak) / `SeedPlacement {seedRef,date?,window?,durationMin:number|null,durationSource,dispositionHint,confidence,grounding}`。
- **`buildSeedPlacements(seeds) → SeedPlacement[]`**: **active のみ**通す（consumed/expired/rejected 除外）。**PlanSeed から直接** 構造化のみ写す（Gap-2 回避）。`signal`/`desiredAction`(自由文) は読まない（raw 不持込）。
  - `date`=desiredDate（解釈しない）/ `window`=desiredTimeHint 由来（anytime・未指定→undefined）/ `dispositionHint`=actionShape の **enum→enum 決定的写像**（確定→place・探索/委譲→tentative・defer/skip→skip・未指定→place）/ `grounding`=confidence<0.5→weak / `confidence`=clamp01。
  - **`durationMin` は常に `null`・`durationSource`=`unknown`**（PlanSeed に duration 欄が無い・**default duration を付与しない**＝捏造しない）。
- **判定**: `isPlaceable(p)`=`durationMin!=null ∧ >0`（**duration 不明は placeable でない**＝CEO 明示ルール・第一級の保守）。`isTentative(p)`=weak grounding ∨ tentative disposition（push 抑制の材料）。
  - 二軸分離: duration 軸＝placeable / confidence 軸＝grounding。skip/tentative は dispositionHint として材料保持し、結合は将来 Complete。
- **帰結**: PlanSeed に duration 欄が無いため、**実 seed から作った材料は全て placeable=false**（既知状態・PRM が durationMin を埋めて初めて placeable=true 経路が活性化）。
- test（`tests/unit/realitySeedPlacement.test.ts`・**16**）: active filter / 構造化写像 / durationMin=null・unknown / window 写像 / disposition 写像 / grounding 閾値 / **raw 不持込（signal/desiredAction が出力に現れない）** / 入力順 / clamp / isPlaceable(null→false・>0→true・≤0→false・実 seed 全 false) / isTentative。
- **しない（A1-4-1 範囲外）**: generateComplete / CandidateDraft / add op 生成 / default duration / 自由文 parse / LLM / PRM 実接続 / UI・DB・runtime・route・PlanClient / barrel。

## 5. 境界
- 🟢 pure（A1 全体・新規ファイル・barrel 未追加・非 test 参照ゼロ＝production 挙動変更ゼロ）
- 🔴 A1 外: UI / route / PlanClient / DB / Supabase / runtime 接続 / staging smoke / production / push / PR。

## 6. 次 GO 待ち
A1-4-1（SeedPlacement 変換・判定の土台・本書 §4i に **landed**）まで完了。次の **A1-4-2（`generateComplete`: fill-only add・durationMin=null⇒no candidate）は CEO 判断で別 GO**（現状 NO）。A1-4-3+（`enrichSeedPlacement`: PRM 配線で durationMin を埋める）はさらに後。
A1-3-R1b（move/cascade Repair）/ 他 mode（Complete/Build/Optimize）/ A1-2-4b（slackHealth: active window 等が入ってから）/ contextSwitches（domain 等が入ってから）は各別 slice で設計。merge / 統合は CEO 判断待ち。
