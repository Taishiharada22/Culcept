# C-1 closeout + message/thread next-branch design（docs-only）

**作成日**: 2026-06-12
**ステータス**: docs-only。**実装なし**（CEO 指示: C-1 を締め、thread attach 実装・send・realtime・既読・useCoAlter・Plan 投影の前に chat body binding の最安全分岐を決める）。
**親**: [coalter-plan-session-binding-design.md](coalter-plan-session-binding-design.md)（B+C 設計）/ [coalter-plan-tab-c1-relation-binding-preflight.md](coalter-plan-tab-c1-relation-binding-preflight.md) / [coalter-plan-tab-talkbridge-t1b2-closeout.md](coalter-plan-tab-talkbridge-t1b2-closeout.md)（identity authority 規則）
**核となる CEO clarification（2026-06-12）**:
> **C-1 は identity/participant binding slice であって message binding slice ではない。**
> 「誰が PlanSession にいるか」に答えたのであり、「どのメッセージが session の chat body か」には答えていない。

本書はこの未回答の問い＝**chat body の正本**を、次分岐の設計対象として固定する。

---

## §1 C-1 closeout summary

### §1.1 commit / files
`78135fcf` — feat(plan): C-1 Culcept relation metadata binding。
新規: `coalterRelationBinding.ts`（pure resolver + GET-only fetch）/ `useCoAlterRelationBinding.ts`（hook）/ `coalterRelationBinding.test.ts`（22 tests）。
変更: `CoAlterTab.tsx`（viewerUserId prop + header 参加者の bound 表示）/ `PlanClient.tsx`・`page.tsx`（viewerUserId plumbing）/ `featureFlags.ts`（C-1 flag 2 種・default OFF）/ migration design §4。

### §1.2 identity/participant binding が今保証すること
1. **`culcept_relation` は accepted `genome_connections`（id + counterpart userId・ちょうど 1 件）からのみ**生成。relationId 捏造なし・曖昧（同一相手に 2+ connection）は不採用・**勝手に選ばない**。
2. **self = server 由来 `viewerUserId` のみ**（PlanPage `auth.getUser()` → prop。client 推論経路は存在しない）。
3. **`talk_pair_member` 不生成・`pairStateId` 非依存・`threadId` 無視**（C-1 経路に登場しない・テスト固定）。
4. **raw userId は表示に出ない**（displayName null → 中立ラベル「相手」「あなた」）。
5. **relation 源は `GET /api/genome-connections` のみ**（user-RLS・service_role 非依存・talk スレッド系 API 不使用＝fs guard で恒久化）。fetch は flag ∧ viewer ∧ target の全充足時に高々 1 回（dedupe）。
6. 全失敗（401/403/invalid/network/不一致/前提欠落）は **fixture へ fail-closed**（fake source なし）。

### §1.3 fixture-only のまま残るもの
chat body（messages）/ Plan Intelligence 全 state（conditions・candidates・adjustments・stage）/ モード・調整・確定の local 操作 / solo・session 永続化。

### §1.4 未接続のまま残るもの
session message store（存在しない）/ thread attach（`attachedThreadRef` は型のみ・未実装）/ send・realtime・既読・typing / useCoAlter・CoAlter runtime / M2-B-2 / 条件抽出・Plan Intelligence 投影 / per-viewer payload の server 担保。

---

## §2 現在の transitional state（全体図）

| 面 | 状態 | データ源 |
|---|---|---|
| header 参加者 | **bound 可能**（flag ON ∧ viewer ∧ target 時: あなた + culcept_relation 実名） | `GET /api/genome-connections`（C-1） |
| chat body | **fixture**（Kento/Mio の mock 会話。T1b の thread preview は dev 注入時のみの別系） | fixture（/ thread preview） |
| Plan Intelligence | **fixture / local state**（条件・候補・調整・確定はローカル操作のみ） | fixture |
| メッセージ永続化 | **なし**（local echo は揮発） | — |
| 条件抽出・投影 | **なし**（チャット→conditions の差分抽出は未実装） | — |

つまり「**誰が**」は解決可能になったが、「**何を話したか（正本）**」と「**何を計画したか（正本）**」は両方 fixture。次の本丸は前者＝chat body binding。

