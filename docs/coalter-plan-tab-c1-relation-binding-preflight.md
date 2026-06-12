# B-1 closeout + C-1 Culcept relation metadata binding preflight（docs-only）

**作成日**: 2026-06-12
**ステータス**: docs-only design / preflight。**実装なし・fetch なし**（CEO GO: B-1 closeout + C-1 preflight only。C-1 実装は別 GO）。
**親**: [coalter-plan-session-binding-design.md](coalter-plan-session-binding-design.md)（B+C 設計）/ [coalter-plan-tab-talkbridge-t1b2-closeout.md](coalter-plan-tab-talkbridge-t1b2-closeout.md)（identity authority）
**目的**: B-1 契約 skeleton を締め、**実 fetch 前に** C-1 の安全な read-only relation metadata binding を厳密に定義する。

---

## §1 B-1 closeout summary

### §1.1 commit
`9ec8d4ac` — feat(plan): B-1 CoAlterPlanSession binding skeleton（contract v0.1・型のみ・additive・未配線）。

### §1.2 新規 contract files
- `app/(culcept)/plan/tabs/coalter/coalterPlanSessionContract.ts`（pure・**import type のみ**）
- `tests/unit/plan/coalterPlanSessionContract.test.ts`（7 tests）
- `coalterPlanSessionFixture.ts`: `pairStateId` に `@deprecated` JSDoc（**comment-only**・値は残存＝後方互換・読まれない）

### §1.3 契約が保証すること
- `CoAlterPlanSession` v0.1 = `{ id, participants, mode, window, stage, attachedThreadRef? }`。**root `pairStateId` を持たない**（identity 正本は `participants`）。
- `SessionParticipant` = `{ userId（内部安定 id）, source: ParticipantSourceRef, displayName/initial/tone（presentation・userId と分離） }`。
- `ParticipantSourceRef` ＝ adapter の `CoAlterParticipantSource`（TravelCore `ParticipantSourceRef` と 1:1）。無変換で TravelCorePlan に渡せる。
- **CoAlter は system actor**（`COALTER_SYSTEM_AUTHOR = "coalter"` 予約・`isCoAlterSystemAuthor`）で `participants` に**入れない**（consent/fairness/M5 の主語は人間のみ）。
- `attachedThreadRef?` は optional（**threadId なしで session 成立**・identity 源でない）。
- `buildSessionContractFromFixture` は **plan_session 出自**を産み、**talk_pair_member を産まない**・`pairStateId` を読まない。
- 本契約を import する側に**runtime 依存を生まない**（型 import のみ）。

### §1.4 fixture-only のまま
session state 全部（conditions / candidates / adjustments / selectedCandidateId / stage の値）/ participants は fixture の Kento・Mio（plan_session mock）/ messages / header / 統計 / 全 render path。

### §1.5 未接続のまま
- 契約は **UI に consume されていない**（CoAlterTab は依然 chat adapter 経由で fixture を描画）。`buildSessionContractFromFixture` は存在するが render path から呼ばれない。
- relation / thread / 認証 self への binding は一切なし（C-1 以降）。
- **CEO note 厳守**: `buildSessionContractFromFixture` は **fixture/contract builder のまま**で、production relation resolver に化けさせない（C-1 の resolver は§6 のとおり**別関数・別モジュール**）。

---

## §2 C-1 preflight: 使用エンドポイント

### §2.1 結論: **`GET /api/genome-connections` を一次かつ唯一の relation 源にする**（新規 endpoint 不要）
grounded 比較（両 route を実読）:

| | `GET /api/genome-connections` | `GET /api/talk/threads` |
|---|---|---|
| auth client | **user-RLS（`supabaseServer()`）** | user-RLS + **service_role admin client** |
| 表示名の出所 | **`profiles` テーブル**（display_name/avatar_url・user-RLS） | **`auth.users` metadata（`admin.auth.admin.getUserById`）＝service_role** |
| キー | **connection（relation）単位** | thread 単位 |
| relation id | `id`（= connection id・**直接**） | `connectionId`（thread から） |
| counterpart | `counterpart: { userId, displayName, avatarUrl }` | `counterpart: { userId, displayName, avatarUrl }` |
| status | `status`（accepted フィルタ可） | なし（accepted connection 前提で内部結合） |
| threadId | `threadId`（connection→thread・将来 attach 用） | （thread が主） |

