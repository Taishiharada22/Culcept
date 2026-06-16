# RD3c/3d-0 — Real Supply Source & Movement Flag Semantics Design（docs-only）

- 日付: 2026-06-16 / 位置づけ: RD3-0（Mobility Supply Activation）と RD2f-SEM-0（leaveByKnown 安全ラダー）の**統合次段**。「operator real-data で **non-empty supply の最初の source を何にするか**」「その採用で `etaKnown` / `routeKnown` / `leaveByKnown` の意味論をどう再定義するか」を 1 本にまとめる。**まだ実装ではない**。
- 規律: 本書は**コードを書かない**。real supply wiring 実装・provider 接続・external API・currentLocation・MovementReality 変更・Feasibility 変更・product/Alter 接続・departure line・exact timestamp・notification・DB write・production には進まない。
- 方法（CEO ①②③④⑤⑥⑦⑧）: 既存コードの file:line を直接 grounding し、**前提（"routeKnown" は route shape か time basis か）を疑った上で**、capability 層に既に在る正しい分離を MovementReality 層へ伝播させる最小設計を導く。

---

## 0. 中核発見（grounded・前提を疑った結果）

| # | 発見 | 根拠 |
|---|---|---|
| **F1（linchpin）** | **capability 層は既に route shape と time basis を明示的に分離している**: `RouteEtaCapabilityV0` に `routeShapeKnown`（route shape 専用・`routeEtaCapability.ts:74`）と `arrivalProjectionKnown`（time basis 専用・`:109`）が別 field で存在。docstring が「routeShapeKnown と durationSignalPresent は独立（直列にしない）」と明文化（`:26`）。**RD2d で既に正しく分離済み**。 | routeEtaCapability:26,74,109 |
| **F2** | **混乱は MovementReality 層のみ**: `mv.routeKnown`(`movementReality.ts:78`) の意味が ambiguous（evidence 文字列は `route_source_missing_v0`＝**"source"**＝time basis 寄り）。`compileMovementReality:126` は **hardcoded false**・capability 層の `routeShapeKnown` / `arrivalProjectionKnown` と未接続。`etaKnown`(:79) も hardcoded false で意味が宙づり。 | movementReality:78-80,126-128,205-207 |
| **F3（ladder ripple）** | **Feasibility は `routeUnknown` を infeasibility blocker として使う**（`feasibilityJudgment.ts:323`・`:328` の `(etaUnknown \|\| routeUnknown \|\| leaveByUnresolved)` 三項論理和）。さらに `:336` で `route_unresolved` reason 単独で blocker 出力。→ **`routeKnown` を route shape 意味に再定義すると feasibility が "shape 不明＝infeasible" を主張する誤った blocker を出す**。要 migration。 | feasibilityJudgment:322-336 |
| **F4** | **decisionDebt は `etaKnown.value===false` のみ読む**（`:126` の `unresolvedMv`）。routeKnown は読まない。→ etaKnown が時間 basis 意味で true になれば mobilityDebt は自然に減少（正しい挙動）・routeKnown 意味変更の ripple なし。 | decisionDebt:126 |
| **F5** | **planning-grade source allowlist は既に user_confirmed を含む**: `durationProjectionGradeOk` の allowlist = {`scheduled`, `user_confirmed`, `external_route`, `cached_route`}（`routeEtaCapability.ts:212-214`）。user_confirmed durationBasis は **DAG 上 既に projection-grade として受け入れ可能**。新 source 追加 不要。 | routeEtaCapability:212-214 |
| **F6** | **provider 注入は production 0**（RD3-0 F1 継承）。実 source の adoption には provider 注入と source data の供給経路の両方が必要。 | routeEtaProviderAdapter:281 (production caller 0) |
| **F7（heuristic 不可は DAG 強制）** | `durationProjectionGradeOk("heuristic")=false`（`:214`）+ `transportCascadeRouteEtaProvider.ts:238` の violation walker が `routeShapePresent=true ∧ heuristic` を hard-fail。→ heuristic を projection-grade に偽装する道は構造的に閉じている。 | routeEtaCapability:212-214 / transportCascadeRouteEtaProvider:238 |
| **F8** | **mobilityStatus は `"unresolved" \| "resolved"`**（`movementReality.ts` inline）。今日は常 `"unresolved"`。 | movementReality:130 |

