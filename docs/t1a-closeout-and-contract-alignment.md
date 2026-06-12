# T1A closeout + contract alignment（docs-only）

**作成日**: 2026-06-12
**ステータス**: docs-only。実装なし（コメント文言訂正のみ・型/構造不変）・runtime ロジックなし・LLM/slot 抽出なし・DB/migration/route/server action/service_role 配線なし・UI なし・Travel runtime なし・M2-B-2 配線なし・liveCollector L-1/L-2/L-3 なし・production/push なし。local only。
**目的**: T1A core types が CoAlterPlanSession / `/plan` CoAlter タブ契約 / M2 PersonalizationPort / 将来 Travel runtime / 旧 `/talk` pair state / Culcept relation データとどう関係するかを明文化する。
**関連**: [travel-mode-plan-os-extension-design.md](travel-mode-plan-os-extension-design.md) / [coalter-plan-tab-backend-contract-draft.md](coalter-plan-tab-backend-contract-draft.md) / [m2-personalization-port-design.md](m2-personalization-port-design.md)

---

## Part 1: T1A closeout summary

### §1.1 完了ファイル / commit

| commit | ファイル | 種別 |
|---|---|---|
| `44c0a1f1` | `lib/shared/travel/core-types.ts`（新規）+ `tests/unit/travelCoreTypes.test.ts`（新規・9 tests） | feat（pure types） |
| 本書と同 commit | 上記 2 ファイルの**コメント文言訂正のみ**（CEO 訂正: 「3 external/session source カテゴリ + self」）。型・構造・as-const 値は不変 | docs/comment |

### §1.2 core types が保証すること

1. **domain-neutral**: travel core は CoAlter / 旧 talk / Culcept のいずれにも import 依存しない（grep 実証: lib/app からの参照 0）。
2. **source-agnostic な participant**: `ParticipantSourceRef` の discriminated union で、participant の出自を **3 つの external/session source カテゴリ（talk_pair_member / culcept_relation / plan_session）+ first-party の self** に分離。travel core は `kind` を解釈しない。**旧 `coalter_pair_states` を identity モデルと仮定しない**。
3. **solo + pair の両対応**: `TravelCorePlan.participants` は 1〜2 名。
4. **pure types + as-const data のみ**: 関数 0・I/O 0・runtime import 元 0（未配線）。as-const 配列が値ドメイン（Pace/severity/axis/transport/activity/uncertainty/mode/source kind）の正本で、網羅性テストで lock。
5. **決定論**: 時刻は「その日の 00:00 からの分」（`startMin`/`endMin`）。`Date`/絶対時刻/Date.now を型に持たない。日付は caller 注入の ISO 文字列。
6. **18 アイデアの型化**（T1A 範囲）: Itinerary Graph(1) / CSP severity(5,13) / Pareto tradeoff(3) / Fatigue load(6) / Budget band(7) / Uncertainty(8) / Anchor-and-Wander(15) / Reversal cost(18) / 説明 privacy 二層 = `ViewerScopedRationale` + `Visibility`（M5）。

### §1.3 意図的にやらないこと（T1A スコープ外）

| やらない | 担当 |
|---|---|
| preference / trait / energy / 予算感 等の personalization データ保持 | M2（PersonalizationPort）|
| LLM / intent / slot 抽出 | T2 |
| solver / scoring / 制約充足の計算 | T3+ |
| 候補比較 diff(14) / fairness(4,12) / temporal map の型 | T4 |
| 永続化スキーマ / DB shape | runtime/migration phase（HOLD）|
| place / route の解決（座標・営業時間・経路） | 外部（Google Places 等・T3+）|
| **source kind からの推論**（誰が partner か・consent 状態・優先度 等） | §2.3 参照（してはならない）|

---

## Part 2: Contract alignment

### §2.1 `CoAlterPlanSession.participants` → `TravelCorePlan.participants` のマッピング

