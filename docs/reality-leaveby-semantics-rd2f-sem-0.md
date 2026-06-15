# RD2f-SEM-0 — leaveByKnown / Feasibility Guard / Safe Preview Boundary 統合設計（docs-only）

- 日付: 2026-06-15 / 位置づけ: `leaveByComputed` が ERN に入り dev/operator preview wiring（RD2f-wiring-P1/P2）も通った状態で、**「internal leaveByComputed をどこまで状態として認め、どこから先は表示・判断・通知にしないか」** の意味論を 1 本に統合設計。**まだ実装ではない**。
- 規律: 本書は**コードを書かない**。MovementReality/Feasibility/preview 実装変更・exact timestamp 表示・departure line・user-facing copy・notification・DB write・API 追加・product/Alter 接続・production には進まない。
- 方法（CEO ①②③④⑤⑥⑦⑧ + ultracode）: **adversarial workflow（`wf_d2f42814`・5 grounding + 2 critique・file:line 根拠 + relaxation/boundary を敵対的に攻撃）**で意味論を地に足のついた形で確定。下記は確認事実 + 批判の裁定。

---

## 0. 中核発見（grounded・前提を疑った結果）

| # | 発見 | 根拠 |
|---|---|---|
| **F1（linchpin）** | **`mv.leaveByKnown` は judgment/surface/delivery chain で read 数ゼロ**。14 module 全 source-scan で読者なし。→ leaveByKnown が always-false→sometimes-true に反転しても **直接 output が変わる module は 0** | G2 全 module scan |
| **F2** | **但し `etaKnown`/`routeKnown`/`mobilityStatus` は load-bearing**: `feasibilityJudgment.ts:322-323`（`etaUnknown`/`routeUnknown` 判定）+ `decisionDebt.ts:126`（`etaKnown.value===false` で mobilityDebt 計上）+ `momentSnapshot.ts:181-214`（`mobilityStatus.value==='unresolved'` 収集 + missingInputs trace）。**これらを true に倒すと feasibility/debt の output が変わる** | feasibilityJudgment/decisionDebt/momentSnapshot |
| **F3** | **feasibility が読む leaveBy は display `ern.leaveBy.value===null`（`feasibilityJudgment.ts:324`）であり `ern.leaveByComputed` でも `mv.leaveByKnown` でもない**。computed は P2 で 11 module 非参照を静的証明済 | feasibilityJudgment:324 |
| **F4** | **二鍵 + provenance gate**: `deriveMovementLeaveByKnown`（`leaveByGraphBinding.ts:159-175`）は capability(`leaveByComputable`∧`timeEstimateUsableForPlanning`) ∧ computed status ∧ violations[] ∧ planning-grade source(`external_route`/`scheduled`/`user_confirmed`/`cached_route`・heuristic 不可) ∧ buffer fresh ∧ computed-grade origin の全 conjunct で true。**etaKnown は読まない（ladder 未配線）** | leaveByGraphBinding:159-175,79-80 |
| **F5** | **supply は今日空**（route ETA provider 未注入 → `durationValue=null` → supply incomplete → uncomputed → 何も attach されない）。よって leaveByComputed も leaveByKnown も**実運用では今日 false 固定** | routeEtaProviderAdapter:264,305-317 / leaveBySupply:265-274 |
| **F6** | **consumerView は固定 whitelist**（`VIEW_KEYS`= schemaVersion/display/claims/questions/proposalAvailable/departureAvailable・`surfaceProjection.ts:240-242`）。**movement flags も leaveByComputed も consumerView に到達しない**。leaveByComputed は `EVENT_REALITY_ATTRIBUTE_KEYS`(10 key) 非含有・RealityGraphSnapshot(internal-only) のみに存在・3 leak guard が serialization backstop | surfaceProjection:85-93,240-272 / eventRealityNode:138-150 |
| **F7** | **atomic pass**: 現アーキは buildOperatorDaySnapshot/buildScenario で snapshot 構築 → 同一同期 pass で evaluateFeasibility…→ consumerView を構築。**leaveByComputed の attach（assembly）と judgment は同一 instant・同一 request 内**。snapshot を跨いだ時間ドリフトは現状なし | operatorDayPreview:108-165 |