→ **結論**: 設計は「**capability 層の既存分離を MovementReality 層へ伝播 + v0 ladder の trim（routeKnown を ladder から外す）+ Feasibility の routeUnknown blocker 撤去**」の 3 点に収斂。新 field（`movementTimeBasisKnown` 等）は **不要**（capability の `arrivalProjectionKnown` が既に存在）。

---

## 1. real supply source 候補比較

各 axis: ① projection-grade か（DAG allowlist 通過か） ② external send 要否 ③ currentLocation 要否 ④ raw coordinate 要否 ⑤ user confirmation 要否 ⑥ privacy gate ⑦ stale/freshness の仕組み ⑧ scope 一致の作りやすさ ⑨ routeKnown（route shape）への影響 ⑩ etaKnown（arrival projection）への影響 ⑪ leaveByComputed への到達可能性。

| source | ① projection-grade | ② external | ③ currentLoc | ④ raw coord | ⑤ user confirm | ⑥ privacy | ⑦ fresh 機構 | ⑧ scope | ⑨ routeShapeKnown | ⑩ etaKnown(時間 basis) | ⑪ leaveByComputed |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **user_confirmed duration** | ✓（allowlist） | ✗ | ✗ | ✗ | **必須**（明示 confirm） | 低 | confirm timestamp 由来 | scope 明示で bound | ✗（shape なし） | ✓ | ✓ |
| **manual operator seed**（dogfood/staging） | ✓（user_confirmed 扱い） | ✗ | ✗ | ✗ | operator 限定 | 低（operator gate） | seed timestamp | 手指定 | ✗ | ✓ | ✓ |
| **scheduled/transit duration** | ✓ | 場合による（時刻表 source 次第） | ✗ | ✗ | ✗ | 中（transit data の source） | schedule 由来 fresh | mode=`transit` で bound | ✗ | ✓ | ✓ |
| **cached route** | ✓ | ✗（cache reuse） | ✗ | cache に含み得る | ✗ | 中（cache TTL） | cache age | 旧 scope 継承 | 場合により ✓ | ✓ | ✓ |
| local heuristic | **✗**（F7 で構造的拒否） | ✗ | ✗ | ✓（必須） | ✗ | — | — | — | ✗ | ✗ | ✗ |
| external route API | ✓ | **✓ HIGH** | ✗ | ✓（送信） | ✗ | **HIGH**（送信内容・key・rate） | provider 提供 | provider | ✓（shape あり） | ✓ | ✓ |
| currentLocation-based route | ✓ | ✓ | **✓ HIGH** | ✓（live coord） | ✗ | **HIGH** | live | live | ✓ | ✓ | ✓ |

### 一目で読む結論
- **「外部送信ゼロ・座標ゼロ・currentLocation ゼロ」で projection-grade に届く道は 4 つ**: user_confirmed / manual operator seed（= user_confirmed 扱い） / scheduled-transit（時刻表 source 次第） / cached route（先行 source 必要）。
- 残り（heuristic/external/currentLocation）は **gate 越え必須**で本 slice 範囲外。

---

## 2. 推奨 first real supply source

### 推奨: **user_confirmed duration を operator manual seed として最初に採用**

**理由（rule ⑤ ゴール逆算）**:
1. **DAG 変更ゼロ**で projection-grade に届く（F5・allowlist に既存）。新 source 種別・新 enum 追加不要。
2. **gate 越え数最小**: external/座標/currentLocation を一切要さない。privacy 影響は user/operator の **明示的 agency** に閉じる。
3. **bootstrap 問題なし**: cached route は先行する成功 route が必要だが user_confirmed は単独で成立する。
4. **scheduled-transit より浅い前提**: scheduled-transit は時刻表 data source の決定（pre-loaded vs external）が必要・user_confirmed はその下層に依らない。
5. **operator manual seed = user_confirmed の operator gate 版**: operator が dogfood/staging 検証用に手動で duration seed を入れる。実 user UI は別 slice。soak 期間に operator path で chain を end-to-end 動かせる。

### 推奨順
1. **operator manual seed**（user_confirmed として書き込む operator-only path・staging で chain 動作確認）
2. **user-facing user_confirmed UI**（一般 user が予定ごとに duration を確認・別 slice・UI/UX/DB write・**CEO 承認 gate**）
3. **scheduled/transit**（時刻表 source 決定後・別 slice）
4. **cached route**（先行 source あり次第・別 slice）
5. external API / currentLocation = **NO_GO（別個 CEO gate）**

---

## 3. etaKnown / routeKnown 意味論 re-audit（RD2f-SEM-0 v0 ladder の恒久化）