---

## §3 next-branch comparison

| 分岐 | 種別 | 何に答えるか | リスク | 判定 |
|---|---|---|---|---|
| **A. optional thread attach read-only 設計** | docs | 「過去の /talk 会話を文脈としてどう見せるか」 | 低（docs） | 可。ただし **chat body の正本には答えない**（文脈参照のみ）。B と同一 doc で扱う（§4） |
| **B. session-bound message model 設計** | docs | ★「session の chat body の正本はどこか」＝send/realtime/既読すべての前提 | 低（docs） | **可・本命**（§5） |
| C. thread attach **実装** | impl | A の実装 | 中（read-only だが、**正本未決のまま chat 欄に living data を入れると thread が事実上の正本に見える**） | **B 確定後**（§6.3） |
| D. send | impl | 書込 | 高（転送路未決・self authority・cross-surface） | HOLD |
| E. realtime | impl | 購読 | 中（send なしで価値薄） | HOLD |
| F. read receipt | impl | 相手側永続状態の変更 | **最悪**（viewing≠marking read） | HOLD・最後尾 |
| G. useCoAlter / `/api/coalter/*` | impl | CoAlter runtime | 高（consent・M2-B 干渉） | HOLD |
| H. Plan Intelligence 投影 | impl | plan 側射影 | 高（契約 v1・M5 server 担保が前提） | HOLD（T4） |

---

## §4 thread attach 設計制約（A・将来実装の不変条件）

1. **thread は optional bridge のみ**: `attachedThreadRef?`（B-1 型固定済み）。session 成立条件・session root にしない。
2. **導出方向は relation → thread のみ**（connection_id → thread）。thread → identity の逆 derivation は禁止（thread preview の表示 enrich を除く・下記 7）。
3. **thread picker なし**: attach は relation から自動導出。ユーザー語彙は「この相手とのこれまでの会話」（thread を「選ぶ」概念を出さない）。
4. **表示は本文と区別**: attach した thread messages は「これまでの会話」**文脈セクション**として、session chat body と視覚的・型的に分離して表示（同一吹き出し列に混ぜて正本に見せない）。T1b/T1b-2 の read-only preview 資産（GET-only・fail-closed・匿名/解決 participant）をこのセクションに載せ替える。
5. **既読なし・write なし**: attach は閲覧のみ。/talk の永続状態（read_at 等）を一切変えない。
6. **relation identity に `GET /api/talk/threads` を使わない**（C-1 で確定: relation 源は genome-connections のみ）。
7. T1b-2 の threads-metadata enrich は **thread preview の表示専用**として残置し、session binding には波及させない（CEO 裁定済みの限定を doc 不変条件に昇格）。

## §5 session-bound message model 設計制約（B・本命）

### §5.1 /plan は将来、自前の session message store を必要とするか → **Yes（設計判断）**
理由:
1. **副作用の遮断**: session store なら既読・通知・realtime が /talk に**構造的に波及しない**（t1b2 closeout の「viewing in /plan must not change /talk state」を設計で消せる。read receipt 問題の最善解）。
2. **solo session**: thread が存在しない session（solo・thread 未作成 relation）でも会話が成立する。
3. **CoAlter 発話の保存先**: `talk_messages` は人間の sender_id のみ（grounded: messages route の SELECT/INSERT）。CoAlter の発話・提案文脈を正本として残すには session 側の器が要る。
4. **M5 per-viewer の server 担保**: 自前 store なら projection を server で設計できる（/talk backing では /talk の RLS 意味論に縛られる）。
- ⇒ /talk thread を chat body の正本・backing store に**しない**。thread は §4 の文脈 bridge に限定。
- **ただし DB/migration は CEO 承認事項**: 本書は「必要」という設計判断のみを固定し、schema・テーブル名・RLS は規定しない（実装 slice の preflight で別途）。

### §5.2 session message と /talk thread message の区別（型レベル）
| | session message（正本・将来） | thread message（/talk・既存） |
|---|---|---|
| 属する先 | `CoAlterPlanSession.id` | `talk_threads.id` |
| author | participant userId **or `"coalter"`**（B-1 予約） | 人間 sender_id のみ |
| /plan での表示 | chat body（吹き出し列の本文） | 「これまでの会話」文脈セクション（§4-4・分離表示） |
| 相互コピー | **禁止**（thread message を session store に複製しない＝二重正本の禁止。参照表示のみ） | 同左 |
| 既読/通知 | session 内で完結（/talk 不波及） | /plan からは変更しない |

