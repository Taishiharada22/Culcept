# P3 Completion Readiness — ICS + Google end-to-end 完成 (= 短く 1 枚)

起草日: 2026-05-27
親 phase: P3 (= 外部ファイル import / source 運用層)
CEO 確定: 2026-05-27 (= migration-debt closeout 後の本流復帰、 4 点固定済)

---

## §0. Scope (= 完成条件)

**P3 完成 = 以下 2 系統が end-to-end で通る:**

1. **ICS import**: preview → save → external_anchor 作成 → UI 反映
2. **Google Calendar import**: connect → events fetch → save → external_anchor 作成 → UI 反映

**P3 完成に含めない (= 後段):**
- Outlook / 他 provider
- background sync の高度化
- 多カレンダー運用の磨き込み
- content sanity の深掘り

---

## §1. 前提 (= 復帰時の固定状態)

| 項目 | 値 |
|------|------|
| branch | `feat/p3-completion` (= main から本日新規派生) |
| main HEAD | `89ec0006` (= migration-debt phase closeout 着地済) |
| linked ref | `hjcrvndumgiovyfdacwc` (staging、 production link 解除済) |
| staging schema_migrations | 177 row (= R3 完走) |
| production schema_migrations | 177 row 同期 (= R4 完了済、 既登録 + Step 1 today apply) |
| 既存 freeze branch | `feat/alter-plan-p3-a-1-google-readiness` (HEAD `18aa6111`、 参照用) |

---

## §2. 既存資産の棚卸 (= freeze branch から取り込む対象)

### §2.1 ICS import (= W1-W3)

| 資産 | 状態 | 取扱 |
|------|------|------|
| `lib/external-anchors/icsParser.ts` (= pure module) | 完成 | cherry-pick |
| `lib/external-anchors/icsToAnchorMapper.ts` (= pure module) | 完成 | cherry-pick |
| `lib/external-anchors/icsPreviewBuilder.ts` (= pure module) | 完成 | cherry-pick |
| `components/.../IcsImportModal.tsx` (= modal UI) | 完成 | cherry-pick |
| `app/actions/importIcsAnchorsAction.ts` (= server action 本実装) | 完成 | cherry-pick |
| 単体 test (parser + mapper + preview + action + repository) | 完成 | cherry-pick |
| Plan UI entry point + カレンダーアイコン | 完成 | cherry-pick |

### §2.2 Google Calendar (= P3-A-1)

| 資産 | 状態 | 取扱 |
|------|------|------|
| `app/api/oauth/google/connect/route.ts` (= state + scope + redirect) | 完成 | cherry-pick |
| `app/api/oauth/google/callback/route.ts` (= 6 条件 unit test) | 完成 | cherry-pick |
| `lib/external-anchors/googleCalendarEvents.ts` (= fetch + mapper) | 完成 | cherry-pick |
| `lib/external-anchors/refreshGoogleAccessToken.ts` (= refresh helper) | 完成 | cherry-pick |
| `app/api/oauth/google/{status,disconnect}/route.ts` | 完成 | cherry-pick |
| `components/.../CalendarConnectBanner.tsx` | 完成 | cherry-pick |
| 設定画面 連携セクション | 完成 | cherry-pick |
| `user_calendar_connections` migration (= schema-only) | 完成 | cherry-pick (= **staging で apply 確認必要**) |

### §2.3 取り込んでいないもの (= 新規実装が必要)

**Google Calendar 取り込み&反映の本流** — これが「土台はある、 本流未完」 の核心:

- `googleCalendarEvents fetch` → `googleEventsToAnchorMapper` → `external_anchor 作成` の **end-to-end 接続** (= action layer)
- UI からの **手動 import trigger** (= Google import button、 IcsImportModal と並列)
- import 後の **UI 反映確認** (= Plan FlowTab / Calendar / Map で表示)
- 既存 `create_external_anchor_bundle` RPC との **接続** (= atomic save)

---

## §3. 実装順序 (= シンプル法案、 思考原則 ③)

### Phase A: ICS end-to-end の通し確認 (= 既存資産検証)

1. ICS 関連 file を freeze branch から cherry-pick (= file 単位移植 OK)
2. 単体 test 全 PASS 確認
3. dev server 起動 + 実際の .ics file で smoke (= preview → save → UI 反映)
4. external_anchor が DB に保存され、 Plan UI で表示されることを目視確認

### Phase B: Google Calendar end-to-end の通し完成 (= 本流未完の解消)

