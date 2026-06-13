# RJ2-0 — Reality Core Surface Boundary 設計仕様（docs-only・実装なし）

- 日付: 2026-06-14 / 作成: surface boundary 設計セッション（多視点設計 6 断片 + 敵対 red-team 6 件 + 統合）
- 位置づけ: pure core（RJ1a/b・RC2b-1/2・RC2c-1/2 の 6 判断器）の内部状態を、**将来どこからユーザーに見せ／確認／提案／通知／行動になるか**の境界正本。安全の最終防壁。
- 優先順位: RG0.6 → 本書（RJ2 surface 不変条件） → 各 RJ2 slice。**矛盾時は本書が各断片を上書きする**（本書が唯一の正本）。
- 規律: **型 skeleton と境界宣言のみ**。コード・実装・user-facing copy・配信は全て HOLD。本書はコードを書かない。
- 停止位置: 本書の CEO 確認まで。**RJ2a GO はまだ無い**（GO 条件は §8.4）。
- 手法: 6 設計次元を並列設計（実 realityCore 読込で grounded）→ 6 敵対 red-team（gate 抜け穴攻撃）→ 統合。red-team が穴 6 件（blocker 2 / major 4）を発見し、本文に gate / 不変条件 / 適用順序として全封鎖。断片間 6 矛盾を §10 で確定。
- **RJ2-0A 改訂（2026-06-14）**: CEO 監査で発見した設計内 4 矛盾を補正（§0.2 INV-9/10/11 追加・§2/§3 G0 の notActionable 扱い修正・§4.2 ambiguity strip と clarification hard-gate の矛盾解消）。詳細は §11。

---

## 0. 思想と最上位不変条件

### 0.1 なぜ surface boundary が要るか

pure core は既に `decisionKind`（silent/observe/internal_prepare/ask_clarification/blocked）で「黙る／観測する／確認を求める／内部準備する／ブロックする」を決めている。だが core は答えていない:

- どの内部状態が **そもそも画面に出てよいか**（display gate）
- 出すとして **何を redact するか**（per-viewer / sensitive gate）
- 出すとして **どの粒度の claim まで言ってよいか**（断定 vs 兆候 vs unknown）
- 確認を **どの permission gate を通して聞いてよいか**

`decisionKind=ask_clarification` でも、相手不明・sensitive・他人所有・movement 未解決なら**そのまま画面に出してはいけない**。RJ2 surface 層は「core の判断 → 安全に提示可能な surface 集合」への **default-deny な射影**である。

### 0.2 最上位不変条件（全層・全 slice が継承・緩めない）

- **INV-0（一方向・経由強制）**: UI / Communication / 通知 / 配信レーンは `InterventionDecisionV0` 等の core 出力を **直接読まない**。必ず `JudgmentSurfacePlanV0`（§7-A）を経由する。core → surface plan →（HOLD）copy/配信 の一方向。
- **INV-1（緩めない）**: surface は core の `status` / `displayPolicy` / `eligibilityLevel` / `actionBoundary` / `decisionKind` を **一段も緩める方向に変換できない**。redact・抑制・段階化のみ可能で、許可の付与は不可。`unknown` を `visible` にしない。`blocked` を表示可能にしない。
- **INV-2（field-level evidence 必須）**: あらゆる surface 文面／claim／質問は **field-level evidenceRefs（`node#field`）** に裏打ちされる。reason code だけで文章を作らない。evidenceRefs を持たない主張は型として存在できない。
- **INV-3（default-deny）**: unknown を許可・安全・false に読み替えない。`sensitiveFlagged===false` を confirmed safe にしない。許可された surface だけが集合に入る（空が既定）。
- **INV-4（cap chain）**: `surface exposure ≤ decisionKind ≤ actionBoundary`。core が cap 済みの天井を surface で再発明・引き上げしない。
- **INV-5（不可逆境界）**: internal（L0/L3）↔ user-facing（L1/L2）の間に **不可逆境界**がある（§5）。境界は G4 Redaction gate。越えたものは撤回できない。
- **INV-6（確率・fake・unknown 0 化の禁止）**: %/確率/数値スコア/ゲージ化、fake ETA/leaveBy/prep/route/weather/currentLocation、unknown の 0/false/「問題なし」扱い、を全て禁止。
- **INV-7（authority 分離）**: viewer 判定の authority は常に server-side auth user id。`graphViewerKey`（擬名化キー）を権限判断に使わない。
- **INV-8（carry-not-relax の flag 適用）**: 上流の決定（decisionKind / actionBoundary / gate reasons / blocked 短絡）を carry するだけで緩めない。**特に G0 で短絡した時点で、後段が contact 系 flag を再評価・復活させてはならない**（red-team #5 由来・§4.5）。
- **INV-9（notActionable = 表示可・操作不可・RJ2-0A 採用 A）**: `displayPolicy==="notActionable"` は「**触ってはいけない**」であって「**見せてはいけない**」ではない。よって **L1 passive reference まで `show_redacted` で出せる**が、`SurfaceActionAffordance` は**必ず `none`** で、`clarificationOnly=false` ∧ `proposableShapes=[]` ∧ `departureLineRefs=[]` ∧ notification/contact 不可 ∧ raw evidenceRefs 不可 ∧ redaction 必須。sensitive/otherPeople/work/reservation/payment ではさらに `withhold` へ下げ得る。**G0 KILL は notActionable で L1+ を落とさない**（kill は `eligibilityLevel==="blocked"` または `decisionKind ∈ {silent, blocked}` のみ。silent/blocked 由来の抑制は decisionKind 経由で既に効く）。
- **INV-10（surface object ≠ user 表示）**: RJ2a/b/c が出すのは **surface plan / claim skeleton / question candidate の object** であって user-facing copy / UI 表示 / 通知ではない。`claimTextDraft` は null・`ClarificationQuestionCandidateV0` は文面なし。**L1/L2 は将来の surface category** であり RJ2a 時点では plan/candidate object に過ぎない。**actual user-facing surface emission は RJ2e 以降の CEO 承認まで HOLD**。本書の「v0 で出してよい（L1/L2/L3）」は「**この object を構築してよい**」の意で、「ユーザーに表示してよい」ではない。
- **INV-11（active_prompt 非配信・contactPolicy/deliveryModeCeiling は dispatch でない）**: `contactPolicy` / `deliveryModeCeiling` は **dispatch instruction ではない**（RC2c-2 注記の継承）。`active_prompt` は delivery command でなく、**G5 で v0 は active_prompt を落とす**。`active_prompt` 値があっても notification / push / chat message は出ない。**notification / contact は RJ2f まで型すら実行しない**。

---

## 1. 出力層の定義と分離（10 層）

各層は **internal（不可視）** か **user-facing（可視・不可逆）** に属する。**この 2 群の間に不可逆境界がある**（§5）。

| # | 層 | 群 | 接触/行動性 | v0 |
|---|---|---|---|---|
| L0 | **internal_judgment** | internal | 無接触（計算保持） | **出してよい** |
| L1 | **user_facing_judgment** | **user-facing** | 表示接触（受動 surface） | **出してよい（display-only・redaction 後）** |
| L2 | **clarification_question** | **user-facing** | 能動接触（尋ねる） | **出してよい（厳しい gate 下のみ）** |
| L3 | **internal_prepared_material** | internal | 無接触（裏で材料） | **出してよい（gate 無し時のみ・非表示）** |
| L4 | **proposal_candidate** | internal→border | 無接触（提案候補保持） | **HOLD** |
| L5 | **three_option_proposal** | **user-facing** | 表示接触（3 案） | **HOLD** |
| L6 | **departure_line** | **user-facing** | 表示接触（出発線） | **HOLD（v0 leaveBy 常に null・§3）** |
| L7 | **notification_contact_surface** | **user-facing** | 配信接触（push） | **HOLD（永久 gate）** |
| L8 | **external_communication** | **user-facing** | 対外接触 | **HOLD（safetyFlags 常設 block）** |
| L9 | **action_write** | action | 現実改変 | **HOLD（E10 本人選択のみ）** |

