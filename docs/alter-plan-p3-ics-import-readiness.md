# P3 Alter Plan App — .ics / iCal Import Readiness

**Status**: 起草中 (= CEO 「次の本丸 P3」 指示 2026-05-26、 LLM closeout 帯 並行)
**Date**: 2026-05-26
**Author**: Build Unit (Claude)
**Scope**: Google Calendar / Apple Calendar / Outlook 等の **.ics (iCalendar) ファイル** を Plan App に取り込む経路を確立する。 既存 ExternalAnchor / DB schema は 70% ready、 新規実装は parser + file UI + mapping service + API。
**CEO 思考原則 ①〜⑦ 適用**: 「シンプルから (③)」 「外科的に (④)」 「ゴールから逆算 (⑤)」 を結合する。

## 0. 結論 (= TL;DR)

P3 は **既存 ExternalAnchor 経路への外部 input チャネル追加**。 0 からの作り直しではない (= 既存 API / repository / 承認 invariant を再利用):

1. **W1: parser + mapping service** (= pure module、 .ics → ExternalAnchor[])
2. **W2: file upload UI + preview** (= AddAnchorModal 拡張 or 新 modal)
3. **W3: API + persist + 重複判定** (= 既存 server action + repository 拡張)
4. **W4: smoke + docs + edge case**

**工数**: 3.5-4.5 day (= 既存資産 70% ready)。 P3 着手後 1-2 週で MVP。

---

## 1. 既存資産確認 (= Explore agent 調査結果)

### 1.1 Green assets (= 既に揃っている)
- **ExternalAnchor 型** (= `lib/plan/external-anchor.ts`): OneOff / Recurring discriminated union、 **RRULE / exception_dates 既に RFC 5545 native 対応**
- **DB schema** (= `supabase/migrations/20260430100000_external_anchors.sql`):
  - `external_anchor_sources` テーブル (= source 追跡、 RLS 済)
  - `external_anchors` テーブル (= recurrence_rule, exception_dates, valid_from/until 等)
  - `source_type` CHECK constraint 現状: `'manual', 'template', 'pdf', 'image', 'chat'` (= 'ics' 追加必要)
  - `confirmed_at NOT NULL` (= user 承認 invariant 既に enforce)
- **既存 anchor 作成 API** (= `app/api/plan/anchors/route.ts`、 POST)
- **既存 anchor repository** (= `lib/plan/external-anchor-repository-supabase.ts`、 `createSourceWithAnchors(userId, {source, anchors[]})`)
- **既存 form validation** (= `lib/plan/anchor-input-form.ts`)
- **既存 manual input UI** (= `app/(culcept)/plan/components/AddAnchorModal.tsx`)

### 1.2 Gaps (= 新規実装必要)
- **.ics parser library** (= npm 依存追加必要、 `ical.js` 推奨)
- **file upload UI** (= AddAnchorModal 拡張 or 新 modal)
- **parse-to-anchor mapping service** (= VEVENT → ExternalAnchor、 pure module)
- **migration 微調整** (= `source_type` CHECK に `'ics'` 追加)
- **server action / API** (= 既存 POST 拡張 or 新 endpoint)

### 1.3 NOT needed (= 不要)
- 新 table (= 既存 external_anchor_sources + external_anchors 再利用)
- 新 RLS 設計 (= user_id scoping 流用)
- 新 anchor type (= OneOff / Recurring 既に十分)
- Home / Map への新統合 (= P3 scope は Plan 内のみ)
- LLM 統合 (= P2 が別 layer、 P3 は raw import)

---

## 2. 設計判断点 — CEO 仰ぐ

### Q1: .ics parser library 選定

| Option | 内容 | 推奨理由 |
|---|---|---|
| **A: ical.js** (= 推奨) | npm `ical.js`、 ~50KB gzip、 browser+Node 両対応、 RFC 5545 完全対応、 mature | timezone / RRULE / VEVENT 完全 parse、 信頼性高 |
| B: node-ical | Node only、 lighter (~30KB)、 但し browser 不可 | server-only でも OK だが ical.js が万能 |
| C: custom RFC 5545 parser | 0 deps、 自作 | 工数大 (= 2-3 day)、 RRULE が複雑、 過剰自作 |

**Claude 推奨: A (= ical.js)**

### Q2: source_type 拡張方式

| Option | 内容 |
|---|---|
| **A: 新規 `source_type='ics'`** (= 推奨) | audit trail clear、 既存 pdf/image と独立、 migration 1 行追加 |
| B: 既存 `pdf` に統合 | mime type で識別、 ただし 「file」 generic 化、 audit 曖昧 |

**Claude 推奨: A (= 新 'ics')**

### Q3: 一発 import vs 継続 sync