### 3.1 capability 層は既に正解（F1）

`RouteEtaCapabilityV0` は以下を **既に別 field で持つ**（routeEtaCapability:73-110）:
- `routeShapeKnown: boolean` — **route shape（polyline/形状）**の epistemic 主張
- `arrivalProjectionKnown: boolean` — **arrival projection（時間 basis）**の epistemic 主張
- `timeEstimateUsableForPlanning: boolean` — planning-grade（freshness + ref 付き）
- `leaveByComputable: boolean` — トップの能力

docstring「routeShapeKnown と durationSignalPresent は独立（直列にしない）」（:26）が**設計意図を明示**。RD2d 段階で既に正しい分離が成されていた。

### 3.2 MovementReality 層の現状（混乱）

`MovementRealityV0` の field（`movementReality.ts:78-80`）:
- `routeKnown: RealityAttribute<boolean>` — 意味が ambiguous（evidence 文字列 `route_source_missing_v0` の "source" は data source を示唆＝**time basis 寄り**。だが field 名 `routeKnown` は **route shape**を示唆）。
- `etaKnown: RealityAttribute<boolean>` — 「arrival time basis 既知」を示唆（capability の `arrivalProjectionKnown` に対応）。
- `leaveByKnown: RealityAttribute<boolean>` — RD2f-mv で derived-only 化済。

### 3.3 採用する確定意味論（前提を疑った帰結）

| MV field | 確定意味 | capability 対応 |
|---|---|---|
| **`routeKnown`** | **route shape（polyline/形状）known**（display/visualization 用途） | `routeShapeKnown`（:74） |
| **`etaKnown`** | **arrival projection（時間 basis）known**（planning 用途） | `arrivalProjectionKnown`（:109） |
| `leaveByKnown` | 既定どおり（derived-and-bound） | leaveByComputable + computed |

**根拠**:
- capability 層の field 名と整合（混乱の源は MV 層だけだった）。
- user_confirmed/scheduled は shape 不明・time basis 既知 → 直感どおり `etaKnown=true ∧ routeKnown=false` を許す。
- external_route は shape 既知 → `routeKnown=true` を伴う。
- evidence 文字列 `route_source_missing_v0` は **意味変更時に `route_shape_source_missing_v0` へ改名**（RD3d-P1 実装で）。

### 3.4 v0 安全ラダーの trim（恒久意味論への昇格）

**旧 ladder（RD2f-SEM-0・v0 安全策）**: `leaveByKnown ⟹ etaKnown ∧ routeKnown`
**新 ladder（恒久意味論）**: `leaveByKnown ⟹ etaKnown`（routeKnown を ladder から**外す**）

理由:
- 出発時刻計算には **arrival projection（時間 basis）が必須**だが **route shape は不要**。
- user_confirmed/scheduled で leaveBy を計算する道を開く（recommend §2）。
- `etaKnown ⟹ ?` の下位 ladder は capability の DAG（`durationProjectionGradeOk` + scope + temporal + condition）が担保。

### 3.5 「etaKnown を timeEstimateKnown / timeEstimateUsableForPlanning と分けるべきか」

不要。capability 層に既に階層が在る（`durationSignalPresent` < `arrivalProjectionKnown` < `timeEstimateUsableForPlanning` < `leaveByComputable`）。MV 層は **planning-grade に達したかだけ**を 1 bit で持てばよい。`mv.etaKnown.value===true` ≡ capability の `timeEstimateUsableForPlanning===true`（fresh + ref 付き）にバインド。

---

## 4. Feasibility / decisionDebt 影響監査（grounded ripple）

### 4.1 Feasibility（HIGH ripple）

**現状**（`feasibilityJudgment.ts:322-336`）:
```ts
const etaUnknown   = !mv || mv.etaKnown.value   !== true;
const routeUnknown = !mv || mv.routeKnown.value !== true;
const leaveByUnresolved = ern.leaveBy.value === null;
if (isFixedStart && (etaUnknown || routeUnknown || leaveByUnresolved)) {
  b.inferred.push(reason("movement_feasibility_unverified", ...));
}
if (etaUnknown)   b.unresolved.push(reason("eta_source_missing", ...));
if (routeUnknown) b.unresolved.push(reason("route_unresolved", ...));  // ← 削除対象
if (leaveByUnresolved) b.unresolved.push(reason("leave_by_unresolved", ...));
```

