# RD3g-0 — Departure Line Boundary Design（docs-only・実装ではない）

- **status**: 設計確定（docs-only）。**code 変更ゼロ・DB write なし・production gate 未通過**
- **CEO GO**: RD3g-0 Departure Line Boundary Design docs-only（2026-06-19）
- **前提 lineage**: `reality-operator-seed-activation-plan-rd3x-0.md`（RD3x-P1〜P6）→ 本書（RD3g-0）
- **本書の目的**: internal-only の `LeaveByComputationV0` / `leaveByComputed` を、将来ユーザーに「出発線」として見せてよい**条件と境界**を設計する。**exact timestamp 表示の実装はまだ NO GO**。

> ⚠️ これは departure line の**表示境界設計**であって、departure line の実装でも exact timestamp 表示の実装でもない。本書のどの記述も、実装 GO ではない。

---

## 0. 用語と現在地（grounding）

| 記号 | 実体（file） | 性質 |
|---|---|---|
| internal leaveBy computation | `LeaveByComputationV0`（`lib/plan/realityCore/leaveByComputation.ts:89`） | **internal-only**。`status: "computed" \| "uncomputed"`・`leaveByInstant`・`sourceTimeEstimateRef`・`bufferRef`・`originEvidencePresent` を持つ。consumer/copy/notification/departure line/prompt/action でない（同 file docstring §①） |
| walker | `leaveByComputationViolations(c)`（同:228） | computed object の自己整合 walker。adapter は `length>0` なら computed を emit せず uncomputed に倒す（`leaveByAdapter.ts:470`） |
| safe boolean | `leaveByComputedPresent`（`operatorDayPreview.ts`・RD3x-P2/P5/P6） | **schema-state boolean のみ**。「computed leaveBy が ERN に attach されたか」だけ。exact instant/内部 ref は持たない |
| leak guard | `realDayPayloadLeakViolations`（`operatorDayPreview.ts`） | payload に内部 ref/exact instant が混入したら検出（fail-closed）。**現状は exact instant を一律禁止** |
| dev safe status | `AlterDevSafeStatus`（`/plan/dev-alter-tab`・RD3x-P6） | `内部計算オブジェクト: あり/なし（dev観測のみ・Alter）`。boolean だけ受け取る presentational |

**現在到達点**: 実データ → durationValue → RD2e-SUPPLY → computed leaveBy → **safe boolean** → dev-only safe status 表示（RD3x-P6）。**exact instant は一度も surface に出していない**。本書は「ここから先（exact instant を出す世界）」の境界を引く。

---

## 1. Departure Line の定義 — 6 層ラダー（各層は別 gate）

departure line は単一の機能ではなく、**6 つの独立した層**であり、層間の昇格には**それぞれ別の gate**が要る。下の層を通っても上の層は自動では開かない。

```
L0  internal leaveBy computation   … LeaveByComputationV0（internal-only・絶対に出さない）
        │  [gate A: 表示可否=safe boolean 化]
L1  safe boolean                   … leaveByComputedPresent（schema-state のみ・instant なし）★ 現在地
        │  [gate B: exact timestamp 化 = dev-only]
L2  dev-only departure line preview … 内部出発線候補（exact instant あり得る・dev/operator/flag のみ）
        │  [gate C: user-facing 昇格]
L3  user-facing departure line     … 出発目安（product 表示・CEO 承認要）
        │  [gate D: push 化]
L4  notification / prompt          … まだ NO GO
        │  [gate E: 実行化]
L5  action / schedule mutation     … write/send/book/pay（まだ NO GO）
```

### 不変条件（層の混同禁止）

1. **internal computed ≠ user-facing departure line**。`LeaveByComputationV0` は永久に internal-only。user-facing は L2/L3 で別途生成した表示物であり、internal object を直接渡さない。
2. **safe boolean ≠ departure line**。`leaveByComputedPresent=true` は「計算オブジェクトが存在する」だけで、「いつ出るか」を一切含まない。boolean から departure line へは gate B が必要。
3. **exact timestamp 表示は別 gate**（gate B）。safe boolean を出してよいことは、exact instant を出してよいことを意味しない。
4. **notification は更に別 gate**（gate D）。画面に出してよいことは、push してよいことを意味しない。
5. **action/write/send は更に別 gate**（gate E）。通知してよいことは、予定を書き換えてよいことを意味しない。

> 各 gate は **AND で fail-closed**。下層 PASS は上層の必要条件ですらない（上層は固有の追加条件を持つ）。

---

## 2. exact timestamp を表示してよい条件（gate B・全 AND）

L1→L2（exact instant を**dev-only で**出す）に進むには、**以下すべて**を満たすこと。1 つでも欠ければ exact timestamp を出さない（§3 に倒す）。

### 2-A. computation 本体（internal object 由来）
- `LeaveByComputationV0.status === "computed"`（`leaveByComputation.ts:28,157`）
- `leaveByComputationViolations(c).length === 0`（walker green・`leaveByComputation.ts:228` / adapter 最終 gate `leaveByAdapter.ts:470`）
- `sourceTimeEstimateRef !== null`（`leaveByComputation.ts:97`）
- `bufferRef !== null`（同:99）
- `originEvidencePresent === true`（同:101）

