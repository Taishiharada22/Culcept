# /talk → /plan CoAlter タブ 機能移設 — 監査 + 設計（docs-only）

**作成日**: 2026-06-12
**ステータス**: docs-only（監査 + 移設計画）。**本書の時点でコード移設は行わない**（CEO 指示「ここは危険なので、監査と計画から始めてください」）。
**契機**: CEO レビュー 2026-06-12 ①「/talk の画面を移設できますか？」
**関連**: [coalter-plan-tab-backend-contract-draft.md](coalter-plan-tab-backend-contract-draft.md)（UI 契約正本）/ [coalter-core-ux-layered-presence.md](coalter-core-ux-layered-presence.md)（**破棄対象の旧設計**）

---

## §0 結論（できるか）

**できる。ただし一括移設ではなく段階移設**。理由は §1 の監査結果のとおり、/talk の ChatClient は 2,087 行のモノリスで、「チャット基盤」「CoAlter 対話」「talk 固有の増強系」「上部レイヤー系（破棄対象）」の 4 系統が 1 ファイルに同居しているため。**チャット基盤と CoAlter 対話だけを抜き、talk 固有系と上部レイヤー系は持ち込まない**のが安全線。

CEO 指示の確認:
- **「CoAlter が画面の上部にいる仕組み」= layered presence 設計（上部レイヤー）は破棄**。/plan CoAlter タブには一切持ち込まない。
- 画面の構成は **現 CoAlter タブのチャット欄が正本**。/talk からは**機能面**（実送受信・CoAlter 対話）を引く。

---

## §1 /talk 監査（2026-06-12 時点の実コード）

### §1.1 ルート構成

| route | 実体 | 行数 | 役割 |
|---|---|---|---|
| `/talk` | `app/(culcept)/talk/TalkPageClient.tsx` | 460 | スレッド一覧（genome-connections 承認 UI + unread badge） |
| `/talk/[threadId]` | `app/(culcept)/talk/[threadId]/ChatClient.tsx` | **2,087** | チャット本体（下記 4 系統が同居） |
| `/talk/qr` | `QRPageClient.tsx` | — | 招待 QR |
| `/talk/coalter-preview` | — | — | preview host |

サーバ側 gate: `talk/page.tsx` は auth + `requireBaseline`（**/plan には baseline gate がない**。移設時の差分論点 → §7-3）。

### §1.2 ChatClient 内の 4 系統（機能インベントリ）

**A. チャット基盤（移設対象・正本）**
- メッセージ CRUD: `GET/POST /api/talk/threads/[id]/messages`（pagination `?before=`）、編集 `PATCH`、削除 `DELETE`（ChatClient.tsx:794,809,929,770,1164）
- Realtime: `sb.channel("talk:{threadId}")` postgres_changes 購読（:860）、typing presence `typing:{threadId}`（:751）、接続状態表示
- 既読: `POST /threads/[id]/read`（:822）、reactions（:112-114,1172）、reply、画像 upload（`/api/talk/upload` :1826）、送信失敗 retry、新着バナー、下書き sessionStorage 復元

**B. CoAlter 対話（移設対象・hook 再利用）**
- 正本 hook: `hooks/useCoAlter.ts`（823 行・**threadId を引数に取る自己完結 hook**）。pairState 同意フロー（pending_consent→enabled）、`invoke`/`status`/`accept`/`end`、card dispatch（decision/negotiate/clarify 3 mode）、axis delta + reroll、refine、Plan Shelf（planItems fetch/delete/refine/pair narrative）、awaitingAnswer（会話で答える）、Realtime `coalter_sessions` 監視
- ChatClient 側の結線: 送信成功後の soft trigger 検出（:954-987）、awaitingAnswer 時の再 invoke（:937-947）、同意カード・カード dispatcher・Plan 棚/カレンダー/詳細 sheet の mount（:1722-1760,1336-1391）、handoff events log（:653）
- API 面: `/api/coalter/{invoke,status,accept,end,plan,speech,activate,refine-item,handoff-events}`

