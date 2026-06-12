# Reality Graph State Model Addendum（RC1a 追補・docs-only）

- 日付: 2026-06-13 / 作成: 契約管理セッション（CEO 追加監査 2026-06-13 への応答）
- 目的: **RC1 = EventRealityNode compile を「Reality Core の完成」と誤認させない**ための全体像の正本補強。
  Reality Graph の全ノードを定義し、各ノードの既存実装との対応・RC 段割当を固定する
- 位置づけ: 設計書 v0.4 §2.4 / R0.5 guardrail の上位補強。矛盾時は本書 → R0.5 → 設計書の順で新しいものが優先

---

## 0. 中心思想（退化防止の 1 段落）

Aneurasync はユーザーだけを状態化するのではない。**ユーザー・今この瞬間・予定・移動・発話意図・場所候補・選択の未来差分・予測と実績**をすべて計算可能な状態に変える。EventRealityNode はその 1 ノードにすぎない。「1 分単位」は**毎分保存ではなく毎分導出**（store slow / derive fast — 既に W0 から確立済みの哲学を Graph 全体に拡張する）。保存するのは台帳（DayStateRecord）と**意味のある状態変化（SignificantStateChange）だけ**。

## 1. Reality Graph ノード一覧（正本マップ）

| ノード | 役割 | 既存実装（file） | 状態 | RC 割当 |
|---|---|---|---|---|
| **UserState** | ユーザー状態（概念ノード） | 日次台帳 = DayStateRecordV0（`lib/plan/dayState/`）/ 瞬間値 = MomentStateSnapshot（§2） | 台帳 ✅ / 瞬間投影 ⚠️ | RC2a で Snapshot 統合 |
| **DayStateRecord** | UserState の **1 日台帳**（朝の凍結 + 日中更新 + 夜の実績） | `buildDayStateRecord.ts` + localStorage 3 キー | ✅ 実 UI 到達 | 済（W3-W6） |
| **MomentStateSnapshot** | **1 分単位で derive できる**「今この瞬間」 | 時間構造側 = MomentStateV0（14 field・実装済）。user 状態投影との統合が未 | ⚠️ 半分 | **RC2a** |
| **EventRealityNode** | 予定単位の現実ノード | `lib/plan/realityCore/`（RC1a-1c・18 fixtures） | ✅ pure（UI 未接続） | 済（RC1）+ v1 属性は RC3 前 |
| **MovementReality** | 移動・ETA・leave-by・friction | MovementTransition（常時 unresolved）/ transportTypes / **LSAT（数理済）** / movementSegmentOverlay | ⚠️ 供給源なし | **RC4**（外部 API gate） |
| **RequestRealityFrame** | 発話/意図 → 現実候補の入口 | **A1 capture lane に対応物**: `seed-extractor-contract.ts` / `seed-capture-intake.ts` / plan_seeds。input slit は入口のみ | ⚠️ A1 レーンに原型 | **RC5 = A1 と合流**（新規に作らない） |
| **PlaceCandidateReality** | 場所候補の現実評価 | kernel `candidate-generator.ts` / `candidate-evaluator.ts` / empty-day 系（孤立 pure） | ⚠️ 型+pure | **RC5**（MovementReality 後） |
| **RealityDiff / ChangeSet** | 選択した場合の未来差分 | `change-set.ts`（invert/undo/要確認 — 正本確定済み） | ✅ pure（生成器なし） | **RC3** が生成器 |
| **PredictionLedger** | 予測と実績の照合 | estimatesFrozen + NightCheck + gradeNightCheck + plan_night_check_v0 | ✅ 実 UI 到達 | 済（W4-W6） |
| **CorrectionMemory** | 補正の記録と消費 | 記録 ✅（corrections/manualLevels/nextDayPriorAdjustments）/ 消費枠組み = kernel `memory-correction.ts`（verdict 化） | ⚠️ 消費未接続 | **B1**（観測 ≥14 日・kernel verdict 体系へ合流） |
| **AlterConditionViewModel** | UI 用の簡略表示 | **既存 AlterBatteryViewModel + screenViewModel がこの役**（第三の VM を作らない） | ✅ | 済 |

## 2. 1 分単位の状態 — DayStateRecord / MomentStateSnapshot / SignificantStateChange

CEO 指定の 3 区分を正式契約とする:

- **DayStateRecord** = その日の台帳（**保存する**）。朝の凍結（estimatesFrozen）+ 日中の現在値（estimates・補正で更新）+ 夜の実績（nightCheck）
- **MomentStateSnapshot** = **任意の now について 1 分単位で derive できる状態（保存しない）**。純関数:
  `deriveMomentSnapshot(record: DayStateRecordV0, ernNodes: EventRealityNodeV0[], nowHHMM) → MomentStateSnapshot`
- **SignificantStateChange** = 保存・採点対象になる状態変化のみ永続化。現行で既に該当: 初回凍結 / 本人補正・manualLevels / 睡眠・mood 入力 / Night Check 回答 / Reveal 既読。RC2a で追加候補: currentMode 遷移・interventionWindow の open→closing 遷移（**追加は別 GO** — 保存トリガの拡張は「新規データ保存」gate）

