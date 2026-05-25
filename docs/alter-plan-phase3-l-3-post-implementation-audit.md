# Phase 3-L-3 Post-Implementation Audit (= read-only)

**作成日**: 2026-05-22
**承認**: CEO + GPT 合議 (= L-3a/L-3b 着地後、 「freeze 確定は HOLD、 post-implementation audit を挟む」 指示)
**範囲**: L-3a (`8a0a2df4`) + L-3b (`68b569dc`) 着地済実装に対する **runtime 観測ベース** の privacy / mutation / 構造監査

> ⚠️ **本 audit は実装を変更しない**。 監査結果 + L-3c 修正案 (= 実装提案) を docs として残すのみ。
> 実装着手は本 audit + CEO 別 review を経て改めて判断。

---

## 0. Purpose

L-3a/L-3b 完了報告では 161 tests PASS + UI/API/env/DB/package 変更 0 + K regression 0 を確認したが、 GPT は 3 点の critical 懸念を提示:

1. **snapshotId mutation guard の弱さ** (= node 内 mutate しても snapshotId 不変)
2. **transitionKey の anchor id 漏洩可能性** (= node id が anchor id 由来か)
3. **sensitive_adjacent も unresolved になっているか** (= 片方 sensitive で resolve しない設計か)

本 audit はこれらを **runtime 実測** で検証し、 必要な L-3c 修正案を提示する。

---

## 1. 監査結果サマリ (= 6 critical points)

| # | GPT 指摘 | runtime 観測 | 判定 | L-3c 修正必要性 |
|---|---|---|---|---|
| 1 | snapshotId guard の弱さ | `transitions.push` / `node.locationText = "X"` で snapshotId **不変** | ❌ **実害あり** | **必須** |
| 2 | transitionKey 経由の anchor id 漏洩 | `transition_0_move_morning_move_afternoon` — anchor id 完全一致 | ❌ **実害あり** | **必須** |
| 3 | sensitive_adjacent unresolved 保証 | sensitive_adjacent input で cascade **resolved=25min** を返した | ❌ **実害あり** | **必須** |
| 4 | provider trace の PII 含有 | trace は `attemptedProviders` + `decidedBy` 等の literal id のみ | ✅ **safe** | 不要 |
| 5 | manual_user override payload | `ManualOverride = { userDurationMin, userMode? }` — number + enum literal のみ | ✅ **safe** | 不要 |
| 6 | overlay result の locationText 漏洩 | `segment.fromLocationText: "新宿"` 等、 raw 値が含まれる | ❌ **実害あり (新発見)** | **必須** |

**結論**: 6 点中 **4 点が実害あり**。 L-3c 修正案を必須とする。

---

## 2. Critical 1: snapshotId mutation guard 弱さ

### 2.1 GPT 指摘

> `graph.snapshotId` を before/after で見るだけなら、 nodes 配列や node 内部を mutate しても snapshotId 文字列は変わらない可能性が高い。

### 2.2 runtime 観測

`/tmp/l3-post-audit-experiment.test.ts` (= temp file、 commit 除外) で実測。

**CASE A**: `graph.transitions.push({...})` を試行
- 結果: push が **成功** (= `ReadonlyArray<T>` は TypeScript 型レベル防御のみ、 runtime は通常 array)
- `transitions.length`: 1 → 2 に増加
- `snapshotId` 変化: **false** (= 不変)

**CASE B**: `graph.nodes[0].locationText = "MUTATED"`
- 結果: 代入が **成功** (= readonly field も TypeScript 型レベルのみ)
- `snapshotId` 変化: **false**

### 2.3 根本原因

`computeSnapshotId(date, anchorIds, startTime, endTime, minGapMinutes)` (= `buildDayGraph.ts:109`) は **入力 anchor の id 配列**から計算される deterministic 文字列。 graph の **内部状態** (= nodes / edges / transitions の中身) を反映しない。

→ snapshotId 比較は「同じ anchor 集合から build したか?」 の検出には使えるが、 「graph が overlay 内で mutate されたか?」 の検出には **使えない**。

### 2.4 影響範囲

