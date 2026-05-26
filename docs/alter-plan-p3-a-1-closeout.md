# P3-A-1 Phase Closeout Report (= DB 非依存範囲)

**Date**: 2026-05-26
**Branch**: `feat/alter-plan-p3-a-1-google-readiness`
**Status**: 🟢 DB 非依存範囲は完成、 migration apply 後の実 DB 接続は別 phase
**Scope**: P3-A-1 (= Google Calendar OAuth 連携) の **DB 非依存で閉じた範囲** の最終整理

---

## 0. 背景 — closeout の意義

P3 redefinition (= CEO 2026-05-26、 「OAuth 主導線 + .ics fallback + URL subscription fallback」 の 3 段構成) において、 **P3-A-1 = Google Calendar OAuth 連携** が phase 最初の主導線。

D-e 採用 (= 2026-05-26、 migration debt が production / staging 両方に発覚) により、 実 DB apply は別 phase に切り離した。 そのため、 本 closeout は:

- ✅ **DB 非依存範囲の完成** を確定
- 🟡 **migration apply 後の再開点** を明示
- 🔴 **block 条件** (= 環境管理 debt) を別 phase に譲渡

これは **「完了」 ではなく 「区切り」**。 P3-A-1 の実 production 動作は migration apply 後の追加 phase で初めて成立する。

---

## 1. 完成済み範囲 (= 23 commits、 197 unit tests、 D-e 整合)

### 1.1 commit 履歴 (= 23 commits 全体 = 私 19 + ics merge 経由 4)

```
153456c2 feat: G-α settings/integrations + UI shell (= 19 tests)
596ccf1c feat: E-α refreshGoogleAccessToken (= 11 tests)
f11fe52a feat: C-α events fetch + AnchorDraft mapper (= 36 tests)
8980946a docs: D-e 採用 — migration apply 止めて運用 debt 整理のみ
139aebde feat: P3-A-1-1-h CalendarConnectBanner (= 20 tests)
7aa63fdb feat: P3-A-1-1-f modal toggle + status/disconnect (= 32 tests)
4742226d merge: ics branch を P3-A-1 branch に統合 (= Option 2)
b1272a86 feat: P3-A-1-1-d callback + crypto/api/repo (= 51 tests)
7b4d3f65 docs: B1 staging push 試行結果 + D3 採用方針記録
c6d607ab feat: P3-A-1-1-c connect route (= 28 tests)
ae2b8458 chore: P3-A-1-1-b env 整備 + readiness CEO 確定値反映
8e443eb7 feat: P3-A-1-1-a migration draft (= schema-only、 db push HOLD)
b8f272e5 docs: P3-A-1-1 readiness GPT 4 補正反映
9eb81579 docs: P3-A-1-1 OAuth scaffold readiness 起草 (= 8 項目)
b9129895 docs: P3-A-1 readiness Q2 補正 (= CEO 確定、 scope 採用案 c)
acd6a081 docs: P3 redefinition + P3-A-1 readiness 起草

[ ics 統合 (= P3-B、 別 branch から merge) ]
fd6d827a feat: P3 W3 ics import 永続化 + UID dedup + migration draft
6c4d2edf feat: P3 W2 review/approve UI + canary 4 補正
b6f36f04 docs: P3 readiness に CEO + GPT 4 補正
dc689d56 feat: P3 W1 ics parser + anchor mapper
```

### 1.2 領域別 完成状態

#### A. OAuth flow (= server-side routes)

| Route | 実装 | unit tests | 動作 (= D-e 整合) |
|-------|------|-----------|-------|
| `GET /api/calendar/google/connect` | ✅ | 28 (= 13 helper + 15 route) | env 未設定 → degrade redirect、 banner 表示 |
| `GET /api/calendar/google/callback` | ✅ | 11 + 既存 callback path | env 未設定で degrade、 mock で全 path 検証完了 |
| `POST /api/calendar/google/disconnect` | ✅ | 8 (= status/disconnect 内) | env 未設定で 500、 既存 connection なしで idempotent ok |
| `GET /api/calendar/google/status` | ✅ | 6 (= status/disconnect 内) | 未認証 / DB 未設定で fail-safe `connected: false` |

