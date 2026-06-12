# CoAlterPlanSession binding + Culcept relation binding 設計（B+C・docs-only）

**作成日**: 2026-06-12
**ステータス**: docs-only design。**実装なし**（CEO GO: B+C binding design only。T1c は HOLD 継続）。
**親**: [coalter-plan-tab-backend-contract-draft.md](coalter-plan-tab-backend-contract-draft.md)（UI 契約 v0）/ [coalter-plan-tab-talk-migration-design.md](coalter-plan-tab-talk-migration-design.md) §4 / [coalter-plan-tab-talkbridge-t1b2-closeout.md](coalter-plan-tab-talkbridge-t1b2-closeout.md)（identity authority 規則）
**製品定義（CEO 2026-06-12・本書の北極星）**:
> **/plan CoAlter = PlanSession にいる 2 人と CoAlter が、その日の現実/旅行/予定を組む場。**
> 「/talk thread を選んで見るもの」ではない。

**grounded な前提事実**（本書の主張はすべてこれに立脚）:
- `coalter_pair_states` は **`thread_id UUID NOT NULL UNIQUE`**（`20260415100000_coalter.sql`）＝旧 pair state は **/talk thread に 1:1 で根を張った consent 状態**。thread なしに存在できない。
- `genome_connections`（id, requester_id, target_id, status）が**関係の正本**。talk thread は connection に従属（threads route が connection で参加判定）。
- TravelCore `ParticipantSourceRef` = `self | talk_pair_member | culcept_relation | plan_session`（`44c0a1f1`）。
- TalkBridge は read-only view 契約 + `identityState`（unresolved / display_resolved / resolved）+ capabilities 独立 field を提供済み（`ae749cc9`）。

---

## §1 CoAlterPlanSession binding model

### §1.1 plan session とは何か
**定義**: 特定の参加者集合（1〜2 人 + CoAlter）が、特定の計画窓（daily の 1 日 / travel の日付範囲）で「条件 → 候補 → 調整 → 確定」を進める **1 つの計画作業の器**。契約 draft v0 の `CoAlterPlanSession`（id / mode / window / stage / conditions / candidates / selectedCandidateId / adjustments）が骨格。

**契約 v0 からの改訂提案（v0.1）**: v0 の `pairStateId: string | null` を**廃止**し、participants を一級にする:

```typescript
type CoAlterPlanSession = {
  id: string;
  participants: SessionParticipant[];   // 1〜2 人。出自は ParticipantSourceRef（§2）
  mode: "daily" | "travel";
  window: { date: string } | { start: string; end: string; nights: 1 | 2 };
  stage: "understanding" | "curating" | "resolving" | "confirmed";
  conditions: SharedCondition[];
  candidates: PlanCandidate[];
  selectedCandidateId: string | null;
  adjustments: AdjustmentSuggestion[];
  /** 旧 /talk thread への optional な参照（§4。識別ではなく文脈/転送の bridge） */
  attachedThreadRef?: { threadId: string };
};
```

理由: `pairStateId` は thread-rooted（前提事実 1）であり、session の根に置くと /plan が構造的に /talk に繋がれる。TravelCore T1A closeout の「pairStateId は talk_pair_member source kind に降格」と同じ動きを session 契約側でも行う。

### §1.2 chat はどう session に属するか
- **メッセージは plan session に属する**。チャット欄は「session の Understand 面」であり、thread の閲覧窓ではない。
- 会話の「誰と誰の」は **session.participants が正本**として答える。転送層（将来の保存先が新テーブルでも thread backing でも）は identity を**持たない**（T1b-2 invariant: 転送層から identity を推論しない）。
- CoAlter の発話は author `"coalter"`（予約名前空間・§2.3）として同じメッセージ列に並ぶ。

### §1.3 one session, two projections の実現
契約 §2 の原則を、現 UI の実態（既に動いている形）に接地する:

| | 右チャット面 | 左 Plan Intelligence 面 |
|---|---|---|
| 役割 | **Understand 射影**（自由文・条件抽出・リアクション・合意） | **Curate/Resolve 射影**（候補 3 案・統計・調整・確定） |
| 読む state | session.messages + conditions（要約 chips） | session.candidates / adjustments / stage |
| 書く操作 | sendMessage → conditions 差分 / react → 同意 | applyAdjustment / selectCandidate / confirm |
| 同一操作の別ビュー | クイックアクション（= 左の調整と同一 state を操作） | — |

両面とも **同一 session state を読む/書く**だけで、面同士は直接通信しない。現 UI は local state でこれを既に実装済み（調整適用が左右に同時反映）＝binding は「local state → session 正本」への昇格であり、UI 構造の変更ではない。

