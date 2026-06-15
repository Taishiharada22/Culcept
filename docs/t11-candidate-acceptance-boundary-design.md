# Candidate Lane Closeout + Candidate Acceptance Boundary Design（docs-only）

> 設計 + closeout フェーズ。**コード変更なし・型/テストも追加しない（prose のみ）**。実装は CEO 承認後に別 slice。
> 上位文脈: envelope→C2→C3→C4→D→B2(dominance)→B2-D(comparison memo) の次段。
> 検証: 本書の意味論は多レンズ設計（state-machine/agency/privacy/boundary-safety）+ 3 つの敵対的批評（boundary-leak / agency / premise）で検証済み。批評が突いた fix を全て反映。
> 原則: ①前提を疑う ②自立推論+grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算 ⑥人間同等推論 ⑦人間超え革新 ⑧世界トップシェア。

---

## PART 1 — Candidate Lane Closeout

### 1.1 完成チェーン（全 pure・大半 unwired・dev preview のみ flag-gated）

```
ScheduledTravelItineraryDraft → AB bridge(envelope) → ScheduledDraftCandidateEnvelope(非挿入)
  → C2 conversion types → C3 convertScheduledDraftEnvelopeToTravelCandidate(core-types TravelCandidate・未挿入・捏造禁止)
  → C4 CandidateCollectionDraft(server-only・ranked:false・immutable add・TravelCorePlan 非変更)
  → D DisplayCandidateCollection(client-safe・rank なし) + dev preview(flag-gated・fixture)
  → B2 CandidateDominanceOverlay(Pareto advisory・reorder/scalar なし・private 非混入)
  → B2-D DisplayCandidateComparison(自然文「順位ではない」比較メモ) + dev preview 拡張(3 候補 fixture)
```

### 1.2 確立した firewall（acceptance も全て継承）

no booking/calendar/action authority・no `executionAuthority`・no persistence/DB・no migration・no `TravelCorePlan` mutation・no `candidates[]` insertion・no ranking/scalar/total order・no decision-core 配線・no auto・**private（`rationale.forParticipant`・`forced_by_private_constraint`）非露出**・reversible/agency 保全・production `/plan` 非接触・push なし・**tsc 55 固定**。

### 1.3 完成 / HOLD

- **完成**: 候補を「生成（手前）→ 構築 → 保管 → 表示 → Pareto 比較メモ」まで安全に扱える。
- **HOLD**: B2-E（engine/decision 配線）・C4-D（TravelCorePlan 反映）・**candidate acceptance（本書で設計）**・persistence・booking・S5 replanning・multi-candidate generation・real-entity retrieval・real-user-input provider・live visual smoke。

---

## PART 2 — Candidate Acceptance Boundary Design

### 2.0 grounding（既存の「ユーザー選択/承認」概念）

| 既存物 | 出典 | 状態 | acceptance への意味 |
|---|---|---|---|
| **S4 `ChoiceSelection`**（origin: user_explicit/upstream_explicit/accept_default・`acceptedDefaultIdentity` stale 保護）/ `SelectionRejection`（neutral reason・`selection_infeasible` で private mask） | solver-finalization-types.ts | **pure・unwired・HOLD** | solver 内部の「値選択」。本 acceptance（候補の選/保留/却下）とは**別レーン**。neutral-reason / stale 保護 / explicit-only の規律は**借りる** |
| **`decide()`**（recommend/tie/needs_question/blocked・fairness tilt は shared で隠蔽） | decision-core.ts | **wired** | **自動**の proposal 推奨。ユーザー承認ではない。**acceptance と conflate 禁止** |
| **`assessReadiness()` / `hasActionAuthority()`**（`ready_to_propose`・`schedule_hold`(commit rank2)・**唯一の予約 gate**） | readiness-core.ts | **wired** | 実 booking 権限の gate。★ `engine.ts:50` `const selected = …recommendedProposalId` が `assessReadiness` の `selected` を供給 |
| **CoAlter `userAction`**（adopted/refined/rerolled/dismissed） | coalter/types.ts:1237 | 半完成 | 推奨への反応の既存語彙。**語彙重複を CEO が意図的に選ぶための参照** |
| **Rendezvous `RendezvousUserState`**（seen→liked/passed/saved・DB 永続） | rendezvous/types.ts | wired | 「やってはいけない」参照例＝**DB 永続 state machine はアンチパターン** |
| Travel 候補の acceptance state | candidate-collection-draft-types.ts:30（`非所持: accepted/finalized/planState`） | **absent** | 本書が初めて意味論を定義 |

### 2.1 まず前提を疑う（① — 第一合成の誤りを批評が訂正）