→ **結論**: leaveByKnown 緩和は **「ladder 不変条件で etaKnown に縛る」ことで今日 inert（false のまま）にできる**。safe-boolean preview は **C2 の裁定により departure-semantics を持つ boolean を一切出さない**（schema-state のみ・かつ今日 always-false ゆえ HOLD 推奨）。

---

## 1. leaveByKnown の意味論

### 1.1 定義（epistemic・RD2f-0 を継承し精緻化）
- `mv.leaveByKnown.value===true` ≡ **「mobility 層に planning-grade leave-by が RESOLVED」という epistemic 主張のみ**。
- **`leaveByKnown=true` は次のいずれでもない（不変条件として明文化）**: departure line ／ exact instant 表示許可 ／ notification 許可 ／ action 許可 ／ feasibility verdict ／ lateness（間に合う/遅れる）主張。
- displayPolicy は internal-only（`debugOnly`/`hidden`/`internalReference`/`notActionable` のみ・`visible` 禁止）。

### 1.2 `leaveByKnown=true` の条件（**derived-and-bound + ladder**）
`status===computed` **だけでは true にしない**。次を全て満たす時のみ（`deriveMovementLeaveByKnown` の現 conjunct + **新規 ladder**）:

1. attach 済 `ern.leaveByComputed` が存在し `status==='computed'`
2. `leaveByComputationViolations(computed).length===0`
3. capability `leaveByComputable===true` ∧ `timeEstimateUsableForPlanning===true`
4. **durationValue 二鍵照合**（capability gate ∧ `durationValue.usableForLeaveByComputation`・value 自己申告を信じず full basis 再照合）
5. source ∈ planning-grade（`external_route`/`scheduled`/`user_confirmed`/`cached_route`・**heuristic/none 不可**）
6. buffer `!==null` ∧ `staleness==='fresh'`
7. `originEvidencePresent` ∧ origin ∈ computed-grade（`user_confirmed`/`previous_event_end`/`home_assumed`/`work_assumed`・`current_location_candidate` 不可）
8. **非 stale**（`isComputationStale` が attach 時に `computation_stale` で弾く → stale なら未 attach → derive false。F7 の atomic pass で judgment は同一 instant）
9. **【新規 ladder 不変条件】`mv.etaKnown.value===true`**（leaveByKnown ⟹ etaKnown ⟹ routeKnown。ETA を知らずに出発時刻は知り得ない＝epistemic 整合）

→ **(9) が決定的**: etaKnown は route ETA provider 未接続ゆえ v0 で false 固定（F2）。よって **leaveByKnown は v0 で derive しても false**。machinery は正しく、値は inert。これが今日の honest position（P1/P2 と同じ「no-op が no-op のまま」）。

### 1.3 拒否されるもの
stale / heuristic / currentLocation origin / violation あり / displayPolicy 非 internal / capability gate off / durationValue null / etaKnown false → **すべて leaveByKnown=false**。direct true 設定は **禁止**（hand-set 不可・derive 経路のみ）。

---

## 2. MovementReality invariant 緩和方針

### 2.1 現状 → 変更
- **現 hard invariant**（`movementReality.ts:199-213`）: `m.leaveByKnown.value !== false` → violation（`v0 は false のみ`）。
- **新 invariant（derived-only + coherence）**: 以下の **3 条件付き** で `leaveByKnown===true` を許可、いずれか破れたら violation:
  - **(C-derive)** `leaveByKnown===true` ⟹ `deriveMovementLeaveByKnown(...)===true`（hand-set 検出）
  - **(C-coherence)** `leaveByKnown===true` ⟹ 同一 transition の `ern.leaveByComputed` が存在し `status==='computed'`（cross-node・C1-HIGH#3 裁定）
  - **(C-ladder)** `leaveByKnown===true` ⟹ `etaKnown===true` ∧（`etaKnown===true` ⟹ `routeKnown===true`）（§1.2-9）
  - **(C-display)** `leaveByKnown===true` ⟹ displayPolicy ∈ internal-only（C1-LOW#7 裁定）