### §1.4 今 fixture-only のもの
session 本体（conditions/candidates/adjustments/stage の全 state）/ participants（fixture の Kento・Mio）/ messages（fixture。T1b の read-only thread preview は別系）/ モード切替・調整適用・確定（local state のみ）。

### §1.5 runtime binding の前提（着手条件）
1. **session 永続化スキーマ**（新テーブル・migration = **CEO 承認事項**。本書はスキーマを規定しない）。
2. participants の resolved 確定経路（§2/§3。relation 由来 + server session の self）。
3. M5 per-viewer payload の **server 側**担保（client filter では漏れる）。
4. session 作成の consent 定義（§3.5・CEO 判断点）。
5. 認証文脈（/plan は auth gate 済み・baseline 強制はしない方針を維持）。

---

## §2 participant model

### §2.1 構成
plan session の participant は **1〜2 人の人間**。それぞれ:

```typescript
type SessionParticipant = {
  userId: string;                    // 安定 id（auth user id・§2.4）
  source: ParticipantSourceRef;      // TravelCore と同一 union（§2.5）
  // 表示情報（displayName 等）は participant の属性であって identity ではない
};
```

- **self**: session を見ている本人。**識別の正本は server session（auth.getUser）**。client 推論の self は cosmetic（T1b-2 closeout §2.2 の不変条件を session 文脈でも維持）。
- **counterpart**: relation 由来（§3）。`culcept_relation` source。
- **solo**: participants が self 1 人。session は成立する（契約 v0 の `pairStateId: null = solo` の置き換え）。

### §2.2 CoAlter は participant ではない（設計判断）
CoAlter は **system actor** であり participants 列に入れない。理由:
1. `ParticipantSourceRef` は人間 identity の出自 union であり、CoAlter は出自を持たない。
2. consent・fairness・per-viewer payload の主語になるのは人間のみ。CoAlter を participant 化すると M5/fairness の述語が壊れる。
3. 既に実装上も author 名前空間 `"coalter"` で表現されている（メッセージ author = participant userId か `"coalter"`）。
規則: **`"coalter"` は author 名前空間の予約語**。userId と衝突しない（UUID でない）ことを将来 validator で保証。

### §2.3 participantId の安定性
- **userId（auth user id）を唯一の安定 id** とする。session-scoped の別名 id は発行しない。
- 根拠: TravelCore `ParticipantSourceRef` も userId を必須で持つ／TalkBridge live 経路も senderId=auth user id を participant id に使用済み／別名 id は M5 filter・fairness ledger・複数 session 横断（correction memory）すべてで対応表を増やすだけ。
- fixture の `"kento"`/`"mio"` は mock userId として扱う（shape 互換・実 UUID でないだけ）。

### §2.4 TravelCore `ParticipantSourceRef` との関係
`SessionParticipant.source` は TravelCore union を**そのまま**使う（写像不要・1:1）。session の participant が確定すると、TravelCorePlan の participants に**無変換で**渡せる（T1A closeout の「CoAlterPlanSession.participants → TravelCorePlan 1:1 写像」を満たす）。

### §2.5 TalkBridge `identityState` との関係
- `identityState` は **TalkBridge（表示層）の解決状態**であり、session 契約には存在しない。
- **plan session の正式 participant は常に resolved 相当**（session 作成時に identity 確定が前提）。session に「unresolved な正式メンバー」は存在しない。
- unresolved / display_resolved が現れるのは **read-only thread preview（T1b/T1b-2）だけ**。つまり: session binding 後、チャット面の participant が session 由来なら常に resolved・thread preview 由来なら unresolved もありうる、という 2 系の区別が保たれる。

### §2.6 identityState 別の許容操作
| identityState | 表示 | 相互作用の対象（リアクション集計・条件 contributor 等） | send 主体 |
|---|---|---|---|
| unresolved | ✅（匿名） | ❌ | ❌ |
| display_resolved | ✅（実名） | ❌ | ❌ |
| resolved | ✅ | ✅（将来・各 gate 配下） | **❌**（resolved でも不可。send 主体は server session user のみ＝t1b2 closeout §2.1/2.2） |

---

## §3 Culcept relation binding

### §3.1 relation が `culcept_relation` を供給する方法
- 正本: `genome_connections`（status='accepted'）。`culcept_relation { relationId: connection_id, userId }` は **accepted connection の 2 端からのみ**構築する。
- 取得経路（将来・実装は別 GO）: 既存 `GET /api/genome-connections`（/talk の thread 一覧と独立に存在・TalkPageClient が使用中）または既存 threads metadata（T1b-2 実装済: threads route の connectionId）。**新 API・service_role は増やさない**。