第一合成は「候補は 0..1 件・consumer 無し」を前提にしたが、**コードと矛盾**（批評 needs_fix で訂正済み・本書で検証）:
- dev fixture は **3 候補**を render（`fixture.ts` onsen+walk+expensive）。multi-candidate は**通常**で既に描画されている。
- **read-only preview consumer は存在**（`page.tsx`・flag `PLAN_TRAVEL_PROJECTION_PREVIEW` 既定 OFF・fixture・no interactivity）。

**正しい前提**: 「候補が少ない/描画されない」のではなく、**select/保留/却下 を捕捉する interaction/capture consumer が存在しない**。よって runtime/永続な acceptance 層は**供給先が無い**。

**推奨（②③⑤）: 本 slice は docs-only prose のみ。`.ts` 型ファイルすら今は置かない**（consumer の無い第 3 の overlay 型が増えるだけ＝honest-audit が指摘する「brain deep, world-connection missing」を悪化）。型ファイルは **naming 確定 + capture consumer が roadmap に乗ってから**の別 CEO-gated slice。**wired/persisted state machine はアンチパターン**（Rendezvous 型 DB は作らない）。S4 と同じ CEO gate 配下に置く。
> 機会費用（honest-audit 2026-06-14）: 使える travel plan への critical path は **real-entity retrieval + real-user-input provider**であって候補レーン state ではない。本契約は「将来の実装者が反射的に `spotlighted` を S4 に配線する事故」への**安価な保険**としてのみ価値がある。

### 2.2 problem の定義

候補に対するユーザーの **選ぶ / 保留 / 却下** の意味を、**per-candidate × per-viewer の decision-state overlay**（`CandidateDominanceOverlay` の兄弟）+ client-safe な lossy 投影として定義する。execution / persistence / plan-mutation / ranking / decision-core 権限を一切持たず、S4 `ChoiceSelection`・readiness `selected`・CoAlter `userAction` と**混同しない**。

### 2.3 state model（4 状態・衝突回避命名）

ユーザー概念（**選ぶ / 保留 / 却下**）と、衝突回避の内部トークンを分離する。

| ユーザー概念 | 内部トークン（衝突回避） | 意味 |
|---|---|---|
| （未操作） | **`undecided`** | **既定 = 不在（absence）**。ユーザー操作ではない・ゼロ情報・`deferred` と別 |
| 選ぶ | **`spotlighted`**（≠ `selected`） | per-viewer の lean/注目。複数可。**実行権限なし** |
| 保留 | **`deferred`**（≠ `held`/`schedule_hold`） | 生かしたまま可視に留める能動的保留。**auto-expire しない・user 操作なしに動かない** |
| 却下 | **`set_aside`**（≠ `rejected`・neutral） | per-viewer の復元可能な除外（注記のみ・delete しない） |

- ★ **批評 blocker fix（命名衝突）**: `selected` は**配線済み実行レーン**の load-bearing token（`engine.ts:50` → `assessReadiness` の `selected` → `hasActionAuthority`＝唯一の予約 gate）。`held` は readiness `schedule_hold` と衝突。よって本レーンは **`spotlighted`/`deferred`/`set_aside`/`undecided`** を用い、契約条項として: **lane-4 の値は engine.ts/readiness-core.ts の実行語彙とトークンを共有しない・本 overlay は `assessReadiness` の `selected` 入力に決してならない**。（CEO 任意でなく契約で確定。）
- **遷移**: 完全可逆グラフ・**終端状態なし**・任意状態→`undecided` 可・冪等（自己ループ・後述 timestamp のみ更新）・**user 操作のみ**で遷移（engine の recommend/decide/provisionalDefault/accept_default は**決して**遷移させない）・**additive で何も mutate しない**。
- ★ **批評 fix（freshness）**: v1 では **`deferred` は user 操作なしに一切遷移しない**（「at most undecided に戻る」を削除）。陳腐化は**状態を変えない助言プロンプト**として表面化し、ユーザーは無視できる（候補は held のまま）。staleness は §2.10 open question に留置。

### 2.4 許可される意味 / 禁止される意味

**許可**: `spotlighted`=候補への可逆な lean / `deferred`=生かして可視に保つ / `set_aside`=復元可能な per-viewer 除外 / `undecided`=不在（操作でない）/ 4 状態とも **per-viewer データであってシステムの判定でない** / commitment は**別の carry-into-S4 行為** / cross-viewer 信号は**両者 spotlighted 時のみ**の中立ヒント（§2.6・当面 DEFERRED）。