### 2.2 derivation の置き場（ordering 問題の解決）
- **問題**: `compileMovementReality` は `ern.leaveByComputed` attach 前に走る（mv compile → assembly が ern に attach）。compile 時点で computed は存在しない。
- **解決**: leaveByKnown は **compile 時は knownFalse のまま**置き、**assembly pass（RD2f-assembly の後続 = RD2f-mv 実装）で computed attach 後に `deriveMovementLeaveByKnown` で mv.leaveByKnown を再導出**して reconcile。**唯一の writer = この reconcile seam**（direct true 禁止）。capability も同 pass に供給（今日は capability 不在 → derive false）。
- **routeKnown/etaKnown/mobilityStatus/missingInputs は触らない**（reconcile は leaveByKnown のみ更新）。route ETA provider が来た時に etaKnown を別 GO で正しく derive（feasibility 影響はその GO が扱う）。

### 2.3 evidenceRefs / sourceRefs
- 緩和後 leaveByKnown=true の `evidenceRefs` は **computed の evidence 語彙**（`#leaveByComputed`/sourceTimeEstimateRef/bufferRef の ref id・raw 非含有）を carry。`source` は `derived`。confidence は computed の confidence を継承。**exact instant は evidenceRef に入れない**（ref id のみ）。

### 2.4 不変厳守
- routeKnown/etaKnown を**勝手に true にしない**・mobilityStatus を safe 化しない・**missingInputRefs を直接消さない**（recompile 経由のみで known-flag が反転＝`reality...rd2f-0.md:18,68`・filter 削除禁止）。

### 2.5 tests 方針（RD2f-mv 実装時）
- OFF/empty で leaveByKnown=false 不変（v0 inert）。
- 合成: computed attach + capability planning-grade + etaKnown=true（強制）→ leaveByKnown derive true。etaKnown=false → ladder で false。
- coherence violation: leaveByKnown=true ∧ computed 不在/stale → violation 検出。
- **negative-space guard（C1-MEDIUM#4 裁定）**: judgment/surface/delivery 14 module が `mv.leaveByKnown` を read しない source-scan（現 F1 を **enforced invariant に固定**・将来 reader 混入を CI で検出）。

---

## 3. Feasibility guard

### 3.1 維持すべき既存挙動
- Feasibility は **`ern.leaveBy.value`（display・null）を読み続ける**（`feasibilityJudgment.ts:324` の `leaveByUnresolved`）。
- Feasibility は `etaKnown`/`routeKnown`/`mobilityStatus.evidenceRefs` を読み続ける（F2・input 解決トラッキング用）。

### 3.2 禁止（guard）
- Feasibility は **`ern.leaveByComputed` を直接読まない**（P2 で静的証明済・本 guard で固定）。
- Feasibility は **`mv.leaveByKnown` を読まない**（F1 を固定）。
- **computed leaveBy だけで** feasible にしない／risk low にしない／lateness 判断しない。
- **no「間に合う」・no「遅れる」・no probability・no deadline assertion**（feasibility は input 解決状態のみ追跡・lateness verdict を出さない＝現状通り）。

### 3.3 guard 実装方針（static で十分・runtime 不要）
- **static source-scan guard で十分**（C1-HIGH#1 の runtime assertion 提案は**過剰**と裁定）。理由: F7 atomic pass ＋ §1.2-(8) staleness が attach 時に効く ＋ §2.1-(C-coherence) が snapshot 整合を保証 ＋ feasibility が computed/leaveByKnown を構造的に読まない（source-scan で固定）。**runtime で feasibility 内に leaveByKnown assertion を足すと、本来読まない field への結合を逆に生む**ので採らない。
- 代わりに: `isLeaveByComputedNonLoadBearing` 的 **source-scan test**（P2 を継承拡張）＋ §2.5 negative-space guard。
- 補助: feasibility/collapseRisk/intervention/delivery の先頭に doc コメント「**mv.leaveByKnown / ern.leaveByComputed を読むな。leaveBy 解決は ern.leaveBy(display) と mobilityStatus 経由のみ**」（C1-MEDIUM#4 / C2-MEDIUM#3 裁定）。

---

## 4. Risk / Permission guard