### §3.2 旧 /talk thread との違い
| | genome connection（relation） | /talk thread |
|---|---|---|
| 意味 | **関係の事実**（承認済みの繋がり） | その関係に生えた**会話の転送路** |
| 存在条件 | 承認のみ。thread なしでも存在 | connection に従属（connection_id 必須） |
| identity 供給 | ✅ `culcept_relation` の正本 | ❌（T1b-2 invariant: thread から identity を推論しない） |

### §3.3 `coalter_pair_states` との違い（grounded）
- pair state は **`thread_id NOT NULL UNIQUE`** ＝ thread に 1:1 で根を張った **CoAlter 機能の consent 状態機械**（pending_consent → enabled / disabled）。
- つまり pair state は「関係」でも「会話」でもなく、**「この thread で CoAlter が能動的に動いてよいか」という同意**。
- relation binding と直交: relation は関係の事実 / pair state は機能 consent / thread は転送路。3 つを混ぜない。

### §3.4 `talk_pair_member` が separate + consent-gated であり続ける理由
1. pair state は thread-rooted（§3.3）。これを binding の基礎にすると /plan が構造的に /talk thread に繋がれる（CEO が警告する legacy takeover の機構そのもの）。
2. pair state は consent の器であり、consent は M2-B（EngineOnly pair snapshot）と同じ重さの判断領域。**authoritative な pair-state 解決を経たときだけ** `talk_pair_member` を名乗れる、という T1b-2 invariant を session 文脈でも維持。
3. ⇒ plan session の participants に `talk_pair_member` が現れるのは、将来「既存 CoAlter ペア（enabled）を plan session に持ち込む」明示移行を設計したときのみ。既定経路は `culcept_relation`。

### §3.5 旧 pair state なしで relation binding は成立する
- accepted connection（+ 双方の session 参加）だけで plan session は張れる。pair state（thread への CoAlter consent）は**不要**。
- **CEO 判断点（新規・明示が必要）**: plan session には CoAlter が**場として内包**される（製品定義）。この「session 内 CoAlter 同席」の consent をどう定義するか:
  - 案 i（推奨）: **session への参加自体を同席 consent とみなす**（招待 UI に「CoAlter が同席するプランの場」と明示）。pair state の consent（thread での能動 trigger/observation）とは別物として残す。
  - 案 ii: session 作成時にも明示 consent step を置く。
  - いずれでも「**thread での CoAlter 能動化（旧 pair state）と session 同席は別の同意**」は変えない。

---

## §4 thread / backing-store model

### §4.1 /talk thread の位置づけ = **optional bridge（identity source でも正本でもない）**
- **identity source ではない**: T1b-2 で確定・テスト固定済み。
- **正本ではない**: 正本は plan session（§1）。
- **optional bridge**: 2 用途に限る — (a) **文脈 bridge**（過去の /talk 会話を read-only で参照する。T1b/T1b-2 の資産がそのまま使える）/ (b) **移行期の転送 bridge**（将来 send を thread backing で行う選択をした場合。その採否自体が send 前提の CEO 判断＝t1b2 closeout §4.3-3 cross-surface 承認）。

### §4.2 threadId を session に attach してよいとき
- relation から導出可能なとき（connection_id → thread。1:1）に、**`attachedThreadRef?` として** session に付けられる。
- attach の動機が (a)(b) のいずれかに該当するときのみ。attach しても participants/identity は session 正本のまま不変。

### §4.3 threadId を要求してはならないとき
- session 作成・solo session・thread 未作成の relation・将来の非 /talk 転送路。**session の成立条件に threadId を含めない**（optional field の存在のみ許す）。

### §4.4 thread picker を待つ理由（製品論）
picker は「/plan CoAlter = /talk thread を選んで見るもの」という心象モデルを焼き込み、product root が /talk に戻る。binding 確定後に attach UI が必要になっても、それは「**この相手との過去の会話を文脈として読み込む**」操作（relation→thread は自動導出・ユーザーが thread を「選ぶ」概念は出さない）として設計する。

### §4.5 /talk を product root にしないための機構（仕様化）
1. 型: threadId は `attachedThreadRef?` のみ（session の必須 field に昇格禁止）。
2. 解決方向: **relation → thread の導出のみ許可**。thread → relation/identity の逆derivation は表示 enrich（T1b-2 の counterpart 解決）に限る。
3. UI 文言: 「スレッド」をユーザー向け語彙に出さない（「これまでの会話」等）。
4. ルーティング: /plan の URL・state に threadId を露出しない（env 注入は dev 専用のまま）。