層の区別:
- **CoAlterPlanSession** = セッション / 射影層の状態（chat 面と plan 面の 2 projection・per-viewer payload。[UI 契約ドラフト](coalter-plan-tab-backend-contract-draft.md)）。
- **TravelCorePlan** = domain-neutral な**エンジン中核**の状態。CoAlter/plan/solo の各 surface がこれを consume。

```
CoAlterPlanSession（射影層）            TravelCorePlan（domain core）
  participants: SessionParticipant[]  ─►  participants: TravelParticipant[]
  mode: "daily" | "travel"            ─►  scope.mode
  window                              ─►  scope.window（single_day / range）
  conditions: SharedCondition[]       ─►  candidates[].constraints: TravelConstraint[]
  candidates: PlanCandidate[]         ─►  candidates: TravelCandidate[]
  (pace)                              ─►  pace?
```

**重要な契約進化（flag）**: UI 契約ドラフト初版は `pairStateId: string | null` を持っていた。CEO 注記により、これは **identity モデルではなく `talk_pair_member` という 1 つの source kind に降格**する。CoAlterPlanSession は `pairStateId` 単独ではなく `participants[]`（各々が `ParticipantSourceRef` を持つ）でモデル化されるべき。`pairStateId` が必要な参加者は `source = { kind: "talk_pair_member", pairStateId, userId }` として表現される。→ UI 契約ドラフトの該当箇所は、UI 完成・契約合意の段階で本整合に更新する（本書では docs 上の整合方針提示のみ。ドラフト改訂は契約承認後）。

各 SessionParticipant → TravelParticipant の写像は **1:1**:
`{ participantId（セッション内ローカル ID）, source: ParticipantSourceRef, displayLabel? }`。

### §2.2 `ParticipantSourceRef` が表現すべきもの（4 ケース）

| ケース | 表現 | 意味 |
|---|---|---|
| **self**（first-party） | `{ kind: "self", userId }` | 当事者本人。単独利用 or セッション主体。**external partner source ではない** |
| **旧 `/talk` pair member** | `{ kind: "talk_pair_member", pairStateId, userId }` | `pairStateId` が `coalter_pair_states` を参照。consent/有効性は別途（M2-B-1）検査 |
| **Culcept relation** | `{ kind: "culcept_relation", relationId, userId }` | Culcept 側の partner / relationship レコード由来 |
| **plan session participant** | `{ kind: "plan_session", planSessionId, userId }` | 新 `CoAlterPlanSession` 由来 |

いずれの kind も `userId` を持つ（personalization 参照の鍵）。`talk_pair_member`/`culcept_relation`/`plan_session` の 3 つが **external/session source カテゴリ**、`self` は first-party。

### §2.3 source kind から **推論してはならない**もの

- **traits / preferences / 予算感 / 疲れ方**: kind に関係なく `userId` 経由で M2 から取得する（kind は preference の出所ではない）。
- **consent / pair 有効性**: `talk_pair_member` であっても「enabled かつ相互同意」は **M2-B-1 `getPairSnapshotsForEngine` が前置検査**する。kind から consent を仮定しない。
- **privacy / visibility**: 可視性は `TravelConstraint.visibility` と `ViewerScopedRationale` が持つ。source kind から導出しない。
- **「誰が partner か」「誰が主役か」**: 関係的フレーミング（self vs partner の相対関係）は上位層の責務。core は participantId の平場として扱う。
- **fairness 重み / 優先度**: fairness は別台帳（T4・`coalter_fairness_ledger`）。kind から優先度を決めない。
- **どの surface（chat/plan）で render するか**: 射影層の責務。

### §2.4 Travel core が source-agnostic でなければならない理由