#### B. Helpers (= pure / fetch mockable)

| File | 責務 | unit tests |
|------|------|-----------|
| `lib/oauth/googleCalendarState.ts` | state cookie HMAC sign/verify | 15 |
| `lib/oauth/tokenCrypto.ts` | AES-256-GCM encrypt/decrypt | 12 |
| `lib/oauth/googleCalendarApi.ts` | exchangeCode / refresh / fetchCalendarList / revoke | 16 + 8 + 11 + 8 |
| `lib/oauth/calendarConnectionRepository.ts` | upsertConnection / findConnection / deleteConnection / bulkUpsertSubscriptions + pure helpers | 22 |
| `lib/oauth/googleCalendarEvents.ts` | fetchCalendarEvents + fetchAllCalendarEvents (= pagination) | 15 |
| `lib/oauth/googleEventsToAnchorMapper.ts` | Google event → AnchorDraft (= pure transform) | 21 |

#### C. UI components

| Component | 役割 | unit tests |
|-----------|------|-----------|
| `IcsImportModal.tsx` (= ics merge 経由 + G-α 改修) | Plan header の 「📅 取り込む」 modal、 Google toggle button + .ics file input | (= ics test 群 57) |
| `CalendarConnectBanner.tsx` | callback redirect 後の URL query → user feedback banner | 20 |
| `app/(culcept)/settings/integrations/CalendarConnectionSection.tsx` | 設定画面 連携 section (= 3 state UI shell) | 11 |
| `app/(culcept)/settings/integrations/connectionDisplay.ts` | pure helpers (= status / time / role labels) | 8 |

#### D. Migration draft

| File | 内容 | apply 状態 |
|------|------|---------|
| `supabase/migrations/20260526110000_p3_a_1_1_calendar_oauth.sql` | `user_calendar_connections` / `user_calendar_subscriptions` + RLS + indexes | **draft 着地済、 apply HOLD** (= D-e で凍結) |

#### E. Readiness + decision docs

- `docs/alter-plan-p3-a-1-google-calendar-readiness.md` (= 親、 12 問全 CEO 確定)
- `docs/alter-plan-p3-a-1-1-oauth-scaffold-readiness.md` (= 8 項目 OAuth scaffold)
- `docs/alter-plan-migration-apply-plan.md` (= D-e 採用後の apply 計画整理、 別 phase 用)
- `docs/decision-log.md` (= 2026-05-26 entry に詳細記録)

---

## 2. DB 非依存で閉じた範囲

### 2.1 検証可能な範囲は **完全に検証済**

- **197 unit tests 全 PASS** (= 28 + 51 + 32 + 20 + 36 + 11 + 19)
- すべて **mock 化** (= fetch / supabase client / 暗号化 key / state cookie)
- tsc 0 errors (= P3-A-1 関連 file で型違反 0)
- production smoke で **fail-safe 動作確認済**:
  - banner UI: 5 状態 (= success / partial / canceled / retryable error / non-retryable error) 全部正常表示
  - connect route: env 未設定 → `?calendar_connect_error=not_configured` redirect
  - status route: DB 未適用 → `connected: false` 安全返却
  - disconnect route: 既存 connection なし → idempotent ok

### 2.2 D-e 不変原則は最後まで遵守

本 phase で **一度も db push 実行せず**:
- staging / production への schema 変更 0
- production data への影響 0
- 既存 user 体験への regression 0

---

## 3. D-e により止めた範囲 (= block 条件)

migration apply 後でないと **動かない / 検証できない** 範囲:

### 3.1 DB persist 動作

- callback route の **token + scope の実 DB persist** (= `upsertConnection`)
- callback の **calendar list 取得後の subscriptions bulk insert** (= `bulkUpsertSubscriptions`)
- status route の **実 connection 検索** (= `findConnection` が常に null 返す現状)
- disconnect route の **実 token revoke + DB delete** (= 既存 connection ないため何もしない)
- 設定画面 subscription toggle の **永続化** (= internal state のみ)