- **CollapseRisk / CollapsePropagation は movement flags も leaveByComputed も読まない**（F1・grep 0）。→ **computed leaveBy を high/low に直結しない**（構造的に不可能・source-scan で固定）。
- **InterventionEligibility は movement flags も leaveByComputed も読まない**（F1）。→ **leaveByComputed で permission を緩めない**。
- **otherPeople / reservation / work / sensitive gate は維持**（既存 RJ2 gate・本設計は触らない）。
- **proposal / action / notification へ進ませない**（`departureAvailable:false`/`proposalAvailable:false` は consumerView で固定・`surfaceProjection.ts:85-93`）。
- guard 方針: **static source-scan**（risk/permission module が `leaveByKnown`/`leaveByComputed` を read しないことを test で固定）。runtime guard 不要。

---

## 5. safe preview boundary

### 5.1 裁定（C2 を採用・CEO 提案 `leaveByInternalComputed`/`leaveByKnownInternal` を修正）
CEO GO §5 は `leaveByInternalComputed: true/false` / `leaveByKnownInternal: true/false` を候補に挙げたが、**adversarial C2 が「boolean でも departure-semantics は相関・human-factors で漏れる」と HIGH 指摘**。前提を疑った結論:

- **`leaveByKnown` / `leaveByInternalComputed`（= departure-semantics を名に持つ boolean）を preview に一切出さない**。理由: (a) `leaveByKnown:true` は「出発時刻が分かっている」という departure 主張そのもの（数値が無くても意味論的に departure state）、(b) 運用者が「計算済み」を user に伝達する human-factors trap（C2-HIGH#1/MEDIUM#5）。
- **出してよい上限 = `leaveByComputedPresent: boolean`（schema-state のみ）** ＝「このノードに internal computed object が attach されているか」という**グラフ構造のデバッグ情報**。departure 主張ではない。
- **但し今日は supply 空ゆえ `leaveByComputedPresent` は常に false（F5）→ 出しても情報ゼロ・attack surface だけ増える → 本 slice は HOLD 推奨**（§6）。運用者が computed を見たい時は **server-side の RealityGraphSnapshot（internal-only・client 非送信）で full object を inspect** すればよく、preview payload に boolean を足す必要が今日は無い。

### 5.2 出してよい候補（将来 `leaveByComputedPresent` を出す場合の上限）
- `leaveByComputedPresent: true/false`（schema-state・**departure 名を使わない**）
- exact timestamp なし／reason なし／evidenceRefs なし／sourceRefs なし／missingInputRefs なし

### 5.3 出してはいけないもの（絶対）
- `leaveByInstant` / `arrivalTargetInstant` / `sourceTimeEstimateRef` / `bufferRef` / `timeContract` / exact ISO
- `leaveByKnown` / `leaveByInternalComputed`（departure-semantics boolean）
- 「出発時刻」「間に合う」「遅れる」／ departure line ／ notification 文言

### 5.4 防御の二重化（将来実装時）
- **型レベル（C2-HIGH#2 裁定・採用）**: preview payload が ERN を載せる場合は **`leaveByComputed` を型から除いた consumer 用 ERN 射影**を使い、computed を **compile-time で混入不可**にする（runtime leak token は backstop に留める）。
- **leak token 拡張**: `leaveByComputedPresent` を出す slice では token list に追記不要（boolean key 自体は internal object 名 token に当たらない・但し object 本体は従来通り禁止）。

---

## 6. 次の実装切り分け提案（リスク別・各々別 GO）

| slice | 内容 | リスク | 推奨 |
|---|---|---|---|
| **RD2f-mv**（leaveByKnown derived-only 化） | `movementReality` invariant を §2.1 の derived+coherence+ladder に緩和 ／ assembly 後続に **leaveByKnown reconcile seam**（唯一 writer・computed attach 後 derive） ／ coherence violation check ／ negative-space source-scan guard。**route ETA provider 未接続ゆえ値は false のまま inert** | 中（core mv・但し inert） | **★ first**（machinery 正常化・今日 no-op 証明） |
| **RD2f-feasibility-guard**（non-load-bearing 固定） | feasibility/collapseRisk/intervention/delivery が `mv.leaveByKnown`/`ern.leaveByComputed` を read しないことを **static source-scan test で恒久固定** ＋ doc コメント注入。runtime guard なし | 低（test+comment のみ） | **second**（RD2f-mv と同時 or 直後・薄い） |
| **RD2f-preview-safe-boolean** | `leaveByComputedPresent`(schema-state) を preview に出す型レベル防御込み | 低だが**今日 value=false ゆえ情報ゼロ** | **HOLD**（route ETA provider 接続後に再評価・今は不要） |
| **route ETA provider 接続 + etaKnown 緩和** | 実 ETA 供給・etaKnown derive・feasibility 影響対応 | **高**（load-bearing F2） | **別 GO・遠い先**（本設計のスコープ外） |
| **departure line / notification / exact instant** | user-facing 出発時刻 | 最高 | **NO GO（明示 HOLD）** |