### 2-B. 供給 fuel（RD2e-SUPPLY 由来・各 builder が valid を返す）
- **arrivalTarget provenance confirmed**: arrival fixedness `"fixed"` ∧ startTimeProvenance `"confirmed"`（`leaveByAdapter.ts:283-286`。`user_explicit`/`imported_exact` のみ・`leaveBySupply.ts:134-139`）
- **durationValue usable**: 二鍵 binding 後 usable（`leaveByAdapter.ts:380-388`）∧ `timeEstimateUsableForPlanning === true`（`routeEtaCapability.ts` / `routeEtaDurationValue.ts`）
- **bufferPolicy valid**: `buffer.freshness === "valid"` ∧ refs あり（`leaveBySupply.ts:172-174`）
- **originTemporalValidity valid**: previous_event_end の full-AND（`leaveBySupplyOrigin.ts:101-165`）= supportedBoundary(explicit∧¬clipped) ∧ 前 event start ∈ {user_explicit,imported_exact} ∧ instant calendar-valid ∧ prevEnd≤arrival ∧ location≠absent ∧ same subjectiveDate ∧ snapshotId 実在

### 2-C. 由来・鮮度・scope
- **stale でない**（freshness valid・上記 buffer/origin に含む）
- **heuristic 由来でない**（duration が heuristic basis でない）
- **currentLocation 由来でない**（origin は previous_event_end のみ・current 観測を使わない・`leaveBySupplyOrigin.ts:173`）
- **scope 一致**（targetNodeId/subjectiveDate/transportMode/temporalScopeRef が fuel 横断一致・`leaveByAdapter.ts:362-375`）

### 2-D. 表示権限・redaction・host
- **display permission gate 通過**（後述 §6 で定義する surface/permission gate）
- **redaction gate 通過**（sensitive/otherPeople/reservation を露出しない）
- **leak guard 再設計版を通過**（下記注）
- **operator/dev preview ではまず dev-only 表示**（L2 は product でない）

> **leak guard の再設計が必要（重要）**: 現 `realDayPayloadLeakViolations` は exact instant を**一律禁止**している（safe boolean 段階の正しい設計）。L2 で exact instant を**意図的に1つだけ**出すには、現 guard をそのまま外すのではなく、「**sanctioned な単一 instant field のみ許可し、他の内部 ref（`leaveByInstant` 以外の `*Ref`・`timeContract`・`arrivalTargetInstant`・durationValue object 等）は引き続き全面禁止**」する **L2 専用の狭い guard** を新設する。これは RD3g-P1 の実装課題であり、本書では「guard を緩めるのではなく差し替える」方針のみ確定。

---

## 3. exact timestamp を表示してはいけない条件（いずれか該当 → 出さない）

以下のいずれかなら exact timestamp を出さず、**最大でも safe boolean（L1）に留める**。

| 禁止条件 | 接地 |
|---|---|
| heuristic duration | durationBasis が heuristic |
| stale duration / stale origin / stale buffer | freshness ≠ valid（`leaveBySupply.ts:172` 他） |
| scope mismatch | `leaveByAdapter.ts:362-375` |
| origin unknown | originTemporalValidity null（`leaveBySupply.ts:233`） |
| origin conflict | `originConflict === "conflict"`（prevEnd>arrival・`leaveBySupplyOrigin.ts:167`） |
| currentLocation candidate | origin が current 観測由来（previous_event_end 以外） |
| arrival not fixed | fixedness ≠ "fixed"（`leaveByAdapter.ts:283`） |
| startTime provenance inferred/default/unknown | startTimeProvenance ≠ "confirmed"（`leaveByAdapter.ts:286` / `leaveBySupply.ts:134-139`） |
| buffer unknown | bufferPolicy null（`leaveBySupply.ts:172`） |
| time estimate missing | durationValue null / usable=false |
| permission unknown | display permission 未確定 |
| sensitive / otherPeople / reservation / work で表示粒度未裁定 | redaction gate 未裁定 |
| leak guard violation | L2 専用 guard が violation 検出 |
| Feasibility / Risk 未接続または矛盾 | 後段で接続するまで exact は出さない |
| user-facing gate 未通過 | L3 昇格条件（§6）未達 |

**原則**: 迷ったら出さない（fail-closed）。exact timestamp は「全条件が揃った時だけ」現れ、1 つでも崩れたら即 boolean に退避する。

---

## 4. 文言設計

### 禁止語（断定・指示・自動実行を含意するもの）
「間に合います」/「遅れます」/「必ず」/「保証」/「今すぐ出発」/「出発してください」/「自動で変更」/「送信」/「予約」