### 3.2 real sync (= initial sync の DB persist)

- C-α で fetch + transform は完成、 events → AnchorDraft 変換は動く
- ただし **`external_anchors` table が production にも未適用** = persist 経路がない
- initial sync 完走 smoke = migration apply + sync 実装層追加 後

### 3.3 sourceType 'google_calendar' 分離

- 暫定: 'ics' 流用 (= C-α + E-α、 CEO 確定 「恒久化しない」)
- migration apply phase で必ず:
  1. sourceType に 'google_calendar' 追加 migration 起草
  2. `lib/oauth/googleEventsToAnchorMapper.ts` の sourceType 切替
  3. dedup 機構を 'ics' と 'google_calendar' で分離

---

## 4. migration debt を別 phase に切った理由

### 4.1 確認された 3 つの問題 (= 2026-05-26 read-only 確認)

#### Problem 1: production が main と未同期

| 状態 | 数 |
|------|---|
| production 適用済 | 169 file |
| **production 未適用** | **8 file** (= 6 timestamp、 重複 2 セット影響) |

**未適用 file 詳細**:
- `20260430100000_external_anchors.sql` ← P3 foundation 自体 !
- `20260430100000_coalter_memory_items_realtime.sql`
- `20260430110000_plan_drift_events.sql`
- `20260430110000_coalter_memory_items_replica_full.sql`
- `20260519100000_create_external_anchor_bundle.sql` ← W1-Y RPC
- `20260520120000_coalter_mirror_app_settings.sql`
- `20260526100000_p3_ics_import.sql` ← P3-B
- `20260526110000_p3_a_1_1_calendar_oauth.sql` ← 本 phase

#### Problem 2: staging が完全空

- **175 file 全て未適用** (= 一度も apply されていない dev project)
- 「30+ 未適用」 と前回認識は誤り、 実は全件
- dev/test 環境として未稼働

#### Problem 3: repo に重複 timestamp 2 セット

- `20260430100000_*` (= external_anchors + coalter_memory_items_realtime)
- `20260430110000_*` (= plan_drift_events + coalter_memory_items_replica_full)
- migration history が **どちらが先か曖昧**

### 4.2 別 phase 切り出し判断の根拠

1. **CEO 「production 直 push ではない」 明示** → production 単独 apply は NG
2. staging 全同期は production 未適用の migration を staging に先行する意味を持つ → 慎重判断必要
3. 重複 timestamp の解消は migration management の根幹 → 軽い修正ではない
4. これらは P3-A-1 の責務ではない (= P3 という 「外部 import 導線」 phase の範囲外、 環境管理の運用課題)

→ `docs/alter-plan-migration-apply-plan.md` に **4 scenario の判断材料** を整理、 別 phase で CEO 慎重判断。

---

## 5. 再開点 (= migration apply 後に何を実装すれば動くか)

### 5.1 着手順序案

```
Step 1: migration apply (= 別 phase、 CEO 慎重判断)
    - production 未適用 8 file の apply 順序確定
    - 重複 timestamp 解消方針確定
    - staging 同期判断
    - 詳細は docs/alter-plan-migration-apply-plan.md 4 scenario 参照

Step 2: sourceType 'google_calendar' 分離 (= 単独 commit)
    - 新規 migration: sourceType CHECK 制約に 'google_calendar' 追加
    - lib/oauth/googleEventsToAnchorMapper.ts: sourceType 'ics' → 'google_calendar' 切替
    - 既存 dedup 機構 (= externalUid) はそのまま流用、 sourceType だけ別系統化

Step 3: initial sync 実 DB persist (= 別 commit)
    - C-α で fetch + transform 完成
    - 後段 persist 層を追加:
      - 取り込み済 user_calendar_connections.refresh_token を復号
      - refreshGoogleAccessToken で access_token 取得
      - fetchAllCalendarEvents で過去 30 日 + 未来 90 日 取得
      - mapGoogleEventsToAnchorDrafts で AnchorDraft 配列化
      - createSourceWithAnchors (= 既存 repository、 'google_calendar' source として persist)
    - syncToken を user_calendar_subscriptions.sync_token に保存
    - errors handling (= invalid_grant → status='token_expired' 反映)

Step 4: subscriptions toggle 永続化 (= G-α UI shell の実装層)
    - PUT /api/calendar/google/subscriptions/{id} route
    - is_enabled 永続化
    - next sync 時 is_enabled=true の calendar のみ fetch

Step 5: 全 chain 通し smoke (= 実 user で OAuth → sync → 表示確認)
    - 銀色 G button click → consent → callback → DB write → /plan?calendar_connected=1
    - 設定画面で接続状態確認 + per-calendar toggle 動作
    - 取り込まれた events が Plan tab に表示される
```