**問題**: 新意味論で `routeKnown` = route shape known になると、user_confirmed/scheduled 由来の真に feasible なケースでも **shape 不明 → infeasibility blocker** を誤発火する。

**migration（RD3e-P1 別 slice）**:
- `routeUnknown` check を**撤去**（or advisory に降格）。`etaUnknown` が時間 basis 不在を捕捉済み（重複・かつ正しい場所）。
- `(etaUnknown || routeUnknown || leaveByUnresolved)` 三項を `(etaUnknown || leaveByUnresolved)` に。
- `route_unresolved` reason を **削除**（または `route_shape_unknown` に改名し advisory 化）。
- これは **load-bearing 変更**（feasibility 出力が user_confirmed 採用環境で変わる）→ CEO 承認 gate 必須。

### 4.2 decisionDebt（自然な改善・ripple 安全）

**現状**（`decisionDebt.ts:126`）: `unresolvedMv = input.mv.filter(m => m.etaKnown.value === false).length`。

**新意味論下**: etaKnown=true（user_confirmed 由来）の mv が増えれば mobilityDebt は減少（**意図どおり**・「未解決移動」が実際解決した）。コード変更 不要・意味的に正しい挙動。

### 4.3 momentSnapshot（中立）

mobilityStatus.value === "unresolved" 走査（`:181`）。RD3e-P1 で `resolved` への遷移条件（後述）を入れれば、解決した mv が自然に除外される（intended）。

### 4.4 Surface/Copy/Delivery（無影響）

RD2f-SEM-0 で確認済（10 module は leaveByComputed/leaveByKnown を読まない）。新意味論下でも source-scan guard が固定（RD2f-mv+guard）。

---

## 5. MovementReality 接続方針（RD3e-P1 設計骨格）

### 5.1 基本方針: **既存 field を意味再定義 + 新 field 追加なし**

- `mv.routeKnown` を **route shape known** にバインド（capability `routeShapeKnown` から reconcile）
- `mv.etaKnown` を **arrival projection known**（= `timeEstimateUsableForPlanning`）にバインド（capability から reconcile）
- `mv.leaveByKnown` は既存 `reconcileMovementLeaveByKnown` のまま（RD2f-mv 維持）
- evidence 文字列を意味整合に改名（`route_source_missing_v0` → `route_shape_source_missing_v0`）
- ladder を §3.4 の新版に置換

### 5.2 reconcile 拡張（leaveByKnown と一括）

現 `reconcileMovementLeaveByKnown(mv, attachedComputed, capability)` を **leaveByKnown 単独 writer** から拡張し、同じ pass で:
- `etaKnown` ← `capability.planning.timeEstimateUsableForPlanning`（true の時のみ）
- `routeKnown` ← `capability.route.routeShapeKnown`
- `mobilityStatus` ← `leaveByKnown==true` の時 `"resolved"`、その他 `"unresolved"`

reconcile が **3 field の唯一 writer**（hand-set 禁止・direct true 禁止）。direct true は `movementRealityViolations` で弾く。

### 5.3 順序

```
1. compileMovementReality（今日通り・全 false）
2. RD2e-SUPPLY が capability + leaveBy supply を構築
3. assembleLeaveByBindings → ern.leaveByComputed attach
4. reconcileMovementLeaveByKnown(extended) → mv の 4 field を一括 update
```

direct flip は禁止・reconcile seam のみで flip 可能。

### 5.4 missingInputRefs 方針（RD2f-SEM-0 継承）

**直接消さない**。recompile 経由のみで known-flag が反転（filter 削除禁止・audit trail 保持）。新意味論下でも同じ:
- recompile で `etaKnown` flag が true 反転すれば、次世代 mv の `missingInputs` に `eta_source_missing` は**入らない**（recompile 時の真実が反映）。
- 旧世代 missingInputs は dedupeKey で carry（過去の不在を保持・正直）。

### 5.5 mobilityStatus

「unresolved → resolved」の遷移は §5.2 で reconcile が担当。**direct set 禁止**。RD3e-P1 で `movementRealityViolations` に「`mobilityStatus="resolved"` ⟹ leaveByKnown=true ∧ etaKnown=true」の coherence 追加。

### 5.6 Feasibility migration（§4.1）と同期

RD3e-P1 は **(a) reconcile 拡張 + (b) feasibility routeUnknown 削除** を**同一 GO で束ねる**。理由: 別々にすると意味論不整合期間（routeKnown=false ∧ leaveByKnown=true で feasibility が誤発火）が発生する。