**禁止**: booked/accepted を意味しない・`executionAuthority` を付与しない / readiness の `selected`・winner・score・rank にならない / `deferred` は hidden を意味しない・`schedule_hold` でない・auto-transition しない / `set_aside` は delete/irreversible でない・**shared rationale を持たない** / `undecided` は暗黙の承認/consent でない / engine auto-set なし・plan mutation なし・persistence なし / 一方の viewer state は他方に可視/権威でない・**timestamp は boundary を越えない** / convergence は mutual `deferred`/`set_aside` で**発火しない** / 本 slice は production に何も出さない。

### 2.5 output contract sketch（**設計のみ・本 slice で型を置かない**）

```
// スケッチ（未実装・将来の別 CEO-gated slice）
type CandidateDecision = "spotlighted" | "deferred" | "set_aside";  // undecided=不在（entry を持たない）

interface CandidateDecisionStateEntry {
  candidateId: string;
  decision: CandidateDecision;            // undecided は entry 不在で表現
  // ★ 批評 blocker fix（private rationale 構造的漏洩）:
  //   ViewerScopedRationale{shared, forParticipant: Record<participantId,string>} は
  //   他 viewer の private 文を構造的に保持し得る → 使わない。
  //   overlay 自身の viewerId 専用の **単一 string** private 理由のみ（任意・authoritative-tier）。
  viewerPrivateNote?: string;
  markedAt?: string;                      // ★ authoritative server-only のみ・sort key にしない
}
interface CandidateDecisionStateOverlay {
  outcome: "candidate_decision_state_overlay";
  serverOnly: true;
  authoritative: false;
  advisory: true;
  viewerId: string;                       // ★ 単一 viewer に scope
  entries: CandidateDecisionStateEntry[];  // 入力 collection と同じ candidate 集合・同順・reorder しない
}
// client 投影（自 viewer 向け・lossy）: markedAt / viewerPrivateNote / rank / score を落とす
// shared 投影（cross-viewer・当面 DEFERRED §2.6）: ★ rationale フィールドを一切持たない
//   visibility は open | set_aside のみ（per-item の「なぜ」を持たない＝漏洩を表現不能にする）
//   + 両者 spotlighted 時のみ中立 convergence hint。pure stateless（cache/memo/persist なし）。
```

- ★ **批評 fix（reject reason-leak）**: shared 投影の item は **rationale フィールド自体を持たない**（shared 級ですら「なぜ set_aside か」は private 制約の存在を推測させる＝S4 `selection_infeasible` が避ける漏洩）。投影で剝がすのでなく**型で表現不能**にする。
- ★ **批評 fix（timestamp）**: `markedAt` は authoritative server-only のみ。client 投影・shared 投影の**両方が落とす**・recency 並べ替えの種にしない。
- ★ **批評 fix（undecided=absence の consent）**: shared の `open` は **collection の既存 baseline 可視性の再掲**であって per-viewer 由来信号でない。全 `undecided` の overlay → shared 投影は baseline と同一（viewer 由来トークン無し）。

### 2.6 privacy（per-viewer・非漏洩）

- decision state は **per-viewer**（candidate × viewer で key）・shared でない。一方の状態は他方に**不可視・非権威**。
- **単一 viewer rationale**（§2.5）で他 viewer の private 文を構造的に表現不能。
- cross-viewer の唯一の信号 = **両者 spotlighted 時のみ**の中立ヒント（誰が、を名指さない）。★ **批評 fix**: mutual `deferred` / mutual `set_aside` では**発火しない**（「両者が何か状態を持つ」だけで set_aside の事実が漏れるため）。
- **retraction**: un-spotlight/un-set_aside は shared 投影を**純粋・stateless に再計算**（cache/memo/persist 一切なし）→ 撤回後に stale な痕跡が残らないことを構造保証。
- **★ cross-viewer 全体（shared visibility / convergence hint）は当面 DEFERRED**: travel に 2 人共有フロー（CoAlter runtime / `/talk` / realtime）は今**存在しない**（honest-audit 確認）。本 slice では **single-viewer の 4 状態意味論 + per-viewer privacy 原則のみ ratify**。cross-viewer は 2 人フローが実在してから設計。

### 2.7 separation（4 レーン・実行語彙から隔離）

1. proposal lane（`decide` — wired・自動推奨） / 2. S4 ledger lane（`ChoiceSelection` — frozen） / 3. display lane / 4. **candidate decision overlay（本書・新規・downstream）**。
- ★ **firewall**: lane-4 トークンは S4 `selected` / readiness `selected` / `schedule_hold` と**不相交**・本 overlay は readiness の入力に**決してならない**。
- `spotlighted` card は ledger entry でない・`AssemblyInputCandidate` に**変換されない**。
- authoritative overlay は権威を与えない lossy 投影から分離。
- **commitment は別の gated 行為（carry-into-S4）**。overlay は candidate/collection/core plan の field に**ならない**。