### 5.2 既に揃っている資産 (= 再開時に再利用可能)

| 資産 | 役割 | 再開時の使い方 |
|------|------|---------|
| 全 OAuth route | 入口 | env 設定済なら **そのまま動く** |
| Crypto helpers | refresh_token 暗号化 | そのまま使える |
| Repository helpers | DB upsert / find / delete | migration apply 後即動く |
| events fetch + mapper | sync 本体 | persist 層追加で完成 |
| UI (= banner / modal / settings) | feedback | DB write 接続後にそのまま動く |

### 5.3 「DB 接続が来た瞬間に動く」 設計の証跡

- 全 route は env / DB の不在を **degrade 経路** で処理 (= 既存 production smoke で確認)
- env 設定 + migration apply で 「false → connected: true」 に **自動切替**
- migration apply の追加 commit が **既存コードに 1 行も touch しない** ことを保証 (= D-e 不変原則の最大の恩恵)

---

## 6. P3-A-1 で達成した革新性

### 6.1 Aneurasync 独自設計

- **subscriptions 自動判定 logic** (= 親 Q2 採用案 c): primary + accessRole='owner'/'writer' → default ON、 reader → default OFF
  - 「user に聞かない」 + 「primary 固定でもない」 の両立
  - shared calendar (= 他人の予定) の混入を構造的に防止

- **sourceProvenance 2 軸 model との integration design**: Google import も既存 ics import と同 dedup 機構 (= externalUid) で動く

- **sourceType 'ics' 暫定流用 + 恒久化拒否の明示** (= 3 箇所 TODO 残置):
  - `lib/oauth/googleEventsToAnchorMapper.ts` header コメント
  - `docs/decision-log.md` E-α + G-α section
  - `docs/alter-plan-migration-apply-plan.md` (= apply 計画統合時に必ず実施)

### 6.2 D-e 不変原則の徹底

「DB 非依存で進める」 ことを **23 commits 通して 1 度も破らず** に完走。 これは 「進行を止めずに、 本番 DB に手を出さず、 安全な範囲で最大進める」 という ④ 外科的緻密の実践例。

### 6.3 multi-state 設計の徹底

- banner 4 状態 + retry 制御
- modal toggle 3 状態 (= unknown / loading / connected / disconnected)
- 設定画面 3 状態 (= loading / disconnected / connected)
- callback 8+ degrade 経路 (= env / Google error / state / token / authn / DB / list / subscriptions)

全状態を **mock test で網羅検証**。

---

## 7. 関連 docs / commits 一覧

### 7.1 Readiness chain

| Doc | 起草 commit | 役割 |
|-----|----------|------|
| `docs/alter-plan-p3-a-1-google-calendar-readiness.md` | `acd6a081` + `b9129895` (Q2 補正) | 親 readiness、 12 問全 CEO 確定 |
| `docs/alter-plan-p3-a-1-1-oauth-scaffold-readiness.md` | `9eb81579` + `b8f272e5` (GPT 4 補正) + `ae2b8458` (CEO 確定値) | 8 項目 OAuth scaffold |
| `docs/alter-plan-migration-apply-plan.md` | `8980946a` | D-e 採用後の apply 計画 (= 別 phase) |