### §2.2 expected response shape（grounded・route.ts 実装）
```jsonc
{ "ok": true, "connections": [
  { "id": "<connection_id>", "requesterId": "...", "targetId": "...",
    "status": "accepted" | "pending" | "blocked" | ...,
    "counterpart": { "userId": "...", "displayName": string|null, "avatarUrl": string|null },
    "threadId": string|null,
    // 他: visibilityRequester/visibilityTarget/createdAt/respondedAt（C-1 は consume しない・§5）
  } ] }
```

### §2.3 `GET /api/genome-connections` は十分か → **YES（かつ superior）**
- `culcept_relation` に必要な **connection id（=`id`）+ counterpart userId** を**直接**供給。
- 表示名・avatar を **user-RLS（profiles）で供給＝service_role 不要**。⇒ /plan の identity 解決が **service_role に一切依存しなくなる**（T1b-2 の threads-metadata 経路が抱えていた唯一の service_role 依存を解消＝strict improvement）。
- `status` で accepted を絞れる（binding 規則 §3）。
- `threadId` も同梱＝将来の thread attach（relation→thread の許可方向・binding 設計 §4.2）を**追加 fetch なし**で用意。

### §2.4 `GET /api/talk/threads` metadata は **avoid（fallback にもしない）**
relation binding には使わない。理由:
1. **service_role 依存**を再導入する（genome-connections は profiles で回避済み）。
2. **thread-rooted**（thread をキーにする＝binding 設計が禁じる「thread を root にしない」に逆行）。
3. relation id は結局 `connectionId`＝genome-connections の `id` への遠回り。
⇒ talk/threads は **read-only thread preview（T1b/T1b-2）専用**として残し、**C-1 relation binding の fallback にはしない**。genome-connections が失敗したら fixture/unbound へ fail-closed（§4）。

### §2.5 新規 endpoint
**不要**。`GET /api/genome-connections` は既存・user-RLS・additive read で足りる。新 endpoint は別途承認なしに作らない。

---

## §3 relation metadata binding 規則

1. **`culcept_relation` は accepted connection id + counterpart userId からのみ生成**:
   `{ kind: "culcept_relation", relationId: <connection.id>, userId: <counterpart.userId> }`。両方が実在する accepted connection のときのみ。
2. **self は auth/session 由来**（client 推論にしない・CEO 反復指摘）:
   - self.userId は **認証セッション user id**。`PlanPage`（server）が既に `supabase.auth.getUser()` を持つので、`viewerUserId` を **server prop として /plan へ渡す**のが正道（/plan は supabase を import しない＝source-guard 維持）。
   - C-1 の pure resolver は `viewerUserId` を**入力として受け取り**、自分で推論しない。T1b-2 の「非 counterpart sender がちょうど 1 人なら self」推論は **display preview 限定**で、relation binding では使わない。
   - viewerUserId が無い slice では self を **unresolved のまま**（推論で埋めない）。
3. **relationId 捏造禁止**: connection.id 以外から relationId を作らない。
4. **`talk_pair_member` 不生成**: genome-connections は `coalter_pair_states` を見ない。connection は relation であって pair consent ではない（binding 設計 §3.3）。
5. **`pairStateId` 非依存**: C-1 は session/connection のどこからも pairStateId を読まない。
6. **thread を要求しない**: `threadId` が payload にあっても C-1 では **使わない**（thread attach は別 slice）。session は threadId なしで bind される。
7. **対象 counterpart は「指定された userId」を解決する**（勝手に選ばない・§4 の multiple 対策）:
   session が意図する counterpart userId（skeleton/dev 期は dev 注入・production は session 作成由来）を connections から**照合**して解決する。リストから任意の 1 件を**選択しない**。

---

## §4 失敗時挙動（すべて fail-closed・fake source なし・クラッシュなし）

| ケース | 挙動 |
|---|---|
| accepted relation が無い（対象 counterpart が accepted connection に居ない） | その participant は **fixture/unbound のまま**（culcept_relation を付けない） |
| relation が複数（connection 多数） | **勝手に選ばない**。指定 counterpart userId に一致する accepted connection のみ解決。指定が無い/曖昧 → 解決しない（fixture のまま） |
| counterpart userId 欠落（connection 行に userId なし） | その connection を skip・該当 participant は unbound |
| endpoint 失敗（500 / network） | **fixture へ fail-closed**（session-unbound・readState は live でなく unavailable 相当） |
| 未認証（401） | fixture へ fail-closed。self も解決しない（viewerUserId 無し） |
| payload 不正（ok≠true / connections 非配列） | fixture へ fail-closed |