**分離規律（混ぜない）**:
- **L0 と L1 を混ぜない**。L0 は raw evidence・全 reason・全 trace を含むが、L1 は **redaction 後の generic/redact 済み displayLabel・id しか含めない**。L0→L1 は不可逆 redaction を通る（§5）。
- **L1（受動表示）と L2（能動質問）を混ぜない**。L1 は「兆候がある」を見せるだけ。L2 は接触であり `decisionKind === "ask_clarification"` を**必須**とする（red-team #5: clarification surface はこの必須を OR に弱めてはならない）。
- **L3 は絶対に user-facing にしない**。`contactPolicy === "internal_only"`・`deliveryModeCeiling === "none"`。L4/L5 への自動昇格をしない（red-team #3: internal_prepare は proposal の床にしない）。
- **L4 と L5 を混ぜない**。L4 は internal な候補保持。L5 表示には別 gate（RJ2+ best-action gate）を要する。

---

## 2. 6 gate の定義

| gate | 入力 | 落とす対象 |
|---|---|---|
| **G0 KILL** | `eligibilityLevel` / `decisionKind` | `eligibilityLevel==="blocked"` または `decisionKind==="blocked"` → 全消し + **全 contact 系 flag を false 確定（carry-not-relax の起点）**。silent は G1 で L0 のみに。**notActionable では kill しない**（INV-9・G4/affordance で操作不可化） |
| **G1 DECISION** | `InterventionDecisionV0.decisionKind`（**capped 後**） | exposure 上限決定: silent→全 silent / observe→L1 / internal_prepare→L3(無接触) / ask_clarification→L2 / blocked→全消し |
| **G2 PERMISSION** | `actionBoundary` | 行動性天井: display_only→L1 / draft_only→L3 / ask_confirmation→L2 / blocked→全消し。`min(G1,G2)` を採る |
| **G2.5 MOVEMENT-INPUT**（新規・red-team #1） | leaveByKnown / etaKnown / mobilityStatus / ern.leaveBy.value | departure 系 surface を `DepartureLineBoundaryV0` 経由に限定。v0 は構造的に全除外（departureLineRefs===[]） |
| **G3 EVIDENCE/CLAIM** | evidenceRefs(field-level) / confidence / 4 バケット / claimType cap | 裏付けなき主張・%・fake 値・断定・claimType 超過断定を落とす |
| **G4 REDACTION** | displayLabel / sensitiveFlagged / displayRedactionRequired / displayPolicy / server-side auth | **sensitive を G4 自身が完全 generic 化（red-team #4・§6）**・hidden/debugOnly/notActionable 除去・raw 落とす。**不可逆境界** |
| **G5 DELIVERY** | `deliveryModeCeiling` | v0 は none/passive_surface のみ。active_prompt/push/external を落とす |

---

## 3. Gate pipeline（1 本・適用順序の確定）

**順序が安全の本体**。早い段で exposure 天井を決め、遅い段で内容を削る。**本書はこの順序を唯一の正本として確定する。各断片の順序記述はこれに従属する。**

```
   5 評価器出力 (L0 internal_judgment) ───▶ GATE PIPELINE（上から順・どの段も上位決定を緩めない）
        │
        ▼
  [G0] KILL CHECK ───────────────────────────────────────────────────────────────────
        eligibilityLevel==="blocked" || decisionKind==="blocked" → 全層 silent（silent は次段 G1 で L0 のみに）
        ★ notActionable では kill しない（INV-9）。notActionable は L1 show_redacted + actionAffordance none で扱う（§6.3）
        ★ ここで blocked に短絡したら、clarificationOnly / proposableShapes / departureLineRefs /
          全 contact 系 flag を即 false/[] に確定。後段はこれを復活させない（INV-8・red-team #5）
        │ (pass)
        ▼
  [G1] DECISION GATE ← decisionKind (capped 後の値のみ)
        silent → L0 のみ / observe → L1 / internal_prepare → L3(無接触・user-facing 天井は L0/L1)
        ask_clarification → L2
        ★ internal_prepare は L3 止まり。proposal(L4)/3案(L5) に昇格しない（red-team #3）
        │
        ▼
  [G2] PERMISSION GATE (actionBoundary cap)
        display_only → L1 / draft_only → L3 / ask_confirmation → L2 / blocked → 全消し
        ⇒ min(G1 天井, G2 天井) を最終 exposure 天井（厳しい方が勝つ）
        │
        ▼
  [G2.5] MOVEMENT-INPUT GATE ← leaveByKnown / etaKnown / mobilityStatus / ern.leaveBy.value  ◀ 新規(red-team #1)
        departure 系 surface（出発時刻/逆算/prep開始/到着可否/遅延量/緊急通知/出発線）を
        plan に載せる前に必ず DepartureLineBoundaryV0 を計算し boundary==="allowed" を確認。
        leaveByKnown.value!==true || etaKnown.value!==true || mobilityStatus.value!=="resolved"
        || ern.leaveBy.value===null のいずれかで departure 系を全除外（v0 は構造的に全除外＝departureLineRefs===[]）。
        DepartureLineBoundaryV0 を経由しない departure ref 追加を型・walker で禁止。
        │
        ▼
  [G3] EVIDENCE / CLAIM GATE ← evidenceRefs / confidence / 4 バケット / claimType cap
        ・evidenceRefs(field-level) を持たない主張を落とす
        ・% / fake ETA/leaveBy/prep を落とす
        ・claimType 別 assertability cap（§7-C・feasibility_state は confirmed でも assert 不可＝red-team #6）
        ・exact_time_collision_ambiguous を duplicate と書かない / causality 断定なし
        ・confidence low/none → hedge へ格下げ
        │
        ▼
  [G4] REDACTION GATE ← displayLabel / sensitiveFlagged / displayPolicy / server-side auth
        ★ sensitiveFlagged===true(または unknown) なら G4 自身が displayLabel を category-free generic token("予定")へ置換。
          ern.displayLabel を「完全匿名」と信頼しない（red-team #4・§6・§4.4）。safeDisplayLabel=generic token のみ。
        ・displayPolicy hidden/debugOnly/notActionable を user-facing から除去
        ・graphViewerKey は authority に使わない（per-viewer 判定は server auth）
        ★ ここが L0(internal)→L1+(user-facing) の【不可逆境界】(§5)
        │
        ▼
  [G5] DELIVERY GATE（v0 常に閉） ← deliveryModeCeiling
        none / passive_surface のみ通す。active_prompt/push/external を落とす（L7 を落とす）
        │
        ▼
   ALLOWED SURFACE (v0):
     ├─ L1 user_facing_judgment   （decisionKind≥observe ∧ actionBoundary≥display_only ∧ G3/G4 通過・受動表示）
     ├─ L2 clarification_question （decisionKind===ask_clarification ∧ actionBoundary===ask_confirmation ∧ CLARIFY_CODES）
     └─ L3 internal_prepared_material（decisionKind===internal_prepare ∧ contactPolicy=internal_only・無接触・非表示）
   HOLD: L4 / L5 / L6 / L7 / L8 / L9
```

### 3.1 順序の根拠