---

## §5 capability gates（identity/session 条件つき・全体表）

| capability | 必要な binding/identity 条件 | 追加 gate | 現状 |
|---|---|---|---|
| read-only（fixture） | なし | tab flag | ✅ 稼働 |
| read-only（live thread preview） | threadId（dev 注入） | chat live flag | ✅ T1b/T1b-2 |
| read-only（session-bound） | session 永続化 + participants resolved | 新 flag + CEO GO | ❌（§6-1 の先） |
| send | **binding 決定済み** + self=server session user（inferred self 不可） + 転送路決定（新 store か thread backing=cross-surface 承認） + idempotency + failure semantics | T1c GO | ❌ HOLD |
| realtime | send 成立後（read-only realtime は価値薄）+ channel 分離（`plan-talk:*` or session channel） | T1c GO | ❌ HOLD |
| read receipts | **明示 opt-in のみ・自動禁止**。session-bound store なら相手側 /talk に波及しない設計を優先 | 最後尾・個別 GO | ❌ HOLD |
| useCoAlter / invoke | session binding + **pair-state consent（enabled）または §3.5 の新 consent 定義** + M2-B 文脈 | 個別 GO | ❌ HOLD |
| Plan Intelligence 投影 | session binding + 契約 v1 改訂（操作契約） + **M5 per-viewer の server 担保** | T4 GO | ❌ HOLD |

---

## §6 推奨実装順（設計確定後・各ステップ別 GO）

1. **B-1: PlanSession binding skeleton（型のみ・additive・fixture 既定）** — `SessionParticipant`（userId + ParticipantSourceRef）を fixture 契約に導入し、`pairStateId` を `attachedThreadRef?` + participants に置換。provider `plan_session` の resolver 接続点を明示。実 DB・fetch なし＝T1a と同じ「skeleton → 後から実装差し替え」パターン。
2. **C-1: Culcept relation metadata binding（read-only）** — 既存 `GET /api/genome-connections`（または T1b-2 の threads metadata）から relation を read-only 解決し、session participants（resolved・culcept_relation/self）を実データで構成。fetch を含むため**別 GO**。
3. **optional thread attachment（read-only）** — `attachedThreadRef` 経由で T1b の read-only preview を session 文脈に載せ替え（「これまでの会話」）。
4. **send → realtime → useCoAlter** — §5 の各前提成立後・各 GO。useCoAlter は pair/session consent 確定後。
5. **read receipt** — 最後尾。明示 opt-in のみ。session-bound store 採用なら /talk 既読への波及自体を設計から消せる（最善）。

## §7 リスク

| リスク | 機構 | 防御（本書の規定） |
|---|---|---|
| legacy /talk takeover | picker・thread 必須化・pair state 基礎化で product root が /talk へ回帰 | §4.5（optional field 封じ・導出方向・語彙・URL）+ §3.4（pair state を基礎にしない） |
| inferred self の権限化 | T1b-2 の cosmetic self が send 主体に流用される | §2.6（resolved でも send ❌）+ server session stamp のみ（t1b2 closeout §2.2） |
| relationId 捏造 | 「source が欲しい」圧力で connection_id 以外から relationId を作る | §3.1（accepted connection の 2 端のみ）+ T1b-2 source guard テスト続行 |
| per-viewer privacy 漏れ | M5 を client filter で実装してしまう | §1.5-3 / §5（投影 gate に server 担保を前提条件として固定） |
| /talk への偶発 read/write 副作用 | 既読・send・typing が相手の /talk 表示を変える | §5（自動既読禁止・cross-surface は send の明示承認事項）+ GET-only 構造の維持 |
| M2-B-2 への早期結合 | pair snapshot/consent を binding に混ぜて HOLD 領域へ侵入 | §3.3-3.5（relation⊥consent⊥thread の三分離。pair state は useCoAlter gate まで登場しない） |
| session 同席 consent の未定義（新規） | 「CoAlter が場にいる」ことへの同意が暗黙化 | §3.5 を CEO 判断点として明示（案 i 推奨） |

## §8 CEO 判断待ち
1. **契約 v0.1 改訂の承認**（§1.1: `pairStateId` 廃止 → `participants` + `attachedThreadRef?`）。
2. **session 同席 consent の定義**（§3.5 案 i / ii）。
3. B-1（binding skeleton・型のみ）着手 GO。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