- 既存 test §3 「snapshotId 不変」 は **runtime 保証として無意味** (= test fixture が overlay 内で mutate されない実装になっているだけ)
- 既存 test §3 「参照同一性」 は配列 swap を検出するが、 配列内部 mutate は検出しない
- 既存 test §3 「JSON 全体比較」 は **test 内で deep equal** しているが、 これは test だけの保証であり、 **実装の runtime assertion ではない**
- 実装の runtime assertion (= overlay 内の `snapshotIdBefore !== snapshotIdAfter` check) は通らない

### 2.5 L-3c 修正案

**修正案 1A**: overlay 内 assertion を JSON snapshot 比較に強化

```typescript
// L-3c-1: overlay 内 graph immutability assertion 強化
const graphSnapshotBefore = JSON.stringify(input.graph);
// ... overlay 処理 ...
if (JSON.stringify(input.graph) !== graphSnapshotBefore) {
  throw new MovementOverlayMutationError(
    "Overlay violated graph immutability: deep structure changed",
  );
}
```

- **長所**: 完全 deep equality、 any 内部 mutation を検出
- **短所**: JSON.stringify cost (= 通常 graph 数 KB、 stringify <1ms、 acceptable)
- **代替**: `structuredClone` + deep equal (= cost ~同等)

**修正案 1B**: 加えて、 cheap な早期検出として配列長 + 第一/最後要素 reference 同一性も維持

```typescript
const transitionsLengthBefore = input.graph.transitions.length;
const nodesLengthBefore = input.graph.nodes.length;
const firstNodeRefBefore = input.graph.nodes[0];
// ... overlay 処理 ...
if (
  input.graph.transitions.length !== transitionsLengthBefore ||
  input.graph.nodes.length !== nodesLengthBefore ||
  input.graph.nodes[0] !== firstNodeRefBefore
) {
  throw new MovementOverlayMutationError("Shallow mutation detected");
}
```

- **推奨**: 1A + 1B 両方 (= 1A は完全性、 1B は早期検出)

---

## 3. Critical 2: transitionKey 経由の anchor id 漏洩

### 3.1 GPT 指摘

> `transition_${index}_${fromNodeId}_${toNodeId}` で、 もし `fromNodeId / toNodeId` が anchor id 由来なら、 これは anchor id を結果に含めているのと近い。

### 3.2 監査 (= K phase 実装の読み取り)

`lib/plan/dayGraph/eventNodes.ts:265`:
```typescript
const node: EventNode = {
  id: anchor.id,             // ← EventNode.id = anchor.id (= 完全一致)
  ...
  anchorId: anchor.id,        // ← 同値で 2 つ持つ
  ...
};
```

`lib/plan/dayGraph/movementTransitions.ts:78-86`:
```typescript
transitions.push({
  fromNodeId: prev.id,        // ← anchor id
  toNodeId: next.id,           // ← anchor id
  ...
});
```

→ **`EventNode.id === anchor.id`** が構造的事実。 transitionKey に anchor id が 2 つ含まれる。

### 3.3 runtime 観測

MOVEMENT fixture (= anchor id: `move_morning`, `move_afternoon`, `move_evening`) で:

```
transitionKey: transition_0_move_morning_move_afternoon
  fromNodeId: move_morning (= anchor id? true)
  toNodeId: move_afternoon (= anchor id? true)
```

→ **anchor id が transitionKey に完全露出している**。 overlay result を log に出した時点で anchor id が記録される。

### 3.4 影響範囲

- `OverlayResult.segmentsByTransitionKey` の各 key に anchor id × 2 が直接含まれる
- 将来 telemetry sink (= L-4+) でこの key を集計に使うと anchor id が export される risk
- L-1 の `MovementResolutionTelemetry` 型は title/locationText/userId/anchorId field を持たないが、 transitionKey 自体に anchor id が含まれていれば「PII-free structural」 は破綻

### 3.5 設計トレードオフ

K phase の `MovementTransitionView.key = transition_${index}_${fromNodeId}_${toNodeId}` (= `dayGraphTimelinePresentation.ts:285`) と同形式にすることで「K view と join 可能」 という利点を狙ったが、 これは **K view 自身も anchor id を含む** という事実を表面化させた。

K view は client-side render の即時 use のみ (= persist しない、 log に出さない) で許容されている。 L-3 overlay の result は将来 telemetry sink で集計される素材なので、 **より厳しい standard** が必要。

### 3.6 L-3c 修正案

**修正案 2A**: transitionKey を非 PII ordinal に変更