**C. talk 固有の増強系（移設対象外・当面 /talk に残す）**
- 意図翻訳（intent-check/intent-translate :1030,1070・**凍結エンジン**=R5 98% で全ファイル変更禁止）、mediate（:1131）、insight/会話深度/conversation starters、Genome tinted テーマ、ミニ観測ボトムシート

**D. 上部レイヤー系（CEO 指示で破棄＝持ち込まない）**
- `UpperLayerMount`（presence executor + UrgentLayer + MemorySurface、ChatClient:1524）
- `PresenceSignalWiring`（メッセージ→presence signal bus、:1527）
- `ObserverHost`（AOO、:1530）/ `MirrorHost`（:1532）
- いずれも `COALTER_FLAGS.presenceExecutorEnabled` 等 **default OFF** で mount 済み。「CoAlter が画面の上部にいる」設計（Core UX v1.1 上部レイヤー / layout plan v0.3 §7）の実体。

### §1.3 监査所見（移設の危険源）

1. **モノリス**: A〜D が 1 ファイル。A だけの抽出 refactor は /talk 回帰リスクが高い。
2. **flag 網**: COALTER_FLAGS は getter ベースで多数（stage1/threeStage/presenceExecutor…）。B を /plan に持ち込むと flag の評価面が 2 箇所になる。
3. **Realtime channel**: `talk:{threadId}` / `typing:{threadId}` / coalter_sessions。/talk と /plan を同時に開くと**二重 subscribe**（同一 client の channel 名衝突・既読/unread の二重 POST）。
4. **gate 差分**: /talk は `requireBaseline` 必須、/plan は PLAN_ROUTE_LIVE のみ。
5. **threadId の出自**: /plan タブには「どのペア/スレッドか」を解決する UI がない（契約 fixture は pairStateId 固定）。

---

## §2 破棄の明確化（上部レイヤー）

- **破棄するのは UI 設計**（「CoAlter が画面上部に常駐する」layered presence の画面文法）。/plan CoAlter タブでは CoAlter は**チャット参加者**としてのみ存在し、上部レイヤー・Mirror・Observer の mount は行わない。
- **コードの削除はしない**。D 系統は flag OFF のまま /talk に残置（/talk 既存挙動 1 bit 不変の原則）。/talk 自体の退役（リダイレクト/削除）は T5 で CEO 別判断。
- presence signal bus / AOO は backend 資産として残る（将来 CoAlter プランナーの観測入力に使う可能性はあるが、本移設のスコープ外）。

## §3 目標像

- **/plan CoAlter タブの右ペイン（CoAlterChatPanel）= チャット surface の正本**。2人 + CoAlter が同じ吹き出し列に並ぶ現行プロトタイプの形を保ち、データソースだけを fixture → 実 thread に差し替える。
- 左 Plan Intelligence パネルとは契約どおり **one session, two projections**（CoAlter の提案カードは当面チャット内 inline 表示 → プラン側への投影は backend 契約改訂後）。
- CoAlter card（decision/negotiate/clarify）は**チャット内のメッセージとして** dispatch する（/talk の「メッセージ列の上に浮くカード」をチャット文法に内包）。

## §4 段階移設計画

**改訂（2026-06-12 CEO 承認）**: 方向性承認。ただし旧 T1（read+send+Realtime+既読の一括）は
「純 UI 作業を超え、実 talk API・auth/RLS・DB write に触れうる」ため **T1a/T1b/T1c に分割**。
製品方針の正本: 「今のデザイン（CoAlter タブのチャット欄）を正本にし、そこへ CoAlter の機能を
引っ張ってくる（ベースは作った方）」。実装順序の正本: ①デザイン正本化（済）→ ②adapter 境界
→ ③read-only /talk thread 表示 → ④send/realtime → ⑤useCoAlter → ⑥Plan Intelligence 側へ投影。