1. P3-A-1 系 file を freeze branch から cherry-pick
2. `user_calendar_connections` migration を staging で apply 確認
3. OAuth connect → callback → status banner の動作確認 (= 既存パターン)
4. **新規実装**: Google import action (= 既存 ICS action と並列、 fetch + mapper + bundle RPC)
5. **新規実装**: UI からの import trigger (= Google import button or 自動 sync trigger 設計)
6. import 後の UI 反映確認

### Phase C: end-to-end smoke (= staging 上で実 user 視点)

1. linked ref を staging で実 user (= aneurasync@outlook.com) でログイン
2. ICS file upload smoke
3. Google Calendar connect smoke
4. 双方とも Plan UI で正しく表示確認
5. P3 完成判定

---

## §4. 環境方針 (= Q4 確定済、 2026-05-28 §4-X 緊急補正反映)

| Phase | linked ref (CLI) | runtime SUPABASE_URL (= dev server) | 用途 |
|-------|------------------|-------------------------------------|------|
| 開発中 (= Phase A / B) | `staging` | **`staging` 必須** | unit test + local smoke、 dev server `npm run dev` |
| end-to-end 確認 (= Phase C) | `staging` | **`staging` 必須** | 実 user 視点の動作確認 |
| production | **触らない** | **touch しない** | 本 phase 内では一切手を出さない |

### §4-X. 重大注意 (= 2026-05-28 致命的 mismatch 発覚を受けた恒久ルール)

**`supabase link` と dev server runtime env は別物。** 切替忘れによる事故が実発生したため、 以下を smoke 前に必ず確認:

1. **CLI link** (= `cat supabase/.temp/project-ref`): 目的 ref か
2. **runtime URL** (= `.env.local` の `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_URL`): 目的 ref か
3. **両者一致**: link と runtime URL が同じ project ref を指していること

**production runtime での smoke は禁止**。 もし `.env.local` が production を指したまま dev server を起動した場合、 即座に kill し、 CEO 報告。

**env 切替後は必ず dev server 再起動**: Next.js は env を起動時にしか load しない (= HMR では再 load しない)。

### §4-Y. 切替手順 (= staging へ向ける場合)

1. `.env.local` を staging credentials に書き換える (= `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 等)
2. **commit しない** (= `.env.local` は通常 `.gitignore` 配下、 secret も含むため絶対 commit 禁止)
3. dev server 完全 kill (= 子 process まで)
4. dev server 再起動
5. runtime ref 確認 (= `cat .env.local | grep SUPABASE_URL`)
6. smoke 実行
7. smoke 完了後、 `.env.local` を production に戻す (= 通常運用環境への復帰、 secret 漏れ防止)

### §4-Z. local Supabase 起動の判断

不採用 — `supabase start` は別 phase で検討。 今は staging 直接で進める方が速度優先。

---

## §5. CEO 個別承認 stop point

各 Phase の境界で停止 + CEO 承認:

1. **Phase A 着手前**: cherry-pick 対象 file list の最終確認
2. **Phase A 完了後**: ICS end-to-end smoke 結果報告 → Phase B 着手判断
3. **Phase B Step 4 (= Google import action 新規実装) 着手前**: 設計 mini-readiness の承認
4. **Phase B 完了後**: Google end-to-end smoke 結果報告
5. **Phase C 完了後**: P3 完成判定

→ 各 Phase 完了で停止 + 報告、 自律で次 Phase に進まない。

---

## §6. 残課題 (= P3 完成後 / 別 phase)

- **Outlook 対応** (= ICS standard なので大半は流用可能、 ただし event signature が provider 差あり)
- **他カレンダー** (= Apple iCloud / Yahoo / etc.)
- **clean up** (= dev console.log / unused code / legacy path の整理)
- **カレンダータブ再設計** (= P3 完成後の UI 再構築)
- migration-debt closeout §5 deferred items (= content sanity / migration list 信頼性)

---

## §7. CEO 確認 stop point (= 着手前)

次の動きを CEO 確認:

1. **Phase A 着手** = freeze branch からの cherry-pick file 一覧確認後、 ICS 通し検証から開始してよいか
2. **linked ref 維持** = staging のままで Phase A 進めてよいか、 local supabase 起動を先にすべきか
3. **既存 P3-A-1 closeout doc** (= `docs/alter-plan-p3-a-1-*-closeout.md` 系) が main にない場合、 closeout 系も cherry-pick 対象に含めるか

→ 上記 3 点 CEO 確認後、 Phase A 着手。