- **天井（G0→G1→G2）を内容 gate（G3→G4）より先**に置く: 「内容を作ってから出すか決める」（leak リスク）ではなく「**出せる天井を決めてから、その範囲の内容だけ作って削る**」順。
- **G2.5 movement-input を G2 の直後・G3 の前**に置く: 出発線は「提案の一種」かつ movement-input の解決が前提。天井確定後すぐ departure 系を構造的に切り落とすことで、G3/G4 の自然言語生成に departure 材料が**そもそも渡らない**（red-team #1: leaveBy=null が ask_clarification を正当化しても、L2 の質問が出発時刻逆算に降りられない）。
- **G3 を G4 より先**: redaction 後の generic label でも evidence 整合を保つため（先に evidence 確定、後で表示名匿名化）。
- **G4 で genericize を G4 自身が実行**: surface 層は ern.displayLabel を「完全匿名」と信頼せず、自分で完全 generic 化する唯一の場所（red-team #4・§4.4）。
- **G5 を最後**: 配信判断は「何を」より「届け方」の最終ゲート。

### 3.2 各段で短絡したときの flag 確定（carry-not-relax）

| 短絡段 | 即時 false/[] に確定する flag | 復活禁止の保証 |
|---|---|---|
| G0 blocked | `clarificationOnly`, `proposableShapes`, `departureLineRefs`, `clarificationCandidateRefs`, 全 contact affordance | 後段 walker が「blocked なのに非空」を FAIL |
| G1 silent/observe | 上記 + L2 関連全て（observe は L1 まで） | INV-8 |
| G2.5 departure 不成立 | `departureLineRefs`, departure 系 claim refs | 型で DepartureLineBoundaryV0 経由を強制 |

---

## 4. 6 つの red-team 穴と封じ方（本文に組み込む不変条件）

red-team が見つけた穴（blocker 2 / major 4）を全て塞ぐ。各穴に対し **追加 gate / 不変条件 / 適用順序** を確定する。

### 4.1 穴#1（major）: leaveBy=null が ask_clarification を正当化し、出発線が質問の体裁で漏れる

leaveBy は v0 で常に null（leaveBy ガード8 + MovementReality の leaveByKnown/etaKnown/routeKnown 全 false・mobilityStatus 常に unresolved）。これが core で unresolvedCriticalInput（leave_by_unresolved / eta_source_missing）→ feasibility unknown → eligibility requires_confirmation → ask_clarification を正当化する。surface 側 gate が movement-input を読まないため、L2 で「何時に出る予定ですか／逆算すると何時に出れば間に合いますか」を**質問の体裁**で出発線そのものを surface できる。

**封じ方**:
- **G2.5 MOVEMENT-INPUT GATE を新設**（§3）。departure 系 surface を plan に載せる唯一の入口を `DepartureLineBoundaryV0`（boundary==="allowed"）経由に限定。
- **INV-DEP-A（leaveBy gate）**: leaveBy 系 surface（出発時刻/逆算/prep開始/到着可否/遅延量/緊急通知/出発線）が plan に存在するなら、対象 mv の `leaveByKnown.value===true ∧ etaKnown.value===true ∧ mobilityStatus.value==="resolved" ∧ ern.leaveBy.value!==null` が全成立。一つでも欠ければ FAIL。**v0 は構造的に全 false ゆえ `departureLineRefs===[]` を walker が直接 assert**（散文依存をやめる）。
- **INV-DEP-B（ordering）**: 任意の departure 系 ref を `JudgmentSurfacePlanV0` に載せる前に `DepartureLineBoundaryV0` を必ず計算。これを経由しない departureLineRef 追加を型・walker で禁止。
- **INV-DEP-C（質問種別 allowlist）**: `ClarificationQuestionKind` から「出発時刻/逆算/leaveBy を user に問う」種別を**構造的に排除**。`movement_unresolved` 質問は『移動の有無/場所が未確定』までに限定し、出発時刻を逆算・提示する文に降りられない（`ClarificationQuestionCandidate.violations` で固定）。
- **INV-DEP-D（suppressed を正直に）**: `suppressedSurfaces` に `leave_by_unresolved` / `eta_source_missing` を field-level evidence 付きで残し、unknown を質問・逆算に化けさせない default-deny を walker で強制。

### 4.2 穴#2（major）: ambiguity 下で prepare が生き残り、soft duplicate 断定として漏れる

**事実訂正**: core（`interventionEligibility.ts`）では ambiguity 下でも `canSuggestPrepare=true` のまま生き残る（prepare は schedule を変えないため noChange 判定外）。各断片の「ambiguity 下では askClarification のみ残る」は**誤り**。

**封じ方**:
- **INV-AMB-A（ambiguity strip — RJ2-0A 修正）**: `exact_time_collision_ambiguous` が confirmationReasons/failureModes に存在するとき、`proposableShapes` から **prepare を含む全 change/prepare shape を除外**し `proposableShapes=[]` を強制する。**ただし `clarificationOnly=true` は強制しない**（§4.5 INV-CLAR との矛盾を解消）。ambiguity は **clarification の材料（`clarificationEligibleReason`）にはなる**が、それだけで clarification surface を出さない。`clarificationOnly=true` は §4.5 INV-CLAR-A に従い **`decisionKind==="ask_clarification"` を通った場合のみ**。`decisionKind=observe` のときは ambiguity があっても clarification surface を出さない（observe→L1 まで）。
- **INV-AMB-B（walker）**: `proposalCandidateBoundaryViolations` に「**ambiguity reason が存在するのに `proposableShapes.length>0` → FAIL**」を追加。
- **INV-AMB-C（順序）**: ambiguity strip を `proposableShapes` 構築の**最初**に置き、後段で緩めない。ambiguity 下の許可出口は **decisionKind に従い**: `ask_clarification` なら ask_clarification（質問候補）/ `observe` なら observe（L1 のみ）/ それ未満なら抑制。ambiguity 単独で接触を発火しない。
- **INV-AMB-D（handoff 二重化）**: 「proposableShape=prepare であっても、その event/scope に ambiguity reason がある場合は Communication は文面生成を禁止」を §7-D 下流契約に追加。

### 4.3 穴#3（major）: high collapse risk だけで internal_prepare→proposal を取れる（2 断片の不一致）

**矛盾解消**: `output-layers` 断片（internal_prepare→L3 止まり・L4 全 HOLD）と `proposal-departure` 断片（internal_prepare を proposal 生成の床に許可）が不一致。**本書は output-layers 側を採り、proposal-departure を上書きする**。

**封じ方**:
- **INV-PROP-A（提案の床を ask_clarification に引き上げ）**: `ProposalCandidate` 作成条件 P1 を `decisionKind === "ask_clarification"` **のみ**に修正（internal_prepare を除外）。internal_prepare は L3 止まり（無接触・非表示）で L4 に昇格しない。
- **INV-PROP-B（Decision Gate fail 拡張）**: proposal/3案 を pass させない decisionKind を **{silent, observe, internal_prepare, blocked}** に拡張。proposal は ask_clarification でのみ pass。
- **INV-PROP-C（walker）**: `proposalCandidateBoundaryViolations` に「**boundary==="allowed" なのに decisionKind ≠ "ask_clarification" → FAIL**」を追加。
- **INV-PROP-D（不変条件文）**: 「`high_collapse_risk` は CLARIFY_CODES 外であるため、単独では proposal/3案/active_prompt/write_anchor のいずれにも到達しない（internal_prepare は無接触・非表示の準備材料止まり）」を確定。

### 4.4 穴#4（blocker→精度修正後 major）: sensitive displayLabel の category hint と genericize の所在