| Phase | 内容 | /talk への影響 | gate |
|---|---|---|---|
| **T0（済）** | fixture チャット UI（現 CoAlterChatPanel） | なし | `NEXT_PUBLIC_PLAN_COALTER_TAB_ENABLED` |
| **T1a（済 2026-06-12・訂正済）** | **chat adapter 境界 skeleton**（`coalterChatAdapter.ts`）。**2 軸を分離**: (A) provider/data-mode（fixture/talk_thread/culcept_relation/plan_session ＝ mock か live か）と (B) participant source（self/talk_pair_member/culcept_relation/plan_session ＝ TravelCore `ParticipantSourceRef` 整合・**`fixture` は participant source ではない**・旧 /talk pair を唯一の出自にしない）。fixture adapter は participant を `plan_session` 出自に正規化。capabilities は read/send/realtime/readReceipts/coalterInvoke の**独立 field**（flag は単一スイッチでない）。**実 API・Realtime・POST・既読・typing・useCoAlter は一切なし**。flag dormant（ON でも fixture） | ゼロ | `NEXT_PUBLIC_PLAN_COALTER_CHAT_LIVE`（**read-only gate のみ**・default OFF・OFF=視覚不変） |
| **T1b（済 2026-06-12）** | **read-only live thread preview**。`useCoAlterChatAdapter` hook が async を内包し、flag ON ∧ dev threadId（`NEXT_PUBLIC_PLAN_COALTER_DEV_THREAD_ID`・**thread picker なし**）の時のみ既存 `GET /api/talk/threads/[id]/messages` を**ちょうど 1 回**読む（in-flight dedupe＝StrictMode 二重 mount でも 1 回。fetchImpl は `(url)=>Response` 形＝POST/PATCH/DELETE 構文上不可）。401/403/404/empty/error は fixture へ fail-closed（unavailable バッジ）。成功時は同じ吹き出し文法で描画 + 「ライブ閲覧中（読み取り専用）」バッジ + 入力 disabled（send="none"＝local echo も不可）。participants は**匿名メンバー A/B**（identity 未解決＝source 省略・旧 pair と断定しない。`CoAlterChatParticipant.source` を optional 化） | ゼロ | 同 flag（read gate）+ dev threadId env |
| **T1b closeout + identity hardening（済 2026-06-12・docs-only）** | 識別境界の明文化 = [coalter-plan-tab-talkbridge-t1b-closeout.md](coalter-plan-tab-talkbridge-t1b-closeout.md)。invariant 固定: `talk_pair_member` は thread message から推論しない / `source?` は read-only 限定で相互作用前に resolved 必須 / partner 既定を旧 pair にしない（thread 相手の第一解決は `culcept_relation`）/ 既読は自動で付けない。**推奨次スライス = T1b-2 resolved participant metadata（read-only）**（full T1c でなく identity 解決を先に） | ゼロ（docs-only） | — |
| **T1b-2（済 2026-06-12・CEO 候補A採択+guardrails）** | **resolved participant metadata（read-only）**。既存 `GET /api/talk/threads` を 1 回読み（dedupe・GET-only 構造）、対象 thread の counterpart を解決。`source?` optional を **identityState discriminated union**（unresolved / display_resolved / resolved）に置換。解決規則: counterpart は connectionId があれば `culcept_relation` resolved（**talk_pair_member 不生成 invariant をテスト固定**）・displayName のみなら display_resolved（source 捏造なし）・自分側は非 counterpart sender がちょうど 1 人のときのみ `self` resolved（役割ラベル「あなた」・本人名は endpoint が返さないため捏造しない）。失敗/不掲載/欠落は T1b の匿名へ fail-closed。capabilities 不変（send:none 維持）。**service_role は /plan に import しない**（threads route の内部実装に read-only 依存・fs ベース source guard テストで恒久化） | ゼロ | 同 flag + dev threadId env |
| **T1b-2 closeout + next-branch（済 2026-06-12・docs-only）** | read-only identity フェーズの締め = [coalter-plan-tab-talkbridge-t1b2-closeout.md](coalter-plan-tab-talkbridge-t1b2-closeout.md)。**identity authority 規則固定**: `resolved` は send 権限でない / send authority は server-side auth/session user から導出（**inferred self を権限化しない**・CEO 指摘）/ `talk_pair_member` は authoritative pair-state のみ / `culcept_relation` は stable connection id+userId 必須 / read receipt は自動禁止。**推奨次分岐 = B+C: CoAlterPlanSession binding 設計（+ Culcept relation を identity 源として併走）docs-only**。A(thread picker) は後回し・D/E/F/G(realtime/send/既読/useCoAlter) は HOLD | ゼロ（docs-only） | — |
| **B+C binding design（済 2026-06-12・docs-only）** | [coalter-plan-session-binding-design.md](coalter-plan-session-binding-design.md)。正本=plan session（contract v0.1 提案: `pairStateId` 廃止→`participants`(userId+ParticipantSourceRef)+`attachedThreadRef?`）。relation⊥consent⊥thread の三分離（pair state は **thread_id NOT NULL UNIQUE**=thread-rooted consent と grounded）。CoAlter は participant でなく system actor（author "coalter" 予約）。thread=optional bridge（picker でなく relation→thread 自動導出）。capability gates 全表 + 実装順（B-1 skeleton→C-1 relation binding→thread attach→send/realtime/useCoAlter→既読最後尾）。CEO 判断 3 点（契約 v0.1 承認 / session 同席 consent 定義 / B-1 GO） | ゼロ（docs-only） | — |
| **B-1 binding skeleton（済 2026-06-12）** | `coalterPlanSessionContract.ts`（型のみ・additive・未配線）。`CoAlterPlanSession` v0.1（pairStateId 廃止・participants 正本）/ `SessionParticipant`（userId 内部のみ+presentation 分離）/ COALTER_SYSTEM_AUTHOR（CoAlter=system actor）/ `buildSessionContractFromFixture`（plan_session 出自・thread なしで成立）。fixture pairStateId は @deprecated コメント。import type のみ=runtime 依存ゼロ。test 7 | ゼロ | 同 flag 群 |
| **B-1 closeout + C-1 preflight（済 2026-06-12・docs-only）** | [coalter-plan-tab-c1-relation-binding-preflight.md](coalter-plan-tab-c1-relation-binding-preflight.md)。★grounded 結論: C-1 一次源=**`GET /api/genome-connections`**（user-RLS・profiles 由来表示名＝**service_role 不要**・relation-keyed・id=connection id・counterpart userId/displayName/avatar・threadId 同梱）＝talk/threads（service_role・thread-rooted）より superior で fallback にもしない。規則: culcept_relation は accepted connection のみ／self は viewerUserId（server prop・auth 由来・推論しない）／relationId 捏造なし／talk_pair_member 不生成／thread 不要／displayName null→UUID 非表示で neutral ラベル／private personalization 非 consume。fail-closed 全件 fixture。推奨 C-1 = pure resolver + read-only hook（GET 1 回・dedupe）・flag OFF。CEO 判断 3 点 | ゼロ（docs-only） | — |
| **C-1 relation metadata binding（済 2026-06-12・実装）** | `coalterRelationBinding.ts`（pure resolver + GET-only fetch）+ `useCoAlterRelationBinding.ts`（hook・既存 `GET /api/genome-connections` を高々 1 回・dedupe）。`culcept_relation` は **accepted connection id + counterpart userId** からのみ／self は **viewerUserId（PlanPage auth.user.id→PlanClient→CoAlterTab prop・推論しない）**／**talk_pair_member 不生成・pairStateId 非依存・threadId 無視・勝手に選ばない**／displayName null→UUID 非表示で 中立ラベル「相手」「あなた」／private personalization 非 consume。bound 時は header の参加者を解決済み identity で表示（chat 本文は fixture のまま=messages binding は別 slice）。全失敗 fixture へ fail-closed。flag `NEXT_PUBLIC_PLAN_COALTER_RELATION_LIVE`+dev counterpart env（default OFF）。test 22・/plan に service_role/supabase import なし（fs guard）。preview 3 状態実証 | ゼロ | 同 flag 群 + viewerUserId server prop |
| **C-1 closeout + message/thread next-branch（済 2026-06-12・docs-only）** | [coalter-plan-tab-c1-closeout-message-branch-design.md](coalter-plan-tab-c1-closeout-message-branch-design.md)。★CEO clarification 固定: C-1=identity/participant binding（「誰が」に回答）・message binding ではない（「chat body の正本」未回答）。設計判断: **/plan は将来 自前 session message store を持つ（thread backing にしない）**＝既読/realtime/通知が /talk に構造的に不波及・solo 対応・CoAlter 発話の保存先・M5 server 担保（schema/migration は別 CEO 承認）。thread attach は文脈セクション（本文と分離表示・relation→thread 導出・picker なし・write/既読なし）。message（共有）⊥projection（per-viewer）分離。**推奨次実装 = session message skeleton（型のみ・B-1 パターン）→ その後 thread attach read-only**（正本の心象を型で先に固定し thread の事実上正本化を構造で塞ぐ）。CEO 判断 2 点（store 方向承認 / skeleton GO） | ゼロ（docs-only） | — |
| **session message skeleton（済 2026-06-12・型のみ・additive・未配線）** | `coalterSessionMessageContract.ts`。`CoAlterSessionMessage`（共有会話/イベントログの正本・sessionId 属・**threadId 不要**）/ author=`{participant,userId}`|`{coalter}` の 2 択（**anonymous/unresolved variant なし**・`isResolvedSessionMessageAuthor` で resolved 必須）/ **body は plain text のみ**（private 条件・per-viewer rationale・抽出 slot・投影は持たせない=message⊥projection）/ visibility 常に shared / `EvidenceRef` は projection→message の id 参照のみ / **draft は author を持たない**（send 時 server stamp=client は sender 主張しない）/ CoAlter は system author で participants 非包含。fixture→session message 写像で representability 証明。thread message(`CoAlterChatMessage`)と型非互換（@ts-expect-error 固定）。test 8・fs guard。UI 描画不変・未配線 | ゼロ | — |
| **session message closeout + thread context preflight（済 2026-06-12・docs-only）** | [coalter-session-message-closeout-thread-context-preflight.md](coalter-session-message-closeout-thread-context-preflight.md)。★運用 invariant 昇格（CEO note）: body:string は projection を構造的に防ぐが**生成が private rationale/制約を共有 text に書かない**運用ルールが別途必要（将来 validator）。thread context: 既存 T1b/T1b-2 read-only 資産（fetch/dedupe/map/匿名導出/read-only adapter）を**新セクション「これまでの会話」に移設**（本文と分離・bubble list に混ぜない・複製しない・「thread」語彙を出さない）。★grounded: `attachedThreadRef?` は **genome-connections.threadId**（route が user-RLS で返す・service_role 非依存・C-1 が既に fetch 済みで無視中）から populate＝relation→thread の唯一許される向き・新 endpoint/`/api/talk/threads` 不使用。thread→identity/session は禁止継続（話者は匿名/表示専用・participants に昇格しない）。**thread context は既定で extraction input にしない**（使う場合は別 GO+privacy review）。T1b の thread-as-body は文脈セクションへ relocate。**推奨次=A: thread context section skeleton（read-only・視覚分離）**（or B: session message body wiring）。CEO 判断 2 点 | ゼロ（docs-only） | — |
| **T1c（HOLD・CEO GO 待ち）** | send + Realtime（channel 名は `plan-talk:{threadId}` に分離）+ 既読（**自動禁止・明示 opt-in のみ**）。send 解禁の前提: binding 決定 + self=session authority + cross-surface 承認 + idempotency + failure semantics（t1b2 closeout §4.3）。リスク順: realtime-read-only → send → typing → 既読 → useCoAlter/`/api/coalter/*`（最後） | ゼロ | binding 決定 + CEO GO |
| **T2** | threadId 解決導線: タブ header のペア表示にスレッド選択（既存 `GET /api/talk/threads` 再利用）。未選択/0 件は fixture 表示のまま | ゼロ | 同上 |
| **T3** | CoAlter 対話接続: `useCoAlter(threadId)` を**そのまま import**（hook は自己完結・§1.2-B）。同意カード/カード dispatcher をチャット吹き出しとして再スタイル。soft trigger・awaitingAnswer の結線を CoAlterChatPanel 側に最小コピー | ゼロ（hook 共有・/talk 側継続動作） | 同上 + 既存 COALTER_FLAGS 尊重 |
| **T4** | プラン側投影: Plan Shelf（planItems）→ 左パネル候補カードへ、調整操作 → `refine` へ。**backend 契約 v1 改訂後**（contract draft §4 の操作契約に合わせる） | ゼロ | CEO 別 GO |
| **T5** | /talk の扱いを CEO 判断（残置 / `/plan` へ誘導 / 退役）。意図翻訳・mediate 等 C 系統の行き先もここで決める | — | CEO |