| Option | 内容 |
|---|---|
| **A: One-shot upload** (= 推奨、 W1-W4 scope) | user が .ics file を upload → parse → preview → 承認 → 保存。 一回限り。 シンプル |
| B: Subscribe URL (= webcal://) | url 保存、 定期 sync (= cron / poll)、 外部 source の更新を反映。 重い、 server cron 必要 |
| C: 両方並行 | 工数大、 認知負荷高 |

**Claude 推奨: A (= one-shot 先行)**、 B は別 phase (= P4 等で検討)

### Q4: 重複判定 strategy

| Option | 内容 |
|---|---|
| **A: VEVENT UID-based dedup** (= 推奨) | .ics の `UID` を `external_anchors.source_uid` or `external_anchor_sources.external_uid` field に保存。 同 UID 既存 → update or skip 選択 |
| B: 内容 fuzzy match | title + startTime + date で hash 比較、 user に表示 |
| C: 重複判定なし | 全 import、 user が事後削除 |

**Claude 推奨: A (= UID-based dedup)**、 ただし新 column 必要 (= migration)

### Q5: user 承認 UX

| Option | 内容 |
|---|---|
| **A: Per-event preview + 一括承認** (= 推奨) | parse 後の events を list 表示、 user が check / uncheck + 「承認して保存」 1 click |
| B: All-or-nothing | 「全部承認」 ボタンのみ、 簡単だが粗い |
| C: Per-event 一件ずつ確認 | 細かいが面倒 |

**Claude 推奨: A (= Per-event preview + 一括承認)**、 confirmed_at NOT NULL invariant 維持

### Q6: implementation W 段階

| W | 内容 | 推奨 day |
|---|---|---|
| W1 | ical.js 追加 + parser + mapping service (= pure module) | 1 day |
| W2 | file upload UI (= AddAnchorModal 拡張 + preview component) | 1-1.5 day |
| W3 | server action + API + repository 拡張 (= UID dedup + migration) | 1-1.5 day |
| W4 | smoke + docs + edge case (= timezone / 大量 events / 不正 file) | 0.5-1 day |
| **合計** | | **3.5-5 day** |

CEO 承認順:
- W1 着手前: CEO Q1-Q5 確定
- W1 完了後: pure module 単体 test PASS で stop、 W2 着手 CEO 承認
- W3 完了後: migration apply CEO 承認
- W4 完了後: smoke + CEO pass 判定

---

## 3. 不変原則 (= P3 確定)

- 既存 ExternalAnchor 型 frozen (= 改変なし)
- 既存 anchor 作成 API / repository 流用 (= 拡張のみ、 既存 contract 不変)
- DB schema 変更は **最小 alter** (= CHECK 1 行 + 新 column `external_uid` 1 列)
- user 承認 invariant 維持 (= `confirmed_at NOT NULL`、 未承認 anchor は persist しない)
- alter plan scope 限定 (= Home / Map / Rendezvous 等への波及なし)
- broad rewrite なし
- LLM 統合は P2 scope (= P3 は raw import のみ、 alterNote は既存経路で後生成)

---

## 4. 段階展開と canary 不要性

P3 は **データ入力チャネル** であり、 LLM のような出力品質 リスク は無い。 そのため canary 不要、 直接 production 投入 OK (= 既存 anchor 作成 API と同等の信頼度)。

- W1-W3 main merge 後、 production 投入は CEO 承認のみ
- rollback path: file upload UI を hide すれば即無効化 (= flag 経由)

---

## 5. CEO 判断 仰ぐ (= 着手前)

| # | 質問 | 候補 | Claude 推奨 |
|---|---|---|---|
| Q1 | .ics parser library | A: ical.js / B: node-ical / C: custom | **A** |
| Q2 | source_type 方式 | A: 新 'ics' / B: pdf 統合 | **A** |
| Q3 | import 方式 | A: one-shot / B: subscribe / C: 両方 | **A** (= one-shot 先行) |
| Q4 | 重複判定 | A: UID / B: fuzzy / C: なし | **A** |
| Q5 | 承認 UX | A: per-event preview / B: all-or-nothing / C: 一件ずつ | **A** |
| Q6 | W 段階 確認 | W1-W4 plan / 別 break | **W1-W4 順次** |

---

## 6. 次

CEO Q1-Q6 確定後:
1. readiness 「確定」 化
2. W1 着手 (= branch 切替 + ical.js 追加 + parser + mapping service)
3. W1 完了で CEO 報告 + W2 承認
4. W2-W4 順次

並行で LLM closeout 帯 Track 3 (= 50+ データ後の再分析) は **データ蓄積 wait** 状態。

---

## 7. 関連設計書

- `docs/alter-plan-foundation-design.md` (= ExternalAnchor 原典)
- `supabase/migrations/20260430100000_external_anchors.sql` (= 既存 schema)
- `lib/plan/external-anchor.ts` (= 型定義)
- `lib/plan/external-anchor-repository-supabase.ts` (= 既存 repository)
- `app/api/plan/anchors/route.ts` (= 既存 anchor API)
- `app/(culcept)/plan/components/AddAnchorModal.tsx` (= 既存 manual input UI)