### 2.8 decision-core / S5 / C4-D との関係

- **decision-core**: 厳密に**不相交・unwired**。`recommendedProposalId` を読まない・`executionAuthority` を立てない・`decide`/`assessReadiness` を呼ばない。借りるのは**二層 privacy 技法のみ**（権威でなく）。「recommend ≠ accept・両レーンは互いに供給しない」。
- **S5 / C4-D**: 名前のみ・**HOLD・本書の範囲外**。S5 は将来 `spotlighted` ヒントを読み得る、C4-D は将来 accepted を反映し得るが、acceptance の正路は**S4 レーン**。両者への唯一の経路は**別の fail-closed gated な carry-into-S4**・**auto-trigger しない**・どちらも critical path でない。

### 2.9 CoAlter userAction との整合（open）

既存 `coalter/types.ts:1237` の `userAction`（adopted/refined/rerolled/dismissed）と語彙が分裂し得る。本書は travel candidate decision を **align / diverge / supersede のどれにするか**を CEO が**意図的に**選べるよう、precedent を明示（§2.10）。

### 2.10 実装オプション + 推奨（CEO 承認で着手）

| 案 | 内容 | 推奨 |
|---|---|---|
| **docs-only design doc**（本書） | 意味論・可逆 4 状態・firewall・単一 viewer rationale・rationale-less shared visibility・両者 spotlighted hint・cross-viewer DEFERRED を**散文で ratify** | ◎ **唯一の推奨**（本 slice） |
| pure-types file | interfaces のみ | ✗ 今は不可（consumer 無し＝第 3 の未消費 overlay）。**naming 確定 + capture consumer が roadmap 化後の別 CEO-gated slice** |
| pure-types + tests | 同上 + test | ✗ consumer 無しで時期尚早 |
| wired/persisted state machine | Rendezvous 型 DB | ✗ **アンチパターン**（firewall 破壊・`spotlighted`→S4 配線事故） |

### 2.11 将来 test（**型 slice が承認された時**に満たす）

absence=undecided / `deferred` は undecided に崩れない / 可逆グラフ・終端なし / 冪等（timestamp のみ更新）/ engine 遷移なし・`deferred` auto-return なし / score・rank・権限 field なし / collection 順は前後同一 / 複数 spotlighted でも ranking なし / per-viewer isolation / **foreign participant rationale なし** / client 投影は timestamp と private rationale を落とす / **shared visibility は rationale を持たない** / convergence は両者 spotlighted のみ / retraction は cache なしで痕跡なし / ledger・assembly input への経路なし / `executionAuthority` を true にしない。

### 2.12 open questions for CEO

1. 本 slice は **docs-only prose（推奨）**か、pure-types file を後で置くか。
2. 命名 `spotlighted / deferred / set_aside / undecided` の確定（実行語彙 `selected`/`schedule_hold` 衝突回避が理由）。
3. **CoAlter `userAction` 語彙との整合**（align / diverge / supersede）。
4. cross-viewer visibility / convergence hint は **2 人フロー実在まで DEFERRED**（推奨）。
5. `deferred` 候補の陳腐化は**状態を変えない助言プロンプトのみ**でよいか。
6. 単一 viewer rationale を後で含めるか・省くか。
7. 「`spotlighted` を S4 に配線する事故への保険」として ratify するか、capture consumer が乗るまで全面 defer か。
8. S4 と同じ承認 gate でよいか。

### 2.13 Stop

- 本書（Closeout + Candidate Acceptance Boundary Design）で**停止**。
- acceptance の **実装（型/helper/test/wiring）は CEO 承認まで行わない**。

---

## 出力サマリ

- **Closeout**: 候補レーン（envelope→C2→C3→C4→D→B2→B2-D）完成・全 firewall 確立・tsc 55・full suite green。
- **acceptance の意味論**: 候補への **選ぶ=`spotlighted` / 保留=`deferred` / 却下=`set_aside` / 未操作=`undecided`(=不在)** を、**per-viewer・可逆・additive・advisory** な server-only overlay として定義。**実行語彙（`selected`/`schedule_hold`）とトークンを共有せず・readiness の入力にならず・private を構造的に表現不能にし（単一 viewer rationale・shared visibility は rationale-less）・timestamp は boundary を越えず・convergence は両者 spotlighted のみ・cross-viewer は当面 DEFERRED**。
- **前提訂正**: 「0..1 候補/consumer 無し」は誤り。真の理由は **capture consumer 不在**ゆえ runtime/永続 acceptance に供給先が無い。
- **推奨**: 本 slice は **docs-only prose のみ・型ファイルを置かない**。wired/persisted state machine はアンチパターン。S4 と同 gate で HOLD。
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