**T1 を「抽出」でなく「新設」にする理由**: §1.3-1 のとおり ChatClient の refactor は回帰面が広い。API 契約（`/api/talk/*`）は安定しているので、**API 境界で切る**のが /talk 不触で最も安全。重複実装は ~200 行程度の見込みで、T5 で /talk 側を退役すれば解消する。

## §5 リスクと対策

| リスク | 対策 |
|---|---|
| /talk と /plan の二重 subscribe（§1.3-3） | T1 で channel 名を `plan-talk:{threadId}` に分離（postgres_changes は同一 filter で別 channel 可）。既読 POST は /plan 側では「チャットペインが可視のとき」のみ |
| baseline gate 差分（§1.3-4） | T2 で threads fetch が 401/403/empty を返したら fixture に fail-open（/plan に baseline 強制を持ち込まない） |
| 凍結エンジン（意図翻訳）への接触 | C 系統は移設対象外と明文化（本書 §1.2-C）。`lib/talk/intent*` への import を /plan 側から張らない |
| flag 評価面の分裂（§1.3-2) | /plan 側で読む COALTER_FLAGS は T3 の card 表示系のみに限定し、presence 系 flag は読まない |
| pair read / RLS | 既存 `/api/talk/*` の RLS をそのまま使う（新規 API・migration なし）。**M5 の per-viewer payload は T4 の契約改訂マター** |

## §6 不変条件（全 Phase 共通）

1. `/talk` の既存挙動を 1 bit も変えない（ChatClient/TalkPageClient/上部レイヤー系に不触）
2. backend / DB / migration / 新規 API なし（既存 `/api/talk/*`・`/api/coalter/*` の read/call のみ）
3. すべて default OFF の flag 配下。production は PLAN_ROUTE_LIVE で恒久不可視
4. 上部レイヤー（presence executor / Mirror / Observer）を /plan に mount しない
5. local only（GitHub suspended 中・push なし）

## §7 CEO 判断待ち

1. **T1 着手の GO**（本書承認 = T1 実装開始の合図とするか）
2. threadId 解決の形（T2）: ペア 1 組固定で開始するか、スレッド選択 UI を出すか
3. /plan に baseline gate を持ち込まない方針で良いか（§5-2 の fail-open）
4. C 系統（意図翻訳・mediate・insight）の最終的な行き先（T5 で判断・現状は /talk 残置）

🤖 Generated with [Claude Code](https://claude.com/claude-code)