### 候補文言（層別）
| 層 | 文言 | 承認状態 |
|---|---|---|
| L1 safe boolean | `内部計算オブジェクト: あり/なし（dev観測のみ）` | 実装済（RD3x-P5/P6） |
| L2 dev-only departure line | **`内部出発線候補`** | dev 文言として確定（exact timestamp 文言は CEO 承認後） |
| L3 user-facing 将来 | **`出発目安`** | 文言方向のみ。**exact timestamp を伴う文言は CEO 承認後** |

### 文言の原則
- **断定でなく目安**: 「出発目安」は到着保証でも遅刻判定でもない。Feasibility/Risk 判定（「間に合う/遅れる」）は departure line とは**別軸**であり、本書の対象外（接続は後段・矛盾時は exact を出さない §3）。
- **行動指示でない**: 「出発してください」ではなく「出発目安」。push でも prompt でもない（L4 は別 gate）。
- exact instant を文言に埋め込む形式（例: 「出発目安 17:35」）は **CEO 承認後にのみ**確定。本書では枠だけ用意し、具体フォーマットは未確定とする。

---

## 5. dev-only preview の範囲（次の実装候補 = RD3g-P1 の枠）

L2 を最初に出す場所は**厳密に限定**する。

- **`/plan/dev-alter-tab` のみ**（RD3x-P6 の `AlterDevSafeStatus` と同じ host・三重ガード下流）
- **flag-gated**（既存 `realityOperatorPreviewLeaveBy` とは**別 flag**を新設推奨。safe boolean と exact preview を独立に kill できるようにする。例: `REALITY_OPERATOR_DEPARTURE_LINE_PREVIEW`・default OFF・production OFF・非 `NEXT_PUBLIC_`）
- **operator-only**（auth.getUser + operator allowlist・page が gate）
- **exact timestamp を出す場合も dev-only**（L2 から外に出さない）
- **product `/plan` はまだ NO**
- **本体 Alter はまだ NO**
- **notification は NO**
- **L2 専用 leak guard**（§2-D 注）を通過した時のみ render。違反時は safe boolean に退避

---

## 6. product / Alter 本線への昇格条件（gate C・全 AND）

L2→L3（dev-only → user-facing）に進むには**以下すべて**を満たし、かつ **CEO 承認**を得ること。

1. **dev-only で安全確認**（L2 を一定期間 dogfood し、exact instant の誤露出ゼロ）
2. **leak guard PASS**（L2 専用 guard が safe payload を通し、内部 ref leak を検出することを実証）
3. **false positive 確認**（computed=true が実際に妥当な状況でのみ立つ・assumed_default 等で誤って立たない＝壁C が守られている）
4. **user-facing 文言承認**（`出発目安` および exact timestamp フォーマットの CEO 承認）
5. **permission / surface / delivery gate 確認**（誰に・どの画面で・どの配信状態で出すかの裁定）
6. **exact timestamp の UX 確認**（目安であって保証でないことが UX で誤解されない）
7. **no notification**（L3 は表示のみ・push しない）
8. **no action**（L3 は表示のみ・write/send/book/pay しない）

> L3 を通っても L4（notification）・L5（action）は依然 **NO GO**。各々 gate D/E と CEO 承認を別途要する。

---

## 7. 境界マトリクス（要約）

| 層 | 露出物 | gate（必要条件） | host | 現状 |
|---|---|---|---|---|
| L0 internal | （出さない） | — | — | 実装済・internal-only |
| L1 safe boolean | `あり/なし` | 表示=boolean 化・leak guard 0 | dev-alter-tab / dev-reality-surface | **実装済（RD3x-P6）★現在地** |
| L2 dev departure preview | `内部出発線候補`（exact 可） | §2 全 AND + L2 専用 guard | **dev-alter-tab のみ** | **未実装（次=RD3g-P1・要 GO）** |
| L3 user departure line | `出発目安` | §6 全 AND + CEO 承認 | product `/plan` | NO GO |
| L4 notification | push/prompt | gate D + CEO 承認 | — | NO GO |
| L5 action | write/send/book/pay | gate E + CEO 承認 | — | NO GO |

---

## 8. RD3g-0 でやらなかったこと（遵守確認）

code 変更 / exact timestamp 表示実装 / departure line 実装 / product `/plan` 接続 / Alter 本線接続 / notification / action・write・send・book・pay / currentLocation 取得 / external API 接続 / DB write / Supabase write / production・deploy・push・PR — **すべて未実施**。本書は docs-only。

---

## 9. 次の実装候補（CEO 判断待ち）

1. **RD3g-P1 dev-only departure line preview**（`/plan/dev-alter-tab`・exact timestamp あり/なしは CEO 判断・product 本線でない）
   - 最小実装: 新 flag `REALITY_OPERATOR_DEPARTURE_LINE_PREVIEW`（default OFF）+ §2 gate 評価 + L2 専用 leak guard + `内部出発線候補` 表示
   - exact instant を出すか（`出発目安 HH:MM` 形式）/ 出さず「候補あり」に留めるかは **CEO 判断**
2. **Alter 本線接続**（RD3g-P1 確認後）
3. **product `/plan` 接続**（さらに後段・§6 gate C）
4. **notification**（まだ NO GO）