```typescript
// L-3c-2: transitionKey を非 PII 化
export function buildTransitionKey(
  transition: MovementTransition,
  index: number,
): string {
  return `transition_${index}`; // anchor id 含まない、 index のみ
}
```

- **長所**: 完全に PII-free
- **短所**: 同 graph 内 unique のみ、 graph 跨ぎでは衝突可能
- **対策**: overlay は単一 DayGraph に対する処理なので、 同 graph 内 unique で十分

**修正案 2B**: K view との join のため、 別 helper を提供

```typescript
// L-3c-2: K view との join 用 helper (= caller が必要なら使う)
import type { MovementTransitionView } from "@/lib/plan/dayGraph/dayGraphTimelinePresentation";

/**
 * K phase の MovementTransitionView を L overlay の transitionKey に変換する bridge。
 *
 * MovementTransitionView.key の形式: `transition_${index}_${fromNodeId}_${toNodeId}`
 * 本 helper は index 部分のみを抽出して L overlay の `transition_${index}` 形式に変換する。
 */
export function bridgeTransitionKey(viewKey: string): string {
  // "transition_${index}_..." → "transition_${index}"
  const match = /^transition_(\d+)_/.exec(viewKey);
  if (!match) return viewKey; // fallback (= K view 形式が変わった場合)
  return `transition_${match[1]}`;
}
```

- **設計**: K view が anchor id を含む(私的責任、 render のみ)、 L overlay は anchor id を含まない(永続化責任)、 bridge で接続
- **代替**: caller が `(transition, index)` 両方を持っているので、 `buildTransitionKey(transition, index)` を直接呼び合わせるだけで十分 (= bridge 不要)

**推奨**: 修正案 2A 採用、 修正案 2B (= bridge helper) は caller が直接 join する pattern が成立するなら不要

---

## 4. Critical 3: sensitive_adjacent も unresolved

### 4.1 GPT 指摘

> 今回の条件は sensitiveProximity なら unresolved です。 両方 sensitive だけでなく、 片側だけ sensitive でも情報漏洩 risk。 sensitive_adjacent も sensitive_both も resolve 禁止が安全。

### 4.2 runtime 観測

`runCascade({ resolution: { privacyClass: "sensitive_adjacent", ... }, ... })` 実行:

```json
{
  "ok": true,
  "segment": {
    ...
    "estimatedDurationMin": 25,
    "privacyClass": "sensitive_adjacent",
    "distanceM": 6078.215858665031
  },
  ...
}
```

→ sensitive_adjacent input で cascade は **resolved = 25min を返した**。 GPT 懸念通り、 片方 sensitive で resolve できてしまう。

### 4.3 根本原因

`cascadeOrchestrator.ts:226-238`:
```typescript
if (input.resolution.privacyClass === "sensitive_both") {
  return { ok: false, reason: "sensitive_proximity", ... };
}
if (input.resolution.privacyClass === "location_unknown") {
  return { ok: false, reason: "location_unknown", ... };
}
```

→ early-exit gate に **`sensitive_adjacent` が含まれていない**。

各 provider 内 guard (= heuristic / manual_user) も `sensitive_both` のみ check しているため、 sensitive_adjacent はそのまま resolve される。

### 4.4 K phase の sensitiveProximity 細分化問題

`movementTransitions.ts:76`:
```typescript
const sensitiveProximity = prev.sensitive || next.sensitive;
```

→ K phase の `sensitiveProximity` は **「前後どちらか sensitive」** の OR。 「両方 sensitive」 か「片方 sensitive」 は K 内で区別されない。

overlay の `computeDefaultPrivacyClass`:
```typescript
if (transition.sensitiveProximity) {
  return "sensitive_both";
}
```

→ 全 sensitive proximity transition を `sensitive_both` ラベルで mapping している (= **保守的に倒している**)。

これにより overlay 経由なら sensitive_adjacent は実は cascade に到達しない (= overlay で「sensitive_both ラベル」 に倒される)。 cascade に sensitive_adjacent input が来るのは:
- caller が cascade を直接呼ぶ場合
- 将来 caller が「`sensitiveByAnchorId` map を提供して細分化したい」 と思った場合
- type 定義に sensitive_adjacent が公開されているため、 外部 caller が誤入力する可能性

→ **type system の clarity が低い**。 type に書いてある状態が実は resolve 禁止のはずなのに、 構造的にはガードされていない。