**事実の精緻化**: `ern.displayLabel` は EventNode 段で「常に安全な表示用ラベル」化される（sensitive なら generic）。red-team の「reality core で genericizer が走らない」は不正確（generic 化は EventNode build 時に済む）。**ただし** (a) generic 形は `sensitiveCategory` 由来の**カテゴリ hint を運び得る**（「通院系」等の branching）、(b) surface 層が upstream の generic 化を**唯一の保証として依存するのは脆い**。

**封じ方（defense-in-depth）**:
- **INV-RED-A（前提を信頼しない）**: surface 層は ern.displayLabel を「完全匿名」と信頼しない。G4 は `ern.sensitiveFlagged===true` **または unknown**（default-deny per RC2c-1A: false≠safe）のとき、**viewer に関わらず** displayLabel を **category-free generic token**（「予定」）へ G4 自身が置換。
- **INV-RED-B（grain ladder は generic 済み文字列に作用）**: grain ladder は G4 が生成した already-genericized 文字列に作用させ、raw ern.displayLabel には作用させない。sensitive node の `safeDisplayLabel` = generic token のみ、never node.displayLabel。
- **INV-RED-C（walker）**: 「**source ern が sensitiveFlagged===true（または unknown）の全 surface item は safeDisplayLabel===category-free token ∧ safeDisplayLabel !== ern.displayLabel、さもなくば FAIL**」。
- **INV-RED-D（順序）**: この genericize は G4 内で L1/SurfaceProjection emission の前に走る。consumer は sensitive node の ern.displayLabel を読むことを禁止（safeDisplayLabel のみ読む）。

### 4.5 穴#5（blocker）: clarification surface が decisionKind を迂回し、permission unknown/observe で確認質問が出る

仮設計では `clarificationOnly` を `canSuggestAskClarification`（eligibilityLevel と独立・permission unknown でも true）から導いていた。結果、decisionKind=observe・permission unknown で確認質問（=不可逆接触）が出る。

**封じ方**:
- **INV-CLAR-A（単一 hard-gate）**: `clarificationOnly` / `clarificationCandidateRefs` / L2 clarification surface / `ClarificationQuestionCandidate` の**すべて**を、`canSuggestAskClarification` ではなく **capped 後の `decisionKind`** に hard-gate。「**`decisionKind !== "ask_clarification"` のとき `clarificationOnly=false` ∧ `clarificationCandidateRefs=[]` ∧ 一切の確認質問 slot を生成しない**」。
- **INV-CLAR-B（両 walker に焼く）**: `proposalCandidateBoundaryViolations` と `surfacePlanViolations` の両方に機械検証ルールとして追加。
- **INV-CLAR-C（順序・carry-not-relax）**: G0 で blocked に短絡した時点で `clarificationOnly` を含む全 contact 系 flag を false 確定し、後段が復活させない（§3.2）。
- **INV-CLAR-D（生成 predicate を walker 化）**: `ClarificationQuestionCandidate` 生成 predicate「`canSuggestAskClarification===true ∧ decisionKind==="ask_clarification"`」の AND を walker で固定。**FAIL 再現 fixture**: permission unknown + sensitive_flagged + decisionKind=observe → clarification surface が 1 件でも出たら FAIL。
- **INV-CLAR-E（canSuggest* を直接 contact に使わない）**: 「eligibility.canSuggestAskClarification は eligibilityLevel と独立に true になり得る（permission unknown でも true）」を明記し、surface は `canSuggest*` を直接 contact 判定に使わず**必ず decisionKind 経由**にする。

### 4.6 穴#6（major）: feasibility_state claim が confirmed→assert で「間に合わない/間に合います」断定を漏らす

assertability 導出表は claimType 別 cap を多くの type に明示したが、**feasibility_state を cap 対象から落としていた**。`feasibilityStatus="infeasible"` は confirmedBlockingReasons 由来ゆえ正当に `uncertaintyLabel="confirmed"` を取り、generic 行 confirmed→assert→visible に素通りする。

**封じ方**:
- **INV-FEAS-A（feasibility_state 専用 cap）**: `feasibility_state` claim は `uncertaintyLabel` が confirmed であっても **assertability 上限を hedge** とし、temporal/arrival 語（「間に合う」「間に合わない」「遅れる」「余裕」）への断定写像を禁止。**`feasibility_state は assert を持てない`**。
- **INV-FEAS-B（positive ケースも明示）**: blocker ゼロの feasible status は `uncertaintyLabel="inferred"`（または専用 `feasible_not_asserted`）→ hedge 上限に固定。synthetic feasible が confirmed→assert に化ける経路を閉じる。
- **INV-FEAS-C（confirmed の語れる範囲を限定）**: feasibility_state が `confirmed_time_conflict` を語れるのは「schedule 上の確定衝突がある」という構造記述（structural_fact 寄り）に限定し、arrival/timing 断定への写像を禁止。
- **INV-FEAS-D（順序）**: この cap は §7-C の generic confirmed 行より**先に評価される claimType-specific override**（最弱経路 fail-closed を保つ）。

---

## 5. internal ↔ user-facing の不可逆境界

**境界は G4 Redaction gate**。越えたものは「ユーザーが見た/聞いた」になり撤回できない。

- **L0 は raw**: 全 reason / 全 evidenceRefs（node#field の生 id）/ 全 4 バケット / 全 trace / sensitiveFlagged の真値 / blockedReasons の中身。**これがそのまま漏れることが最大の事故**。
- **L1+ は redact 後のみ**: `safeDisplayLabel`（sensitive は G4 が generic 化）/ `riskLevel` の分類語 / 「兆候あり」1 行。**raw evidenceRefs の生 id・raw title・sensitive category・他者の予定詳細を含めない**。
- **不可逆性の含意**:
  1. **silent と observe を混同したら不可逆 leak**。silent は「再評価条件すら持たない＝何も出さない」。G1 で decisionKind を厳密に読む。
  2. **L3 を user-facing に昇格させない**。L3→L1/L2 の自動昇格を構造的に禁止（contactPolicy=internal_only を握り潰さない）。internal_prepare は proposal にも昇格しない（INV-PROP-A）。
  3. **clarification(L2) は「接触」=不可逆**。CLARIFY_CODES の実質理由があり、かつ `decisionKind==="ask_clarification"` のときのみ（unknown だから聞く、を禁止・INV-CLAR）。
  4. **redaction を後段で緩めない**。G4 を通った後に「もっと詳しく」分岐を作らない。詳細化は L0 に戻って全 pipeline を再通過。
  5. **memory/correction で redaction/permission を緩めない**。「前回見せたから今回も」を作らない。

> **一行原則**: *core(L0) は何でも知ってよい。user(L1+) には、G4 redaction（sensitive は generic 化）を通り、天井に収まり、field に裏打ちされ、blocked でなく、断定が claimType cap を超えないものだけが、撤回不能と知った上で届く。*

---

## 6. Redaction / per-viewer

### 6.1 4 つの非対称分離（いずれか一方を満たしても他方の許可にならない）

| 軸 | 弱い側 | 強い側 | 混同事故 |
|---|---|---|---|
| display vs action | 見せてよい | 行動してよい | display_only を「触ってよい」と読み move/送信 |
| visible vs actionable | 表示候補 | 操作候補 | notActionable をボタンにする |
| shared vs private | 本人に見せてよい | 他 viewer に見せてよい | 他人の予定の存在・内容を漏らす |
| redacted label vs raw evidence | redact 済み表示文字列 | field 識別子/生テキスト | evidenceRefs を UI に出す/生 title を出す |

### 6.2 display permission と action permission の分離（型で別 field）