---

## 6. Safety gate（必須・本 slice 範囲外も含む全体 invariant）

- ✗ real supply source なしに `status==='computed'` を作らない（capability の `leaveByComputable` 不通なら supply incomplete → uncomputed）
- ✗ heuristic を projection-grade 扱いしない（F7 DAG 強制）
- ✗ currentLocation を勝手に使わない（**別個 CEO gate**）
- ✗ external route API を勝手に使わない（**別個 CEO gate**）
- ✗ raw coordinate を client へ出さない（opaque ref 化既存・`containsRawLocation` 走査）
- ✗ sourceId / externalUid / companions / raw locationText / title を出さない（leak token 既存）
- ✗ exact timestamp を出さない（leaveByInstant/arrivalTargetInstant/timeContract/*Ref 既存 leak token）
- ✗ departure line を出さない（**別個 CEO gate**）
- ✗ notification しない（**別個 CEO gate**）
- ✗ direct true 設定禁止（reconcile seam のみ・`movementRealityViolations` 強制）
- ✗ hand-set 禁止（capability 由来でない flag true は violation）
- ✗ user_confirmed の自動推測禁止（user/operator の明示 confirm のみ）

---

## 7. 実装候補（リスク別・本 slice では実装しない）

| slice | 内容 | 触る | リスク | 推奨順 |
|---|---|---|---|---|
| **RD3d-P1**（semantic + ladder trim 実装） | `movementReality.ts` violations: ladder を `leaveByKnown ⟹ etaKnown` のみに trim。evidence 文字列 `route_shape_source_missing_v0` 改名。routeKnown displayPolicy・意味の doc を更新。**コード変更は小**（feasibility は触らない・あくまで MovementReality 内意味整合のみ）。**今日は etaKnown 常 false ゆえ inert** | movementReality | 低 | **★ first** |
| **RD3c-P1**（user_confirmed schema・no write） | `ExternalAnchor` に optional `userConfirmedDurationMinutes`/`userConfirmedDurationSource`/`userConfirmedDurationConfirmedAt` を type レベルで追加。DB migration は CEO 承認 gate（apply は別）。**write path なし**。 | external-anchor + supabase migration draft | 中（migration は別 gate） | second |
| **RD3e-P1**（reconcile 拡張 + feasibility routeUnknown 削除を束ね GO） | reconcile が leaveByKnown/etaKnown/routeKnown/mobilityStatus の 4 field を一括 update。feasibility の `routeUnknown` blocker を撤去（or advisory 化）。**load-bearing 変更**・CEO 承認必須 | movementLeaveByReconcile + movementReality violations + feasibilityJudgment | 中〜高 | RD3d-P1 後 |
| **RD3c-P2**（operator manual seed write・operator-only） | operator dashboard から手動で user_confirmed duration を seed・supabase write（owner-RLS・operator role gate）。RD3e-P1 後に initial chain end-to-end soak 開始 | new API route + RLS + UI dialog（operator-only） | 中（write・RLS gate） | RD3e-P1 後 |
| **RD3f-P1**（operator safe boolean に leaveByComputedPresent 追加） | RD3a-P1 と同形・operator real-data path で `leaveByComputedPresent` を出す（schema-state のみ・exact instant 不出） | operatorDayPreview DTO | 低 | RD3c-P2 後 |
| **RD3c-P3**（user-facing user_confirmed UI） | 一般 user が予定ごとに duration を確認する UI。DB write・notification 設計・UX | product UI + DB | 高（user-facing） | RD3c-P2 ＋ soak 後・**別 CEO gate** |
| **RD3g-0**（departure line boundary docs） | user-facing exact timestamp 表示の境界条件 docs only | docs | 高（最終公開） | 後の後 |
| scheduled-transit / cached / external / currentLocation | — | — | — | **NO_GO（個別 CEO gate）** |

**推奨実装順**: **RD3d-P1（最薄・inert）→ RD3c-P1（schema）→ RD3e-P1（load-bearing 束ね GO）→ RD3c-P2（operator manual seed write）→ RD3f-P1（operator safe boolean）→ RD3c-P3（user UI）→ RD3g-0（departure docs）**。

---

## 8. Department Responsibility Matrix（RD3c/3d-0・docs 契約）

| 部門 | 役割 | 責務 |
|---|---|---|
| **Mobility/Build** | R | source 採用判断・semantic 確定・reconcile 拡張設計・ladder trim |
| **Risk** | C | feasibility migration の load-bearing 影響評価・mobilityStatus 遷移 coherence |
| **Permission** | C | user_confirmed の明示 agency 担保・raw 非露出継承・hand-set 禁止 invariant |
| **Communication** | C | exact timestamp HOLD 継続・departure line HOLD・notification HOLD |
| **CEO** | A | RD3d-P1 / RD3c-P1 / RD3e-P1 / RD3c-P2 / RD3c-P3 / RD3g-0 各 GO・external API/currentLocation gate 解除 |

---

## 9. RD3c/3d-0 自己判定

- **first real supply source = user_confirmed duration（operator manual seed として起動）**: 外部送信ゼロ・座標ゼロ・currentLocation ゼロで projection-grade に届く唯一の道（DAG 変更不要・bootstrap 不要）。
- **意味論の確定**: capability 層に既に在った `routeShapeKnown` / `arrivalProjectionKnown` の分離を MovementReality 層へ伝播。`routeKnown` = route shape known（display）・`etaKnown` = arrival projection known（planning）。v0 安全ラダーを `leaveByKnown ⟹ etaKnown` に**trim**（routeKnown を ladder から外す）。
- **Feasibility ripple**: `routeUnknown` blocker を撤去する load-bearing 変更が伴う（RD3e-P1 で reconcile 拡張と束ねる）。decisionDebt/Surface/Copy/Delivery は無影響（既存 source-scan guard で固定）。
- **MovementReality**: 新 field 追加なし・既存 field の意味再定義のみ・reconcile が 4 field の唯一 writer・direct flip 禁止。`mobilityStatus` 遷移 coherence を追加。
- **HOLD 継続**: scheduled-transit / cached / external API / currentLocation / departure line / exact timestamp / notification / product UI（個別 CEO gate）。
- 本書はコードを含まない。GO は CEO 専管。

---

## 11. 実装反映（RD3e-P1・Feasibility 反映）

- **2026-06-16 RD3e-P1 実装**（code `d6a5c7ab9`・matrix §5 参照）: §4.1 Feasibility migration を実装。
  - `feasibilityJudgment.ts`: inferred blocker 条件から `routeUnknown` 除去（`(etaUnknown || leaveByUnresolved)`）・`route_unresolved`→`route_shape_missing`（unresolved に残すが blocker にしない）。
  - **route shape unknown だけで feasibility を止めない**（etaKnown=true ∧ routeKnown=false の将来を塞がない）。time estimate（etaKnown）/ display leaveBy は引き続き重要。computed leaveBy は非参照。
  - §4.2 decisionDebt = 無変更（etaKnown のみ読む・無回帰）。§5 MovementReality reconcile = RD3d-P1 で既済ゆえ無変更。
  - **本 slice 範囲外**: real route/ETA 供給接続（etaKnown を実 true 化）・departure line（**RD3g-0**）・exact timestamp 表示（NO GO）。route shape unknown を blocker から外す load-bearing migration はこれで完了。

---

## 10. 実装反映

- **2026-06-16 RD3d-P1 実装**（code `ceeea93b5`・matrix §5 参照）: §3（意味論確定）・§5.1（既存 field 意味再定義）・ladder trim を実装。
  - 実装ファイル: `lib/plan/realityCore/movementReality.ts`（evidence 改名 `route_shape_source_missing_v0` / `arrival_projection_source_missing_v0`・movementRealityViolations の leaveByKnown ladder を etaKnown のみに trim）・`lib/plan/realityCore/movementLeaveByReconcile.ts`（reconcile + coherence の ladder を etaKnown のみに）・tests（reconcile RD3d-P1 block + compile evidence semantic）。
  - **CEO 補正反映**: operator manual seed は user_confirmed と完全同一視しない（provenance `operator_seed` / `dogfood_only` / `not_general_user_confirmed` を残す・一般 user 学習に流さない・別 GO=RD3c-P1/P2）。
  - **本 slice 範囲外（実装せず）**: §4.1 Feasibility routeUnknown blocker 撤去（load-bearing・**RD3e-P1**）・§5.2 reconcile の etaKnown/routeKnown/mobilityStatus への拡張（real true 化・**RD3e-P1**）・§7 user_confirmed schema（**RD3c-P1**）・operator seed write（**RD3c-P2**）。
  - etaKnown/routeKnown は依然 hard-false invariant（real true 化なし）ゆえ **今日 inert**（leaveByKnown も derive false）。