### 4.5 L-3c 修正案

**修正案 3A**: cascade early-exit に sensitive_adjacent を追加

```typescript
// L-3c-3: cascade early-exit gate 強化
if (
  input.resolution.privacyClass === "sensitive_both" ||
  input.resolution.privacyClass === "sensitive_adjacent"
) {
  return {
    ok: false,
    reason: "sensitive_proximity",
    trace: buildTrace([], "none", "sensitive_proximity"),
  };
}
```

- **長所**: 「sensitive (= 片方 / 両方) は resolve しない」 を **構造的に保証**
- **影響**: 既存 cascade 22 tests のうち sensitive_adjacent を期待挙動とする test はない (= regression なし)

**修正案 3B**: doc に「sensitive_adjacent も resolve 禁止」 を明示

- L-1 `transportTypes.ts` の `MovementPrivacyClass` doc に「sensitive_adjacent も cascade は resolve しない」 を追記
- 「両方 sensitive と片方 sensitive を細分化したい場合は別 phase で再設計」 を明記

**推奨**: 修正案 3A + 3B 両方採用

---

## 5. Critical 4-5: provider trace / manual_user override (= safe 確認)

### 5.1 Critical 4: provider trace

```typescript
export interface CascadeTrace {
  readonly attemptedProviders: ReadonlyArray<TransportProvider>;
  readonly decidedBy: TransportProvider;
  readonly earlyExitReason?: MovementUnresolvedReason;
}
```

- `attemptedProviders`: `TransportProvider` literal id のみ (= "google_routes" / "heuristic_distance" / "manual_user" / "none")
- `decidedBy`: 同上
- `earlyExitReason`: `MovementUnresolvedReason` literal のみ

→ **PII 一切なし**、 全 field は controlled literal。 既存 test §5 (= `cascadeOrchestrator.test.ts` の Trace shape PII-free) で確認済。

**判定**: ✅ safe、 L-3c 修正不要。

### 5.2 Critical 5: manual_user override

```typescript
export interface ManualOverride {
  readonly userDurationMin: number;
  readonly userMode?: TransportMode;
}
```

- `userDurationMin`: number (= validation で finite + non-negative)
- `userMode`: `TransportMode` literal (= "walking" / "driving" / "transit" / "flight" / "unknown")

→ **PII 一切なし**、 raw location / title / userId 含まない。 manual_user provider 内も同 input を直接読むだけ。

**判定**: ✅ safe、 L-3c 修正不要。

---

## 6. Critical 6: overlay result の raw locationText 漏洩 (= 新発見)

### 6.1 監査 (= 既存実装の追跡)

L-1 `transportTypes.ts:175`:
```typescript
type MovementSegmentBase = Omit<MovementTransition, "timingStatus">;
```

→ `MovementSegmentBase` は K phase の `MovementTransition` から `timingStatus` を Omit したもの。 つまり以下を継承:
- `fromNodeId`
- `toNodeId`
- `fromLocationText?` (← **raw locationText、 sensitive proximity なら undefined**)
- `toLocationText?` (← 同上)
- `sensitiveProximity`

`MovementSegmentResolved` / `MovementSegmentUnresolved` は両方 `MovementSegmentBase` を継承するため、 **両者とも raw locationText を保持できる**。

L-2 heuristic provider (`heuristicDistanceProvider.ts:166-168`):
```typescript
const segment: MovementSegmentResolved = {
  fromNodeId: base.fromNodeId,
  toNodeId: base.toNodeId,
  fromLocationText: base.fromLocationText,  // ← raw が転写される
  toLocationText: base.toLocationText,       // ← 同上
  ...
};
```

→ heuristic provider は base から **raw locationText を MovementSegmentResolved に転写**。 manual_user provider も同様。

L-3b overlay (`movementSegmentOverlay.ts` 内 `resolveSingleTransition`):
```typescript
segmentBase: {
  fromNodeId: transition.fromNodeId,
  toNodeId: transition.toNodeId,
  fromLocationText: transition.fromLocationText,  // ← raw を渡す
  toLocationText: transition.toLocationText,
  sensitiveProximity: transition.sensitiveProximity,
},
```

→ overlay は K の transition から raw locationText を抽出して provider に渡し、 結果に転写されている。

### 6.2 runtime 観測