1. **同一エンジンで全 source を捌く**: solo・旧 /talk pair・Culcept relation・新 plan session を分岐なしで処理できる（core が kind を読まないため）。
2. **identity サブシステムの churn から core を隔離**: 旧 /talk は将来退役し得る、Culcept relation は進化し得る。core が特定 identity モデルに依存すると、その変更が core に波及する。
3. **L-0 で発見したバグクラスの予防**: 「単一 identity モデルを仮定する」ことが silent 欠落の温床だった。source 抽象化はこれを構造的に防ぐ。
4. **テスト容易性**: pair/relation インフラを立てずに fake participant でテストできる（T1A test §2-§3 で実証済み）。

---

## Part 3: M2 との境界

| 規則 | 内容 |
|---|---|
| T1A は participant **identity / source を参照してよい** | `participantId` と `ParticipantSourceRef`（内に `userId`）を型として持つ |
| T1A は personalization を **読まない** | core-types.ts は `lib/shared/personalization` を import しない（grep 実証）。traits/PlanParams を型に持たない |
| traits / plan params の正本は **M2** | `getPersonalizationSnapshot` / `derivePlanParams` / `getPairSnapshotsForEngine`（M2-A/M2-B-1）|
| travel core → M2 runtime への **直接依存なし** | 下記ブリッジは上位 orchestration 層（T3+）に置く |

**ブリッジの形（将来・T3+ で実装・本書は設計位置の明示のみ）**:
```
上位 orchestration（T3 候補生成）:
  for participant in TravelCorePlan.participants:
     userId = participant.source.userId
     snapshot = M2.getPersonalizationSnapshot(client, userId, asOf)   // または pair は getPairSnapshotsForEngine
     planParams = M2.derivePlanParams(snapshot)
  → これらを **candidate 生成の入力**として使う（traits → itinerary の写像は solver の責務）
  → 結果の TravelCandidate には traits を埋め込まない（rationale には反映してよいが生スコアは持たない）
```
つまり M2 と travel core は「**隣り合って consume される**」関係であり、「core が M2 に依存する」関係ではない。

---

## Part 4: UI との境界

| 規則 | 内容 |
|---|---|
| UI は fixture / session データを **render してよい** | [UI 契約ドラフト](coalter-plan-tab-backend-contract-draft.md) の `CoAlterPlanSession` 射影（chat 面 / plan 面）を mocked data で描ける |
| UI は旧 `/talk` pair state に **依存してはならない** | `pairStateId` を直接 identity として参照しない。participant は `participants[]` 経由（§2.1 の契約進化） |
| UI は契約承認後に `CoAlterPlanSession` へ **bind できる** | per-viewer payload・one session two projections・モード=スコープパラメータ（ドラフトの中核原則）を保ったまま |
| private 露出の防止 | per-viewer 射影の出口で `assertNoEngineOnlyLeak`（M2-B-1）を通す前提。生 trait/private constraint を UI payload に載せない |

---

## Part 5: 承認後に可能な次スライス（いずれも明示 GO 必須・本書では未着手）

| 候補 | 内容 | 性質 |
|---|---|---|
| **T1B** pure constraint / normalization helpers | TravelConstraint の descriptor パース、severity 比較、BudgetBand 正規化、時刻ユーティリティ等の **pure 関数**（runtime/IO なし・型に対する純変換のみ） | additive・pure・runtime 抽出なし |
| **T2** intent / slot 抽出 **設計のみ** | チャット/会話 → per-person slots（destination/date/budget/pace/red-lines）の抽出**設計** docs | docs-only（**runtime 抽出は不可**）|

**いずれも「runtime 抽出（LLM 実行 / 実 slot 抽出）」は GO まで行わない。** T1B は pure 関数なら additive で安全、T2 は設計のみ。どちらを先にするかは CEO 判断。

---

## 付記: 本書 commit での実変更（コメント訂正のみ）

`lib/shared/travel/core-types.ts` と `tests/unit/travelCoreTypes.test.ts` のコメント / describe 文言を「3-source」→「3 external/session source カテゴリ + self」に訂正。**型・構造・as-const 値・テスト assert は不変**（tsc 55 不変・9 tests PASS を再確認）。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