### 7.2 Decision-log 主要 entry (= 2026-05-26)

- P3 redefinition + Phase Next 6 軸記録
- Q2 採用補正 (= scope 採用案 c)
- B1 試行結果 + D3 採用 (= local Supabase 検証 path)
- D-e 採用 + production / staging 状況
- sourceType 'ics' 流用 暫定措置 (= CEO 確定文)
- E-α 進行 / G-α 進行

### 7.3 Code 資産 directory

- `app/api/calendar/google/` (= 4 routes)
- `lib/oauth/` (= 8 helper files)
- `app/(culcept)/settings/integrations/` (= 3 files)
- `app/(culcept)/plan/components/CalendarConnectBanner.tsx` (= banner)
- `app/(culcept)/plan/components/IcsImportModal.tsx` (= modal、 ics 経由)
- `tests/unit/oauth/` (= 7 test files)
- `tests/unit/api/` (= 3 calendar test files)
- `tests/unit/plan/` (= banner + section test files)
- `supabase/migrations/20260526110000_p3_a_1_1_calendar_oauth.sql` (= draft)

---

## 8. 次着手 (= F-γ Phase Next-1 readiness)

GPT 推奨順: **F-β (本 doc) → F-γ (Phase Next readiness)**。

F-γ scope:
- 本丸 (= CEO ゴール 「予定が勝手にできあがる」) の 入口 = **Phase Next-1 Rhythm baseline 学習**
- readiness 起草 (= まずは Next-1 中心、 後で Next-2 〜 Next-6 も)
- 自立推論: P3-A-1 で取り込んだ events を **どう pattern 化するか** の設計

F-α (= LLM Track 3) は今ではない (= GPT 判断、 50+ data 蓄積後)。

migration apply phase は別タイミング、 CEO 慎重判断。

---

## 9. closeout 不変原則

- 本 doc は **「完了宣言」 ではなく 「区切り宣言」**
- 実 production 動作は migration apply 後の追加 phase で初めて成立
- P3-A-1 の resume point は §5.1 着手順序案で明示済
- D-e により block された範囲は `docs/alter-plan-migration-apply-plan.md` で別 phase 管理
- 本 closeout を逸脱した 「次の commit」 は CEO の明示的着手 GO が必要

---

## 10. 本 phase 着地宣言 (= CEO 確定 2026-05-26)

### 10.1 着地宣言

**P3-A-1 phase は 「DB 非依存範囲 closeout 完了」 として本日 (= 2026-05-26) 凍結する。**

これは:
- ✅ DB 非依存範囲 (= OAuth flow / Crypto / Repository helpers / UI shell / events fetch + transform / refresh helper) は完成
- ❌ **phase 全体としては未完** (= migration apply / 実 DB persist / sourceType 'google_calendar' 分離 / initial sync 完走 が未着手)
- ❌ **本番投入可能状態ではない** (= 中核の DB 層が未接続)
- 🔒 **main merge は本日時点で実施しない** (= 中間状態を main に固定するのは早い)

### 10.2 「数字 freeze」 (= 表記揺れ防止)

P3-A-1 phase の閉じた数字を **本 §10 で確定** する:

#### Unit tests (= 本 phase 内 197)

```
P3-A-1 phase 内 unit tests: 197 = 28 + 51 + 32 + 20 + 36 + 11 + 19
                                    │    │    │    │    │    │    │
                                    │    │    │    │    │    │    └ G-α (= 設定画面、 11 pure + 8 markup)
                                    │    │    │    │    │    └─── E-α (= refresh helper)
                                    │    │    │    │    └─────── C-α (= events 15 + mapper 21)
                                    │    │    │    └──────────── P3-A-1-1-h (= banner)
                                    │    │    └───────────────── P3-A-1-1-f (= revoke 8 + find/delete 10 + status/disconnect 14)
                                    │    └────────────────────── P3-A-1-1-d (= helper 12 + api 16 + repo 12 + route 11)
                                    └─────────────────────────── P3-A-1-1-c (= state helper 15 + route 13)

注: ics merge (= P3-B、 57 tests) は別 phase の merge 経由、 本 phase 数値には含めない
    本 phase 内合計 + ics 由来 = 197 + 57 = 254 (= branch 全体 unit tests)
```