LIGHT fixture (= 非 sensitive、 location: 新宿 / 渋谷) で overlay 実行:

```json
{
  "fromNodeId": "light_a",
  "toNodeId": "light_b",
  "fromLocationText": "新宿",
  "toLocationText": "渋谷",
  "sensitiveProximity": false,
  "timingStatus": "resolved",
  "estimatedDurationMin": 25,
  ...
}
```

→ **raw locationText (= 新宿 / 渋谷) が overlay result に直接含まれる**。 JSON 全体検索:
- "新宿" 含有: **true**
- "渋谷" 含有: **true**
- "light_a" / "light_b" (= anchor id) 含有: **true**

### 6.3 影響範囲

- L-1 で type-level に「PII-free structural」 を主張していたが、 `MovementSegmentBase` 経由で raw locationText を持てる構造になっていた (= type 自体は L 拡張時に許容したが、 doc / test では捕捉していなかった)
- overlay result を telemetry sink (= L-4+) で永続化すると、 「新宿」「渋谷」 等の raw location 名が log に残る
- sensitive proximity = true な transition は K phase で `fromLocationText = undefined` になるが、 sensitive proximity = false (= 大半) は raw 値が直接 export される

### 6.4 設計の本質的問題

「**MovementSegment が L view 用の表示 data を持つべきか、 L observation 用の構造 data だけを持つべきか**」 の責任分離が曖昧。

- A. **L overlay は observation layer (= duration / mode / source の観測)**、 location 表示は K view に任せる
- B. **L overlay は表示 data も持つ (= 「東京駅 → 新宿駅 約 30 分」 を一括で出す)**、 sensitive のみ undefined

A が Mobility Truth Layer 思想と整合し、 privacy structural にも近い。 但し L-1 type 設計時に B 寄りに作ってしまった。

### 6.5 L-3c 修正案

**修正案 6A (= 推奨)**: overlay output 段階で locationText を必ず undefined 化

```typescript
// L-3c-6A: overlay は location 情報を持ち出さない
// MovementSegment を返す前に locationText を強制 undefined
const sanitizedSegment: MovementSegmentResolved = {
  ...segment,
  fromLocationText: undefined,
  toLocationText: undefined,
};
return { ok: true, segment: sanitizedSegment, trace: result.trace };
```

- **長所**: overlay layer の責任を duration / mode / source 観測のみに絞る (= 思想整合)
- **影響**: caller は K view から location 名を取得する必要がある (= transitionKey で join)
- **追加 test**: overlay 出力に raw locationText が含まれないことを assertion

**修正案 6B**: L-1 type を変更して `MovementSegmentResolved/Unresolved` から `fromLocationText/toLocationText` field を削除

```typescript
// L-3c-6B: L-1 type を修正
export interface MovementSegmentResolved {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly sensitiveProximity: boolean;
  readonly timingStatus: "resolved";
  // fromLocationText / toLocationText を削除
  ...
}
```

- **長所**: 型レベルで PII-free 保証、 構造的不可能性
- **短所**: L-1 freeze 違反 (= type 後方互換破壊)
- **判定**: L-1 freeze 規約と「**privacy is structural**」 思想のトレードオフ

**推奨**: 修正案 6A (= overlay 段階で sanitize)。 L-1 freeze 規約を維持しつつ runtime で structural privacy を実現。 但し doc に「MovementSegment 自体は locationText を持てる構造だが、 overlay layer は持たせない契約」 を明記。

長期: L-4+ で type を整理する際に修正案 6B (= type-level 削除) も検討余地あり。

---

## 7. L-3c 修正案サマリ

| # | 修正対象 | 提案 | 必要性 |
|---|---|---|---|
| 1A | `movementSegmentOverlay.ts` | snapshotId 比較を **`JSON.stringify` snapshot 比較** に強化 | 必須 |
| 1B | 同上 | 配列長 + 第一要素 reference 同一性 check を **早期検出** として追加 | 推奨 |
| 2A | `movementSegmentOverlay.ts` | `buildTransitionKey` を `transition_${index}` 単独に変更 | 必須 |
| 3A | `cascadeOrchestrator.ts` | early-exit gate に **`sensitive_adjacent` を追加** | 必須 |
| 3B | `transportTypes.ts` doc | sensitive_adjacent も resolve 禁止を明記 | 推奨 |
| 6A | `movementSegmentOverlay.ts` | overlay 出力段階で `fromLocationText/toLocationText` を強制 undefined 化 | 必須 |