### §5.3 per-viewer / privacy（M5）含意
- メッセージ**本文**は session 参加者の双方可視が既定（会話とはそういうもの）。
- per-viewer になるのは**射影**（条件 chips・rationale・「個別条件は要約して共有」）。⇒ store 設計時に **message（共有）と projection（per-viewer）を別物として分離**し、projection は server で filter（client filter 禁止）。
- CoAlter system author は consent/fairness/M5 の主語にならない（B-1 既定）。

## §6 recommendation

### §6.1 次の design 分岐 = **本書で A+B を確定**（A は §4・B は §5。別 doc を増やさない）
### §6.2 T1c が HOLD のままである理由（不変）
send は「**どこに書くか**」（§5.1 の store）と「**誰として書くか**」（server session authority）の両方が前提のまま未充足。realtime は send なしで価値薄。既読は §5.1-1 で session store 採用なら /talk 波及問題ごと消える＝それまで触らない。useCoAlter は consent（M2-B 文脈）未決。

### §6.3 次の implementation = **session message skeleton（型のみ・B-1 パターン）を先に、thread attach read-only 実装はその後**
理由:
1. **正本の心象を先に固定する**: chat 欄に最初に恒久表示される living data が事実上の正本に見える。正本（session message 型・author 名前空間・projection 分離）を型で先に立ててから thread attach を「文脈セクション」として載せれば、thread が正本化する余地（legacy takeover の柔らかい形）を構造で塞げる。
2. skeleton は **型のみ・additive・fixture 既定**で実績パターン（T1a/B-1）どおりゼロリスク。fixture messages を session message 型に正本化（projection は後続）するだけで、UI 不変。
3. thread attach 実装は §4-4 の「分離表示」語彙（本文 vs 文脈）を要し、それは session message 型から導出される＝順序依存がある。
4. send の前提（§6.4-1 転送路）も skeleton が前進させる。

### §6.4 send が許される前に真でなければならないこと（更新版）
1. **転送路決定**: session message store の設計承認（schema preflight + migration = CEO 承認）。§5.1 で「自前 store」と方向は固定、実体は未承認。
2. **self = server session authority**（client は sender を主張しない・inferred self 不可）。
3. **idempotency / failure semantics**（重複 post なし・silent loss なし）。
4. cross-surface 承認は **不要になる見込み**（session store 採用で /talk に書かない）— thread への送信を将来選ぶ場合のみ復活。

## §7 handoff implications（logic 側 T2/T3 へ）

### §7.1 TalkBridge が今提供できるもの
- **resolved participants**（self=server viewerUserId + `culcept_relation`=accepted connection・捏造ゼロ・raw userId 非表示）。
- **session contract v0.1**（B-1: participants 正本・`attachedThreadRef?`・CoAlter=system actor・TravelCore `ParticipantSourceRef` 1:1）。
- read-only view 契約（identityState 型付け・capabilities 独立 field・GET-only 構造・fail-closed）。

### §7.2 T2/T3 がまだ仮定してはならないもの
- **chat body が session messages であること**（fixture。条件抽出の入力になる「実会話」はまだ無い）。
- 条件抽出・slot 抽出が /plan チャットで走ること（T2 runtime は別 flag・OFF）。
- send・永続化・realtime・per-viewer server 担保の存在。
- thread attach 済みであること（`attachedThreadRef` は型のみ）。
- ⇒ T2/T3 は「**participants は信用してよい・messages はまだ信用するな**」が C-1 後の契約状態。

### §7.3 runtime 抽出・Plan Intelligence 投影は未着手（不変）
TalkBridge は表示と identity のみ。抽出（T2D）・投影（T4/H）は各 CEO GO。

## §8 CEO 判断待ち
1. §5.1「session message store を将来必要とする（thread backing にしない）」方向の承認。
2. 次実装 = **session message skeleton（型のみ）GO**（その後 thread attach read-only 実装）。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