```ts
SurfaceVisibility = "show" | "show_redacted" | "count_only" | "existence_only" | "withhold";
SurfaceActionAffordance = "none" | "observe_only" | "offer_clarification" | "offer_confirmation_required";
```
- 積の規律: `SurfaceVisibility=withhold` ⇒ `SurfaceActionAffordance=none`。逆は不成立（show でも none はありうる）。
- v0 天井 = `offer_confirmation_required`（write_anchor 以上は surface に出さない）。

### 6.3 displayPolicy 写像（緩めない）

| core displayPolicy | SurfaceVisibility | SurfaceActionAffordance |
|---|---|---|
| `visible`（confirmed/inferred） | `show`（sensitive なら G4 で generic 化＝`show_redacted` 以下へ） | core decision に従う |
| `notActionable` | `show_redacted`（参考表示） | **必ず `none`** |
| `hidden` | `withhold` | `none` |
| `debugOnly` | `withhold`（dev channel のみ） | `none` |

### 6.4 RedactionGrain ラダーと G4 genericize（red-team #4 反映）

```ts
RedactionGrain = "full" | "generic" | "count_only" | "existence_only" | "withhold"; // 単調・下げるのみ
```
- **G4 が sensitive を自分で generic 化する**（INV-RED-A〜D）。`ern.sensitiveFlagged===true || unknown` のとき、`grain=full` でも `safeDisplayLabel = category-free token("予定")`、never `ern.displayLabel`。
- **未検出を安全と扱わない（INV-3）**: `sensitiveFlagged=false` / gate code unknown のとき full に上げず generic 以下を保持。
- カテゴリ別最小粒度（本人 viewer / 他 viewer）:

| カテゴリ | 本人 viewer 最小 | 他 viewer 最小 |
|---|---|---|
| sensitive（true or unknown） | **`generic`（G4 で token 化）** | `existence_only` 以下 |
| otherPeople | `full` | `withhold`（片想い非表示） |
| work/shift | `full` | `generic` 以下 |
| reservation/payment | `full` | `existence_only` 以下 |

最終 `grain = min(displayPolicy 上限, 各 category floor, viewer floor)`。

### 6.5 raw evidenceRefs 非露出

`evidenceRefs` / `missingInputRefs` / `relationRefs` / `propagationEdges.edgeId` / `sourceRefs` / `dedupeKey` を user-facing surface に**出さない**（内部 trace 専用）。consumer payload に field 識別子を一切含めない。

### 6.6 per-viewer projection

- **projection 単調性**: `self ⊇ shared ⊇ external`。self で withhold は他 scope でも withhold。
- **owner 非対称**: viewer が anchor owner でない event は display 許可されても action affordance は常に `none`。
- **authority 分離（INV-7）**: viewer 判定の authority は server-side auth user id。`graphViewerKey` を権限判断に使わず、surface payload にも含めない。pure core 層は viewer authority を持たず、surface boundary は server 境界で auth を受け取って初めて projection を確定。

---

## 7. 型案一覧（skeleton のみ・実装しない）

本 slice が**所有**する型と、他 slice が出す**参照のみ**の型を分ける。

### 7-A. JudgmentSurfacePlanV0（RJ2a 所有・root）

```ts
// RJ2a-0A: internal_only を追加（internal_prepare 用）。**非線形**: internal_only は user-facing でなく
// passive_only/ask_eligible とは別枝。user-facing exposure は none=internal_only < passive_only < ask_eligible。
//   none        : 何も surface 化しない
//   internal_only: internal prepared material boundary。**user-facing 不可**（internal 準備のみ許可）
//   passive_only: L1 passive object を将来作れる可能性（copy/UI はまだ不可）
//   ask_eligible : L2 clarification candidate object を将来作れる可能性（文面はまだ不可）
export type SurfaceExposureLevel = "none" | "internal_only" | "passive_only" | "ask_eligible";

export interface JudgmentSurfacePlanV0 {
  readonly schemaVersion: 0;
  readonly targetScope: TargetScope;
  readonly targetNodeId: string | null;
  // ── decision → surface 語彙（decisionKind を超えない） ──
  readonly exposureLevel: SurfaceExposureLevel;     // ≤ capped decisionKind
  readonly carriedDecisionKind: DecisionKind;       // 監査用 carry
  readonly carriedActionBoundary: ActionBoundary;
  // ── 許可された surface 集合（default-deny・空起点） ──
  readonly allowedClaimRefs: ReadonlyArray<string>;
  readonly clarificationCandidateRefs: ReadonlyArray<string>; // INV-CLAR: decisionKind!==ask_clarification なら []
  readonly proposalCandidateRefs: ReadonlyArray<string>;      // v0 []
  readonly departureLineRefs: ReadonlyArray<string>;          // INV-DEP-A: v0 構造的に [] を walker が直接 assert
  // ── surface gate（飛ばせない） ──
  readonly redactionPolicyRef: string | null;
  readonly permissionGateRef: string | null;
  readonly displayRedactionRequired: boolean;       // carry・無視不可
  readonly clarificationOnly: boolean;              // INV-CLAR-A: decisionKind===ask_clarification 以外で false 強制
  // ── 正直さ ──
  readonly suppressedSurfaces: ReadonlyArray<{ surfaceKind: string; reason: FeasibilityReason }>; // INV-DEP-D
  readonly whyExposable: ReadonlyArray<FeasibilityReason>;
  readonly whyNotExposable: ReadonlyArray<FeasibilityReason>;
  readonly missingInputRefs: ReadonlyArray<MissingInputRef>;
  readonly evidenceRefs: ReadonlyArray<string>;     // field-level
  readonly confidence: JudgmentConfidence;
  readonly sourceRefs: { snapshotId: string; interventionDecisionId: string; eligibilityId: string };
  readonly trace: { /* surfacePlanId / chain id / evidenceRefs / missingInputRefs */ };
}
```
**型に焼く不変条件**: `exposureLevel ≤ carriedDecisionKind` / `allowedClaimRefs`,`proposalCandidateRefs`,`departureLineRefs` は default-deny（空既定）/ `clarificationOnly` は `carriedDecisionKind==="ask_clarification"` 以外で false（INV-CLAR-A）/ `departureLineRefs` は DepartureLineBoundaryV0 経由のみ（INV-DEP-B）/ v0 `proposalCandidateRefs===[] ∧ departureLineRefs===[]`。

### 7-B. ClarificationQuestionCandidateV0（RJ2c 所有・文面なし）

```ts
export type ClarificationQuestionKind =
  | "relational_unknown" | "reservation_payment_unknown" | "work_shift_unknown"
  | "exact_time_collision"     // duplicate 断定なし
  | "place_unresolved"
  | "movement_unresolved"      // INV-DEP-C: 「移動の有無/場所が未確定」までに限定・出発時刻逆算に降りない
  | "permission_origin_unknown";
  // ★ INV-DEP-C: 「出発時刻/逆算/leaveBy を user に問う」種別は構造的に列挙外（追加禁止）

export interface ClarificationQuestionCandidateV0 {
  readonly schemaVersion: 0;
  readonly questionKind: ClarificationQuestionKind;   // 文面なし・kind まで
  readonly targetRefs: ReadonlyArray<string>;
  readonly missingInputRefs: ReadonlyArray<MissingInputRef>;
  readonly blockedIfMissing: ReadonlyArray<string>;
  readonly permissionGate: {
    readonly requiresConfirmationContext: boolean;
    readonly involvesOtherParty: boolean;             // 他者存在を推測させない
    readonly redactionRequired: boolean;
  };
  readonly relatedRelationRefs: ReadonlyArray<string>; // exact_time_collision の relationId
  readonly evidenceRefs: ReadonlyArray<string>;        // field-level
  readonly confidence: JudgmentConfidence;
  readonly violations: ReadonlyArray<string>;          // INV-DEP-C / INV-CLAR-D を焼く walker 出力
  readonly sourceRefs: { snapshotId: string; eligibilityId: string; interventionDecisionId: string };
  readonly trace: { /* questionCandidateId / chain id / evidenceRefs / missingInputRefs */ };
}
```
**型に焼く不変条件**: 文面なし（text field なし）/ 生成は `canSuggestAskClarification===true ∧ decisionKind==="ask_clarification"` のときのみ非空（INV-CLAR-D）/ `exact_time_collision` は duplicate 断定なし / leaveBy 逆算質問は kind に存在しない（INV-DEP-C）。