**推奨順**: **RD2f-mv（first・machinery 正常化・inert 証明）→ RD2f-feasibility-guard（薄く固定）→ preview-boolean は HOLD**。RD2f-mv と feasibility-guard は **1 GO に束ねても良い**（同じ「leaveByComputed を状態として認めるが judgment に effloresce させない」問題・CEO の「分けすぎるな」方針に合致）。

---

## 7. Department Responsibility Matrix（RD2f-SEM-0・docs 契約）

| 部門 | 役割 | 責務 |
|---|---|---|
| **Mobility/Build** | R | leaveByKnown 意味論・ladder 不変条件・reconcile seam 設計・derived-only 化 |
| **Risk** | C | feasibility/risk が leaveByComputed/leaveByKnown を load-bearing にしない・negative-space guard |
| **Permission** | C | leaveByComputed/exact instant の DTO 非露出・型レベル防御・leak token |
| **Communication** | C | safe preview boundary（schema-state のみ・departure-semantics boolean 禁止）・exact instant/departure line HOLD |
| **CEO** | A | RD2f-mv / feasibility-guard 実装 GO・preview-boolean HOLD 解除・route provider 接続 GO（別） |

---

## 8. RD2f-SEM 実装 GO 可否 自己判定

- **leaveByKnown 緩和は安全に実装可能**（first=RD2f-mv）。鍵は **ladder 不変条件（leaveByKnown⟹etaKnown⟹routeKnown）** で、etaKnown が v0 false ゆえ leaveByKnown も derive false＝**今日 inert**。F1（読者ゼロ）＋ F7（atomic pass）＋ attach 時 staleness で、C1 が挙げた HIGH 3 件は **coherence violation check（C-coherence/C-ladder/C-derive/C-display）＋ source-scan negative-space guard** で封鎖（runtime feasibility assertion は過剰ゆえ不採用）。
- **safe-boolean preview は HOLD**: C2 裁定で departure-semantics boolean を出さない。出すなら `leaveByComputedPresent`(schema-state) 上限だが、今日 always-false ゆえ情報ゼロ・不要。
- **exact timestamp / departure line / notification は HOLD 継続**（最高リスク・NO GO）。
- 封鎖すべき hole（coherence・ladder・orphan binding・future reader・型レベル leak）は設計済。**GO は CEO 専管**。本書はコードを含まない。

---

## 9. 実装反映（RD2f-mv+guard）

- **2026-06-15 RD2f-mv+guard 実装**（code `c0237d1aa`・matrix §5 参照）: §1（leaveByKnown 意味論）/§2（invariant 緩和・reconcile seam）/§3（Feasibility guard=static）/§4（Risk/Permission guard） を実装。
- 実装ファイル: `lib/plan/realityCore/movementReality.ts`（violations 緩和）・`lib/plan/realityCore/movementLeaveByReconcile.ts`（新規 pure・**未配線**・`reconcileMovementLeaveByKnown`/`movementLeaveByKnownCoherenceViolations`/`arrivalErnIdForMovement`）・`tests/unit/movementLeaveByReconcile.test.ts`（35 PASS）。
- §5（safe preview boundary）は **HOLD 維持**（preview-safe-boolean 未実装）。route ETA provider 接続 + etaKnown 緩和、departure line / exact timestamp / notification は **NO GO 継続**。
- ladder は CEO 補正どおり **v0 安全策**として実装（恒久意味論でない・route/ETA 供給成熟時に etaKnown/routeKnown 意味論を再監査）。