**実装 scope (= 提案)**: L-3c sub-phase として独立 branch、 ~15-20 tests 追加 (= 各修正の verification + regression)、 既存 K phase / L-1 / L-2 file 変更 0、 L-3a 軽微修正、 L-3b 修正中心。

---

## 8. STOP 条件 / 永続禁止

### 8.1 L-3c 着手前 必須クリア

| STOP 条件 | 確認方法 |
|---|---|
| L-3c は L-3a/L-3b の **privacy / mutation 強化のみ** | scope 越境禁止 |
| L-1 type 変更なし (= freeze 維持) | 修正案 6B は L-3c 範囲外、 別 phase |
| K phase 既存 file 変更なし | git diff 検証 |
| 新 env / API / DB / dependency 追加 0 | git diff 検証 |
| K-3c-iii 視覚階層維持 (= UI 変更なし) | grep 検証 |
| 既存 161 tests 全件 PASS 維持 (= regression 0) | vitest 実行 |

### 8.2 永続禁止 (= 本 audit 着地以降に維持)

- ❌ L-4 以降の着手
- ❌ UI 変更
- ❌ geocode active call
- ❌ DB / env / package / dependency 変更
- ❌ localStorage
- ❌ runtime telemetry sink 実装
- ❌ Arrival Risk Memory
- ❌ warning / recommendation / optimization 文言
- ❌ fetch / push / gh
- ❌ reset / restore / stash / branch delete
- ❌ frozen branches への commit (= 17 frozen branches)

---

## 9. CEO 判断ポイント

| Q | 内容 | 推奨 |
|---|---|---|
| Q1 | L-3a/L-3b の **freeze は HOLD** (= 解除して L-3c 着手するか) | YES (= 既存 161 tests PASS だが、 4 critical 実害あり) |
| Q2 | L-3c 着手承認? | YES (= snapshotId / transitionKey / sensitive_adjacent / locationText 4 修正必須) |
| Q3 | L-3c scope は §7 の 6 修正案で正しいか? | YES / 一部削減 / 一部追加 |
| Q4 | 修正案 6A (= overlay 段階 sanitize) vs 6B (= L-1 type 削除) のどちらを採用? | **6A 推奨** (= L-1 freeze 維持) |
| Q5 | L-3c branch を別途切る (= `feat/alter-plan-phase3-l-3c-privacy-mutation-hardening`)? | YES |

---

## 10. 関連 docs / 着地条件

- `docs/alter-plan-phase3-l-transport-design.md` v0.2 (= L 全体 design)
- `docs/alter-plan-phase3-l-0-readiness-audit.md` (= L-0 readiness、 wording 補正済)
- `docs/alter-plan-phase3-l-3-readiness-audit.md` (= L-3 pre-implementation audit)
- `docs/decision-log.md` (= 2026-05-22 L-3a/L-3b 着地 entry)

### 10.1 着地条件

- **本 audit 着地と同時に** `docs/plan-phase3-l-3-post-implementation-audit` branch を **frozen 扱い** (= 18 frozen branches 計)
- 以後の commit 禁止
- L-3a/L-3b branch (= `feat/alter-plan-phase3-l-3a-l-3b-cascade-overlay`) の freeze 状態は **HOLD** (= L-3c 修正を受ける前提、 完全 freeze は L-3c 着地後)
- 次は CEO 判断 (= §9) に基づき、 L-3c 実装 branch を別途切る

---

## 11. 思想の transmission (= 本 audit から学ぶこと)

1. **「161 tests PASS」 = privacy 保証ではない** — coverage gap が露呈した
2. **type-level structural 主張は runtime test で裏取りが必須** — L-1 type を「PII-free」 と書いただけでは保証にならない
3. **Privacy is structural** — 「型で持てない」 を実現するには L-1 type と overlay sanitize の両方が必要
4. **K phase の sensitiveProximity 細分化が L 設計に影響** — K で「片方/両方」 区別しなかった選択が L で再浮上
5. **mutation guard は cheap check + deep check の二重構造が安全** — snapshotId だけでは不十分

L-3c は **「161 tests PASS + 4 critical 実害」 を「~180 tests PASS + 0 critical」 へ昇格させる修正**である。