**MomentStateSnapshot の最低フィールド（CEO 指定 11）と出自** — 全て既存語彙 + RealityAttribute/ConfidentValue で持つ（裸 JSON スコア禁止）:

| field | derive 元 | RC1 時点 |
|---|---|---|
| energyLevel | record.estimates.energyLevel（補正済み現在値） | ✅ derive 可 |
| recoveryNeed | record.estimates.recoveryNeed | ✅ |
| timePressure | MomentStateV0.timePressure | ✅ |
| interventionWindow | MomentStateV0.interventionWindow | ✅ |
| nextFixedEvent | MomentStateV0.nextFixedEventAt（+ ern の fixedness で精密化） | ✅ |
| departureStatus | ern.departureStatus（unresolved） | ✅（RC1 で供給） |
| mobilityFriction | MovementReality（RC4）まで **unknown 正直** | ⚠️ |
| locationCertainty | ern.placeCertainty（場所解決まで unknown） | ⚠️ |
| receptivity | MomentStateV0.receptivity（silent/on_open/unknown） | ✅ |
| decisionDebt | §4（既存未解決 evidence の集約 — RC2a で derive） | ⚠️ |
| todayMode | record.estimates.dailyMode | ✅ |

→ **RC2a = `deriveMomentSnapshot` 純関数の実装**（新規保存なし・新規 read なし・MomentStateV0 と record と ern の合成のみ）。これで「13:40 に Alter が何を読めるか」が 1 関数で答えられる。

## 3. RC1 の再裁定記録（CEO 監査 2026-06-13 への応答）

**(2) whyUnresolved の単一値懸念** → **実装は当初から複数値リスト**（`ReadonlyArray<LeaveByUnresolvedReason>`）であり、route_missing ∧ eta_source_missing は同時保持される（fixture `["route_missing","eta_source_missing"]` で機械固定済み）。CEO 推奨の primary/missingInputs 分離への対応規約: **配列全体 = missingInputs（完全リスト・eta_source_missing を常に含む）/ 先頭要素 = primaryUnresolvedReason**。フィールド名変更はせず本規約を正本とする。

**(3) delayImpact の扱い** → **omission ではなく意図的保留**を正式記録: RC1 は delayImpact を実装しない（field 自体が存在しない — fixture で `"delayImpact" in node === false` を assert）。RC1 が持つのは構造のみの cascadeSensitivity（debugOnly）。実 impact は RC2/RC3 で具体的 drift / ChangeSet 候補を `recomputeAfterDrift` に渡して初めて判定する。

**(4) stable id の衝突条件** → 検証結果:
- 同日内の同一 anchorId: buildDayGraph が **skip + duplicate_anchor_id warning**（eventNodes.ts:316）→ ern 衝突は構造的に不可能（fixture 済）
- recurring の複数日: ern は date を含むため一意。同一予定の日跨ぎ紐付けは sourceRefs.anchorId 側で可能（fixture 済）
- anchorId の欠落: ExternalAnchor.id は型必須（DB id）— 欠落は型レベルで不可能
- 再 import での id 振り直し: ics は `externalUid`（VEVENT UID）による dedup-update で anchor id が維持される設計（external-anchor.ts:58-66）。image/pdf 再取り込みは新 id になり得る = **既知の限界**として記録（ern は「その取り込み世代の予定」を指す。世代跨ぎ紐付けは externalUid 系の将来課題）。**index fallback は引き続き禁止**
- dayGraphNodeId と anchorId のズレ: EventNode.id は anchor.id 流用（dayGraphTypes 規約）のため一致。万一の乖離にも sourceRefs が両方を保持

**(5) new enum ゼロの例外整理（最終版）**:
1. domain enum（予定・状態の意味論）は新造しない — 既存 kernel/plan/dayState 語彙を優先
2. 許容は 3 種のみ: **provenance lifecycle**（RealityAttributeStatus）/ **safety display**（RealityDisplayPolicy）/ **diagnostic reason**（LeaveByUnresolvedReason）— RC wrapper 語彙であり予定意味論の正本ではない
3. 既存 kernel 語彙で表せるものの再定義は禁止（例: 介入可否を flexibility と別に作らない）

## 4. decisionDebt — 保留しすぎない（derive 定義を確定）

**新しい主観スコアではなく、既存の未解決 evidence の集約指標**として定義する（Reality Graph の正式属性候補）:

```
decisionDebt（derived・RealityAttribute<number 0-1 または件数>）の材料 = 全て既存:
- Night Check followup 未回答（nightCheck.planVerdict undefined ∧ anchorCount>0 — 実装済み信号）
- unresolved place（ern.placeCertainty unknown な予定数 — RC1 で供給済み）
- unresolved time（rigidity 未確定・endTime 欠落 = durationSource "assumed_default" — DayGraph 実装済み）
- pending candidate selection（A1 capture candidate の pending — A1 レーン信号）
- pending confirmation（changeEligibility.requiresConfirmation ∧ 提案保留 — RC3 以降）
- repeated snooze / unconfirmed plan change（drift 記録 — Stage 2 plan_drift_events 後）
```