### 7-C. SurfaceClaimV0（RJ2b 所有）

```ts
type SurfaceClaimType =
  | "structural_fact" | "feasibility_state" | "risk_surface" | "propagation_surface"
  | "conflict_relation" | "ambiguity_note" | "unresolved_input" | "eligibility_note" | "intervention_state";
type ClaimAssertability = "assert" | "hedge" | "withhold";
type ClaimUncertaintyLabel = "confirmed" | "inferred" | "unresolved" | "ambiguous" | "blocked";
type ClaimSourceLane = "ern" | "feasibility" | "collapse_risk" | "propagation" | "eligibility" | "decision";

interface SurfaceClaimV0 {
  readonly schemaVersion: 0;
  readonly claimId: string;                    // 決定的 cache key・authority でない
  readonly claimType: SurfaceClaimType;
  readonly sourceLane: ClaimSourceLane;
  readonly targetScope: TargetScope;
  readonly targetNodeId: string | null;
  readonly relationRef: string | null;         // conflict_relation は非 null（pairwise 限定）
  readonly claimTextDraft: null;               // v0 常に null（文面は別 slice）
  readonly sourceRefs: ReadonlyArray<string>;
  readonly evidenceRefs: ReadonlyArray<string>; // ≥1 必須（INV-2）・node#field のみ
  readonly missingInputRefs: ReadonlyArray<MissingInputRef>;
  readonly uncertaintyLabel: ClaimUncertaintyLabel;
  readonly assertability: ClaimAssertability;   // §7-C 導出表でのみ決定
  readonly confidence: JudgmentConfidence;      // 質的のみ・% 不可
  readonly blockedIfMissing: ReadonlyArray<string>;
  readonly redactionPolicy: /* SurfaceClaimRedactionPolicy */ unknown;
  readonly displayPolicy: RealityDisplayPolicy;
  readonly actionBoundaryCeiling: ActionBoundary | null;
  readonly trace: { /* claimId / lane / sourceArtifactId / derivedFromCodes / evaluatedAtInstant */ };
}
```

**assertability 導出表（claimType-specific override が generic 行より先に評価＝fail-closed）**:

| uncertaintyLabel | generic 既定 | claimType-specific override |
|---|---|---|
| `confirmed` | assert / visible | **`feasibility_state` → hedge 上限・assert 不可（INV-FEAS-A）**。arrival/timing 語禁止。confirmed_time_conflict は structural_fact 寄り構造記述のみ（INV-FEAS-C） |
| `inferred` | hedge / visible | — |
| `unresolved` | hedge（正直に出す）or withhold | — |
| `ambiguous` | hedge・**assert 禁止**（ambiguity_note は永久 hedge 以下） | — |
| `blocked` | withhold / hidden | — |
| （feasible・blocker ゼロ） | — | **`uncertaintyLabel="inferred"`（or `feasible_not_asserted`）→ hedge 上限（INV-FEAS-B）** |

追加 cap（常に保守側・降格は一方向）: `intervention_state` → hedge 上限（接触命令でない）/ `risk_surface`,`propagation_surface` → unknown は withhold・elevated/high でも hedge（数値断定なし）/ `conflict_relation` → confirmed_time_conflict のみ assert・pairwise 限定 / redaction 未通過 → withhold 降格 / `blockedIfMissing` に未解決 ref → withhold 降格。

### 7-D. 他 slice 所有型（参照のみ）

| 型 | 所有 slice | 本 plan からの参照 | 制約 |
|---|---|---|---|
| `ProposalCandidateBoundaryV0` | RJ2d | `proposalCandidateRefs` | boundary のみ。**P1=ask_clarification（internal_prepare 除外・INV-PROP-A）**。ambiguity strip（INV-AMB-A）。v0 実体空 |
| `DepartureLineBoundaryV0` | RJ2d/RC4 | `departureLineRefs` | **v0 全面 blocked（§3）**。departure 系の唯一の入口（INV-DEP-B） |
| `SurfaceRedactionPolicyV0` | RJ2b | `redactionPolicyRef` | per-viewer/sensitive redaction の正本。**G4 で genericize（INV-RED-A）** |
| `SurfacePermissionGateV0` | RJ2d | `permissionGateRef` | eligibility gate の surface 投影。`deliveryAllowed=false`・memory/correction で緩めない |

### 7-E. ProposalCandidateBoundaryV0 / DepartureLineBoundaryV0（RJ2d skeleton・要点のみ）

```ts
export type ProposableShape = "move" | "shorten" | "skip" | "prepare"; // delegate は v0 常に false
export interface ProposalCandidateBoundaryV0 {
  readonly schemaVersion: 0;
  readonly boundary: "allowed" | "blocked";
  readonly proposableShapes: ReadonlyArray<ProposableShape>;  // INV-AMB-A: ambiguity 下で [] 強制
  readonly clarificationOnly: boolean;                        // INV-CLAR-A: decisionKind===ask_clarification 以外で false
  readonly threeOptionBoundary: "allowed" | "blocked";        // decisionKind===ask_clarification 必須
  readonly decisionKind: DecisionKind;   // carry
  readonly actionBoundary: ActionBoundary; // carry
  readonly gateOutcomes: { permissionGate: "pass"|"blocked"; decisionGate: "pass"|"suppressed"; redactionGate: "pass"|"required" };
  readonly evidenceRefs: ReadonlyArray<string>;
  // ... sourceRefs / confidence / displayPolicy / trace
}
export interface DepartureLineBoundaryV0 {
  readonly schemaVersion: 0;
  readonly boundary: "allowed" | "blocked";                   // v0 構造的に常に blocked
  readonly forbiddenOutputs: { /* departureTime; departureLine; backwardPlanning; prepStartTime;
    arrivalFeasibility; urgencyNotice; routeDuration; delayAmount */ }; // v0 全 true
  readonly resolvedGates: { /* leaveByKnown; etaKnown; placeResolved; mobilityResolved;
    proposalBoundaryAllowed; noExternalDependency */ }; // v0 全 false（INV-DEP-A）
  readonly unresolvedDepartureInputs: ReadonlyArray<string>;  // eta_source_missing 必須
  // ... mobilityStatusValue("unresolved") / displayableFacts / evidenceRefs / trace
}
```

### 7-F. SurfacePermissionGateV0 / SurfaceProjectionV0（RJ2b/d skeleton・要点）

- `SurfacePermissionGateV0`: `visibility`(display) と `actionAffordance`(action) を別 field。`deliveryAllowed: false`。action cap: blocked/silent→none, observe/internal_prepare→observe_only, ask_clarification→offer_clarification/offer_confirmation_required。`SurfaceActionAffordance ≤ offer_confirmation_required`。
- `SurfaceProjectionV0`: consumer payload。**core 型・id・evidenceRefs・raw を含まない**。`surfaceItemKey`(擬名化・復元不能)・`safeDisplayLabel`(G4 generic 化後)・`whyShown`(reason code のみ)・`withheldExistsButHidden`(他 viewer に常に false)。`graphViewerKey` を含めない。