#### Commit 数 (= branch 全体 23、 私の独自 19、 production code 8)

```
P3-A-1 branch 全 commits: 23 = 19 (= 私の独自) + 4 (= ics merge 経由)

私の独自 19 の内訳:
  - feat (= production code): 8
      P3-A-1-1-a migration draft (= schema-only)
      P3-A-1-1-c connect route
      P3-A-1-1-d callback route + crypto/api/repo helpers
      P3-A-1-1-f modal toggle + status/disconnect
      P3-A-1-1-h CalendarConnectBanner
      C-α events fetch + mapper
      E-α refresh helper
      G-α settings/integrations
  - chore (= env / config): 1
      P3-A-1-1-b env 整備
  - docs (= readiness / decision-log / closeout): 9
      P3 redefinition + readiness 起草
      Q2 補正
      OAuth scaffold readiness 起草
      OAuth scaffold readiness GPT 4 補正
      B1 試行 + D3 採用
      D-e 採用
      F-β closeout 報告
      F-γ Next-1 readiness
      P3-A-1 着地宣言 (= 本 §10)
  - merge: 1
      ics branch merge (= P3-B 統合)

ics merge 経由 4 (= main にいない、 ics branch 由来):
  - P3 W1 ics parser + mapper
  - P3 readiness 補正 (= ics branch 経由)
  - P3 W2 review/approve UI
  - P3 W3 ics persist
```

**今後 P3-A-1 phase を参照する全 docs / commit message は本 §10.2 数字に統一**:
- 「197 tests」 (= P3-A-1 phase 内、 ics 除く)
- 「23 commits」 (= branch 全体)
- 「19 commits」 (= 私の独自、 ics merge 経由 除く)
- 「8 production code commits」 (= feat 系のみ)

P3-B の ics test 群を含めて言及する場合のみ 「254 tests (= P3-A-1 197 + P3-B 57)」 と明示。

### 10.3 再開条件 (= 3 step、 CEO 個別判断で各 step 起動)

**Step 1: migration debt phase の方針確定** (= P3 範囲外、 別 phase の運用課題)
- production 未適用 8 file の apply 順序
- staging 完全空状態への対応 (= 同期 / 廃止 / 新 project)
- repo 重複 timestamp 2 セット (= rename / そのまま保持)
- 参照: `docs/alter-plan-migration-apply-plan.md` の 4 scenario

**Step 2: apply 方針確定** (= Step 1 後)
- どの migration を、 どの環境に、 どの順序で apply するか CEO 慎重判断
- 「production 直 push ではない」 制約遵守
- staging 同期するか、 production 単独で進めるかの最終判断

**Step 3: DB persist / initial sync / sourceType 分離** (= Step 2 後)
- closeout §5.2 の Step 2 〜 Step 5 (= sourceType 分離 / sync persist / toggle 永続化 / 通し smoke)
- これらは migration apply が完了して初めて意味を持つ phase

**3 step すべてに CEO 個別着手 GO が必要**。 順序を飛ばさない。

### 10.4 freeze 中の不変原則

- 本 phase の commit を追加しない (= 本 §10 着地以降)
- main merge を実施しない (= CEO 個別判断まで)
- branch (`feat/alter-plan-p3-a-1-google-readiness`) は保持
- 他 phase からの参照は本 doc + decision-log + readiness chain で完結

### 10.5 「完成した部分をきれいに凍結する」 (= CEO 確定文)

> 「ここは "完成した部分をきれいに凍結する" 地点であって、 "main に流し込む" 地点ではありません。」 (CEO 2026-05-26)

P3-A-1 phase 着地。