共通: **fake source を作らない**（relationId/userId/kind を捏造しない）。session は binding 前の状態に留まり、CoAlter タブは壊れない。

---

## §5 privacy and display

- **raw userId は内部のみ**: 照合キー・`source.userId` にのみ使う。**UI 表示・コピー・ログに出さない**（CEO note #3）。
- **displayName / initial / avatar は別 field**: genome-connections の `counterpart.displayName` / `avatarUrl` を presentation に使う。initial は displayName の先頭から導出。
- **displayName が null のとき raw userId に fallback しない**（CEO note #3 厳守）: 役割ラベル（例「相手」「あなた」）または neutral 表示に落とす。**UUID を表示テキストにしない**。これは T1b-2 の `display_resolved` を「名前があれば名前・無ければ neutral ラベル・常に source は別途解決」に延長したもの。
- **C-1 は private personalization を一切 consume しない**: genome-connections の `visibilityRequester/visibilityTarget` その他、axis/trait/personalization は participant に**載せない**。C-1 が読むのは `id / status / counterpart{userId,displayName,avatarUrl} / (将来)threadId` のみ。M5 per-viewer payload は別・server 側（C-1 範囲外）。

---

## §6 承認後の C-1 実装スライス（推奨形・**本書では実装しない**）

1. **pure resolver（fetch なし）** — 例 `resolveCulceptRelationParticipants({ connections, targetUserIds, viewerUserId })`:
   - 入力 = genome-connections の結果配列 + 解決したい counterpart userId 集合 + 認証 self userId。
   - 出力 = `SessionParticipant[]`（counterpart→culcept_relation resolved / self→self resolved / 未解決→なし）。**捏造なし・指定 userId のみ解決**。
   - `buildSessionContractFromFixture` とは**別関数・別責務**（CEO note #1）。
2. **read-only hook/adapter 境界** — genome-connections を **GET 1 回**（in-flight dedupe・`(url)=>Response` 形で POST/PATCH/DELETE 構文上不可＝T1b と同型）。fetch は hook に閉じ、resolver は pure。失敗は §4 で fixture へ fail-closed。
3. **viewerUserId は server prop** で /plan に渡す（/plan は supabase を import しない・source-guard 維持）。
4. flag-gated・default OFF・fixture 既定。read-only。
5. **やらないこと**: UI redesign / thread attach（threadId は使わない）/ send / realtime / read receipt / useCoAlter / M2-B-2 / Travel runtime / Plan Intelligence 投影。
6. tests: 解決マトリクス（accepted/pending/blocked・指定 userId 一致/不一致）/ talk_pair_member 不生成 / relationId 捏造なし / displayName null→neutral（UUID 非表示）/ §4 fail-closed 全件 / GET 1 回・GET-only / service_role import なし（既存 fs source-guard 継続）/ self は viewerUserId 由来（推論しない）。

---

## §7 リスク（C-1 固有・防御）

| リスク | 防御 |
|---|---|
| fixture builder が relation resolver に化ける | §6-1: 別関数・別モジュール（CEO note #1） |
| inferred self が authority 化 | §3-2: viewerUserId を server prop で受領・推論しない |
| relationId 捏造 | §3-3: connection.id のみ |
| raw userId が表示に漏れる | §5: displayName null→neutral ラベル・UUID 非表示 |
| service_role 再導入 | §2.4: talk/threads を relation binding に使わない（genome-connections は user-RLS） |
| private personalization 漏れ | §5: visibility/axis/trait を consume しない |
| thread root 化の再来 | §3-6: threadId を C-1 で使わない |
| multiple relation の誤選択 | §3-7 / §4: 指定 userId のみ解決・勝手に選ばない |

## §8 CEO 判断待ち
1. **C-1 一次源 = `GET /api/genome-connections`（service_role 不要・relation-keyed）採択の承認**。
2. **self の `viewerUserId` を server prop（PlanPage の auth.getUser 由来）で渡す方式の承認**。
3. C-1 実装スライス（§6・pure resolver + read-only hook・flag OFF）着手 GO。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