**割当: RC2a の MomentStateSnapshot に v0 を含める**（現時点で取れる 3 信号 = followup 未回答・unresolved place 数・assumed_default 数から derive。残り材料は供給され次第 additive）。「Alter が決めなきゃいけないことを読めない」状態を RC2a で解消する。

## 5. intentionMass / commitmentGravity — 消さない（derive 定義を確定）

EventRealityNode v1 属性候補として正式登録（**RC3 の「守る/楽/攻める」の前提** — これがないと守るべき予定を区別できない）。裸スコア新造ではなく既存 evidence から derive:

```
intentionMass / commitmentGravity（RealityAttribute<number 0-1>）の材料 = 全て既存 or 承認待ち:
- rigidity（hard/soft）+ protectionReasons（authority.ts — recovery_core/cascade_guard 等）
- otherPeople involvement（verb social/work・companions 配列【migration CEO 承認後】）
- explicit user priority（将来: 本人タップ。当面なし = 捏造しない）
- repeated behavior（anchor の反復出現 — computeProposals の pattern 検出が既存資産）
- reservation/payment（sourceType・sensitiveCategory 由来）
- work/shift context（shift 文脈 — dayState facts.shift）
- user correction / Night Check evidence（その予定に紐づく補正・drift 履歴 — Stage 2 後に充実）
```

関連語彙の整理: userMeaning / promiseWeight / cancelCost / identityRelevance は intentionMass・commitmentGravity の**下位材料または別名**として扱い、独立 field にはしない（語彙乱立防止）。**割当: RC3 着手時の最初の slice（RC3a）として ern v1 に追加**。

## 6. RequestRealityFrame / PlaceCandidateReality / RealityDiff — 本流配置（将来メモにしない）

「明日、成田のスタバで作業したい」の正規ルートを Reality Graph 本流として固定:

```
発話（input slit / 会話）
→ RequestRealityFrame（意図の現実化前状態: desiredAction / areaHint / candidatePlaceNeeded /
   unresolvedQuestions / permissionBoundary — **A1 の seed-extractor-contract / plan_seeds と合流**。
   既存 capture lane が「発話→構造化 seed」をまさに担っており、新規の平行実装を作らない）
→ PlaceCandidateReality（候補×現実条件: travelTime/mobilityFriction/workFit/scheduleFit/recoveryFit/
   fallbackEase — kernel candidate-generator/evaluator + MovementReality(RC4) を材料に）
→ RealityDiff（= ChangeSet + 影響注釈「この候補なら夜の余白は維持」 — change-set.ts 正本）
→ 本人選択（permissionBoundary: user_select_place）→ anchor 化 → EventRealityNode へ
```

**割当: RC5**（依存順: RC4 MovementReality → RC5）。ただし **RequestRealityFrame の契約定義（型と A1 合流方針）は RC5 を待たず docs で固定済み（本節）**。これにより「既存予定の診断ツール」への退化を防ぐ。

## 7. RC ロードマップ（更新版・全ノード配置）

| RC | 内容 | Graph ノード | gate |
|---|---|---|---|
| RC1 ✅ | EventRealityNode compile（`c16a1e28` + 監査 fixture） | EventRealityNode v0 | 済（RC1d は別 GO） |
| **RC2a** | `deriveMomentSnapshot` 純関数（record+MomentStateV0+ern 合成・**decisionDebt v0 含む**・保存なし） | MomentStateSnapshot / UserState 瞬間投影 | pure のみ — 軽 gate |
| RC2b | collapse risk v0（factors/failureModes/trace — 確率禁止・R0.5 §4） | DayRealitySummary | pure |
| RC3a | intentionMass/commitmentGravity（ern v1・§5 の derive） | EventRealityNode v1 | pure |
| RC3b | InterventionEligibility 通過予定への ChangeSet 3 並置（守る/楽/攻める・提示のみ） | RealityDiff 生成器 | N-3 文言監査 |
| RC4 | MovementReality（場所解決 + ETA 分布 → LSAT 起動 → leave-by 解禁） | MovementReality | **外部 API = CEO 承認** |
| RC5 | RequestRealityFrame（A1 capture 合流）→ PlaceCandidateReality → RealityDiff 全周 | Request/Place | A1 レーン調整 |
| B1 並走 | CorrectionMemory 消費（kernel verdict 体系へ合流・観測 ≥14 日） | CorrectionMemory | B1 readiness |

## 8. 退化防止条件（CEO 指定の常設チェックリスト）

- EventRealityNode だけで Reality Core 完成と見なさない（本書 §1 が正本マップ）
- UI 表示を先行しない / fake leave-by を出さない（ern fixture が機械ガード）
- decisionDebt / intentionMass / commitmentGravity を消さない（§4-5 に derive 定義済み・RC2a/RC3a 割当）
- Request/Place/Diff を将来メモにしない（§6 で本流配置・RC5 割当・A1 合流方針確定）
- 1 分単位 MomentStateSnapshot を設計から落とさない（§2 で契約化・RC2a 割当）
- 毎分保存しない（保存は SignificantStateChange のみ — 保存トリガ拡張は別 GO）