---

## 8. 禁止表現・断定リスト + 監査不変条件 + 次 slice

### 8.1 禁止断定リスト（A1–A8・surface violations walker で機械検証）

| 群 | 禁止 | 由来 / 封じる穴 |
|---|---|---|
| A1 時間断定 | 「遅れます/間に合いません/間に合います/余裕です」断定・出発時刻提示 | etaKnown/leaveByKnown false。**feasibility_state cap（穴#6）**・movement-input gate（穴#1） |
| A2 捏造 | fake ETA/leaveBy/prep/weather/currentLocation | 全レーン不変条件 |
| A3 確率 | %/確率・riskLevel/propagationLevel をゲージ・数値スコア化・composite 単一スコア | 分類≠probability |
| A4 unknown | unknown を 0/false/「問題なし」・sensitiveFlagged=false を「safe 確定」・unknown gate を confirmed-absent | default-deny |
| A5 duplicate | exact_time_collision を「重複/ダブり」断定・ambiguity 根拠の move/skip/**prepare**・「同じ相手/場所だから同一」 | ambiguity≠duplicate・**ambiguity strip（穴#2）** |
| A6 単独昇格 | high risk だけで通知/active prompt/**proposal**・infeasible だけで提案・propagation で因果断定 | **proposal 床=ask_clarification（穴#3）** |
| A7 permission | permission 未確定で行動提案・otherPeople/reservation/payment/work/sensitive を確認なしで前提化・他人所有を同列・**memory/correction で gate を緩める** | RC2c-1 |
| A8 surface 固有 | silent/blocked を露出・core 直結・decisionKind を超える surface・graphViewerKey を authority・reason code だけで文章 | INV-0/4/7 |

### 8.2 監査用 surface 不変条件（fixture が検証・空=適合）

1. `decisionKind ∈ {silent, blocked}` のとき user-facing 層（L1–L8）が空。
2. user-facing 文面 token が field-level evidenceRefs に traceable。
3. user-facing に %/数値確率/fake ETA/leaveBy/prep が出ない。
4. `exact_time_collision_ambiguous` を「重複/duplicate/衝突確定」と書かない。
5. **`sensitiveFlagged===true（or unknown）の全 surface item: safeDisplayLabel===category-free token ∧ !== ern.displayLabel**（穴#4・INV-RED-C）。
6. L2 は `decisionKind==="ask_clarification"` ∧ CLARIFY_CODES。**`decisionKind !== ask_clarification` なら clarificationOnly=false ∧ clarificationCandidateRefs=[]**（穴#5・INV-CLAR-B）。**FAIL 再現**: permission unknown + sensitive_flagged + decisionKind=observe → clarification surface 1 件で FAIL。
7. surface exposure ≤ min(decisionKind 天井, actionBoundary cap)。
8. `deliveryModeCeiling==="active_prompt"` の surface が存在しない。
9. L3 が user-facing に露出していない（contactPolicy=internal_only）。
10. L4–L9 が v0 で 1 件も通過していない。
11. **`departureLineRefs===[]` を walker が直接 assert**（散文依存しない・穴#1・INV-DEP-A）。**FAIL 再現**: leaveBy=null + decisionKind=ask_clarification → 出発時刻逆算質問が 1 件で FAIL。
12. **ambiguity reason 存在で `proposableShapes.length>0` → FAIL**（prepare 含む・穴#2・INV-AMB-B）。
13. **boundary==="allowed" なのに `decisionKind !== "ask_clarification"` → FAIL**（internal_prepare すり抜け防止・穴#3・INV-PROP-C）。
14. **feasibility_state claim の assertability が hedge を超える（assert）→ FAIL**（穴#6・INV-FEAS-A）。temporal/arrival 語への断定写像 → FAIL。
15. evidenceRefs / sourceRefs / dedupeKey / graphViewerKey が consumer payload に漏れたら FAIL。

### 8.3 次 slice 案

| slice | 出力 | gate / HOLD |
|---|---|---|
| **RJ2a** | `JudgmentSurfacePlanV0` 型 + `deriveSurfacePlan` + `surfacePlanViolations` walker | exposureLevel cap・default-deny・INV-CLAR-A/INV-DEP-A/B を型と walker に焼く。他 slice 型は id ref のみ。文面・配信 HOLD |
| **RJ2b** | `SurfaceClaimV0` + `SurfaceRedactionPolicyV0` + claim 生成器 | **G4 genericize（穴#4）**・**feasibility_state cap（穴#6）**・assertability claimType override を walker 化。文面なし |
| **RJ2c** | `ClarificationQuestionCandidateV0` pure 生成器 | **INV-CLAR-D（decisionKind AND）**・**INV-DEP-C（leaveBy 逆算質問を kind から排除）**を walker 化。文面なし |
| **RJ2d** | `ProposalCandidateBoundaryV0` + `DepartureLineBoundaryV0` + `SurfacePermissionGateV0` | **P1=ask_clarification（穴#3）**・**ambiguity strip（穴#2）**・**movement-input gate（穴#1）**・departure v0 全面 blocked |
| **RJ2e** | user-facing copy | **HOLD**。RJ2a–d 完了 + redaction fixture PASS + CEO 承認まで（禁止断定は文面で最も起きやすい） |
| **RJ2f** | notification/contact | **HOLD**。配信は CEO 承認必須。B2/R6 reaction ledger + RJ2e + CEO 個別承認まで。型すら定義しない |

### 8.4 RJ2a GO 条件

全て pure・保存ゼロ・UI ゼロ・配信ゼロ・新規 read ゼロ・文面ゼロ:
1. `JudgmentSurfacePlanV0` + `SurfaceExposureLevel` 型定義。
2. `ClarificationQuestionCandidateV0` 型定義のみ（生成は RJ2c）。
3. `deriveSurfacePlan(decision, eligibility, chain)` — 許可集合編成（default-deny・cap・suppressedSurfaces 正直化・displayRedactionRequired carry・**INV-CLAR-A: clarificationOnly を decisionKind に hard-gate**・**INV-DEP-A: departureLineRefs を構造的 [] に**）。
4. `surfacePlanViolations` walker — §8.2 の 1/6/7/11/12/13/15 を最低限 FAIL 検出。
5. 他 slice 型は id 文字列 ref のみ。
6. fixtures: silent/blocked→none / observe→passive_only / internal_prepare→passive_only[非接触] / ask_clarification→ask_eligible / displayRedactionRequired carry / suppressedSurfaces evidence / **穴#1（leaveBy=null+ask_clarification→departure 質問 FAIL）** / **穴#5（permission unknown+sensitive+observe→clarification FAIL）** を synthetic で FAIL 再現。

**完了条件**: tsc baseline 維持（55・additive）・全 fixture PASS・既存 6 判断器ファイル不接触・tree clean・本書との契約一致。

---

## 9. Department Responsibility Matrix（RJ2-0・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Communication**（surface 提示境界を所有・RJ2e/f は HOLD） |
| consultedDepartments | Permission（decisionKind/eligibility/actionBoundary carry 元）・Risk（claim evidence 源）・Plan/Mobility/Context（node refs） |
| blockingDepartments | **Permission**（surface 露出可否の最終拒否権・default-deny 正本）+ **CEO**（RJ2e copy / RJ2f 配信は承認必須） |
| outputs | JudgmentSurfacePlanV0 + ClarificationQuestionCandidateV0 + SurfaceClaimV0（型 skeleton）+ 禁止断定リスト(A) + gate pipeline(§3) + slice 分割(§8.3) |
| safetyGate | **core 直結禁止（surface plan 経由必須・INV-0）**・**exposureLevel ≤ decisionKind ≤ actionBoundary**・default-deny・禁止断定(A1–A8) を walker 機械検証・unknown 非 0・確率/%なし・duplicate 断定なし・**G4 sensitive genericize（穴#4）**・**clarificationOnly を decisionKind hard-gate（穴#5）**・**movement-input gate で departure 構造遮断（穴#1）**・**ambiguity strip で prepare 除外（穴#2）**・**proposal 床=ask_clarification（穴#3）**・**feasibility_state assert 禁止（穴#6）**・擬名化 key を authority に使わない・**文面(RJ2e)/配信(RJ2f) HOLD + CEO 承認** |
| traceRefs | surfacePlanId / interventionDecisionId / eligibilityId / 全 chain id + evidenceRefs(field-level) + missingInputRefs carry |

---

## 10. 矛盾解消サマリ（断片間の不一致をどう確定したか）

| 不一致 | 断片 A | 断片 B | **本書の確定** |
|---|---|---|---|
| proposal の床 | output-layers: internal_prepare→L3 止まり・L4 全 HOLD | proposal-departure: internal_prepare を proposal 床に許可 | **A 採用**。P1=ask_clarification のみ（穴#3・INV-PROP） |
| ambiguity 下の出口 | proposal-departure: askClarification のみ残る | core 事実: canSuggestPrepare も残る | **core 事実採用**。prepare を含む全 shape を strip（穴#2・INV-AMB） |
| clarificationOnly の導出元 | proposal-departure: canSuggestAskClarification から導出 | decisionkind/output-layers: L2 は decisionKind hard-gate | **後者採用**。clarificationOnly を decisionKind に hard-gate（穴#5・INV-CLAR） |
| ern.displayLabel の安全性 | redaction-per-viewer: full→displayLabel そのまま | red-team: category hint を運び得る・upstream 依存は脆い | **defense-in-depth 採用**。G4 が自分で category-free 化（穴#4・INV-RED） |
| feasibility_state の assert | claim-evidence: generic confirmed→assert | A1: 「間に合わない/間に合います」断定禁止 | **A1 採用**。feasibility_state は confirmed でも hedge 上限・assert 不可（穴#6・INV-FEAS） |
| departure 排除の根拠 | output-layers/prohibited: 静的 HOLD・散文 | red-team: 機械検証する不変条件が pipeline に無い | **G2.5 movement-input gate 新設**。departureLineRefs===[] を walker が直接 assert（穴#1・INV-DEP） |

---

**確定 gate 適用順序**: G0 KILL → G1 DECISION → G2 PERMISSION → **G2.5 MOVEMENT-INPUT（新規）** → G3 EVIDENCE/CLAIM → G4 REDACTION（**genericize を G4 自身が実行**） → G5 DELIVERY。短絡時は全 contact 系 flag を即 false/[] に確定し後段で復活させない（INV-8）。

本書は実装なし・型は skeleton のみ・docs-only。確立済み不変条件（field-level evidence・unknown 非 0・ambiguity≠duplicate・確率なし・fake なし・default-deny・decisionKind≤actionBoundary・display redaction）を全章で維持。

---

## 11. RJ2-0A 矛盾補正サマリ（CEO 監査 4 点）

RJ2-0 設計書内で発見された 4 矛盾を補正・再裁定した。

### 11.1 `notActionable` の再裁定 → **採用 A（表示可・操作不可）**

- **矛盾**: §2/§3 G0 は「`notActionable` も L1+ を落とす」、§6.3 写像は「`notActionable` → `show_redacted` / action none」。
- **裁定（A 採用）**: `notActionable` =「触ってはいけない」であって「見せてはいけない」ではない（CEO 推奨 A・プロダクト思想）。
- **修正**: G0 KILL から `notActionable` を除去（§2 G0 行・§3 pipeline）。kill は `eligibilityLevel==="blocked"` / `decisionKind==="blocked"` のみ（silent は G1 で L0 のみに）。`notActionable` は §6.3 のとおり L1 `show_redacted` + actionAffordance `none`。
- **不変条件（INV-9）**: notActionable → user-facing passive reference まで・actionAffordance 必ず none・clarificationOnly false・proposableShapes []・departureLineRefs []・notification/contact 不可・raw evidenceRefs 不可・redaction 必須・sensitive/otherPeople/work/reservation/payment ではさらに withhold へ下げ得る。

### 11.2 ambiguity strip と clarification hard-gate の矛盾解消

- **矛盾**: §4.2 INV-AMB-A は ambiguity で `clarificationOnly=true` を強制、§4.5 INV-CLAR-A は `decisionKind!=="ask_clarification"` で `clarificationOnly=false`。`decisionKind=observe` + ambiguity で衝突。
- **裁定**: ambiguity は clarification の**材料**（`clarificationEligibleReason`）にはなるが、それだけで `clarificationOnly=true` にしない。`clarificationOnly=true` は **必ず `decisionKind==="ask_clarification"` を通った場合のみ**（INV-CLAR-A 優先）。
- **修正（§4.2 INV-AMB-A）**: ambiguity strip は `proposableShapes=[]` を強制するが `clarificationOnly=true` は強制しない。`decisionKind=observe` のとき ambiguity があっても clarification surface を出さない（observe→L1 まで）。両不変条件が無矛盾化。

### 11.3 L1/L2「出してよい」の意味（INV-10）

- **明記**: RJ2a/b/c が出すのは **surface plan / claim skeleton / question candidate の object** であって user-facing copy / UI 表示 / 通知ではない。
  - `claimTextDraft` は null・`ClarificationQuestionCandidateV0` は文面なし。
  - L1/L2 は将来の surface category であり、RJ2a 時点では plan/candidate **object**。
  - **actual user-facing surface emission は RJ2e 以降の CEO 承認まで HOLD**。本書の「v0 で出してよい」は「この object を構築してよい」の意。

### 11.4 `active_prompt` / `deliveryModeCeiling` の非配信性（INV-11）

- **明記**: `contactPolicy` / `deliveryModeCeiling` は **dispatch instruction ではない**。`active_prompt` は delivery command でなく、G5 で v0 は active_prompt を落とす。active_prompt があっても notification / push / chat message は出ない。**notification / contact は RJ2f まで型すら実行しない**（RC2c-2 注記の継承）。

### 11.5 RJ2a に進めるかどうかの自己判定

- **判定: RJ2a は設計的に ready（条件付き）**。RJ2-0A の 4 矛盾を解消し、設計書は内部無矛盾になった。gate pipeline（G0→G1→G2→G2.5→G3→G4→G5）・不変条件（INV-0〜11）・型案・walker 案・FAIL 再現 fixture（§8.4）が確定し、RJ2a（JudgmentSurfacePlanV0 schema/types + `deriveSurfacePlan` + `surfacePlanViolations` walker）の実装に必要な契約は揃っている。
- **ただし RJ2a は実装 slice であり、各 slice GO は CEO の専管**。本書は RJ2a を自己承認しない。**RJ2-0A の CEO 確認 → RJ2a GO** の順で進む。RJ2e（copy）/RJ2f（notification）は CEO 承認まで HOLD を維持。
- **私の推奨**: RJ2-0A 受領後、RJ2a（pure・型 + 編成 + walker・文面/配信ゼロ・既存 6 判断器ファイル不接触）から実装に入るのが安全かつ自然。
