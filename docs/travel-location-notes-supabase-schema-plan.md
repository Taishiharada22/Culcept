# Phase C — Travel / Location Notes / Calendar Supabase Schema Plan（docs-only）

> **改訂 C-1（2026-06-20・docs-only hardening）**: DB 化前の堅牢化パッチ。
> ① `travel_days` unique を `(trip_id, date)` に（同一日 複数 trip 許容）＋Calendar primary-day 選択設計。
> ② 全テーブル案に `user_id`（RLS owner-only 前提）を明記。
> ③ `location_notes` を `contributor_type`（投稿者属性）/ `source_type`（情報由来）に分離。
> ④ public/shared は Phase G まで未解禁を明確化（Phase D は policy テストのみ・実データは private 中心）。
> ⑤ Calendar 実データ接続案の表現を厳密化（既存 CalendarTab 導線の data source 差し替えであり新規接続ではない）。

- **日付**: 2026-06-20
- **担当**: Build Unit（設計）／ **承認**: CEO
- **種別**: **docs-only**。本書では **migration 作成・適用、SQL 実行、seed、DB 書込、Supabase db push、production/staging 接続・deploy、push** を一切行わない。
- **base**: branch `claude/travel-connect-finish-20260621` @ local main `bcf84157c`。Phase B（localStorage 永続化）採用済み（`69e40e7cc`）。
- **scope**: travel_trips / travel_days / travel_itinerary_items / travel_movement_legs / travel_reservations / location_notes / location_note_saves / location_note_to_itinerary / travel_photos / travel_memories。
- **不変前提**: `flags.ts`（UX-3 gate `NEXT_PUBLIC_PLAN_TRAVEL_DAY_DETAIL_ENABLED` default OFF）/ `CalendarTab.tsx` 実装 / Travel UI 実装 はいずれも本書で変更しない。

> 以下の DDL/SQL は **設計表現（未適用）**。実行・ファイル化は Phase D（local dry-run）以降、ゲート通過後にのみ検討する。

---

## 1. テーブル案

### 共通規約
- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`（所有者）。**全テーブル（join/トグル系含む）に必須**＝RLS owner-only の前提。各テーブル案にも明示する（C-1 改訂）。
- `created_at timestamptz not null default now()` / `updated_at timestamptz not null default now()`（trigger で自動更新）
- **soft delete**: ユーザー実体（trips/days/itinerary_items/reservations/location_notes/photos/memories）は `deleted_at timestamptz`（同期・取り消し対応）。**join/トグル系（saves / note_to_itinerary / movement_legs）は hard delete**（状態がトグルで自明・履歴不要）。
- 全テーブル **RLS 有効**（§2）。

### 1.1 `travel_trips`（Trip 正本）
| col | type | 備考 |
|---|---|---|
| id / user_id | uuid | 共通 |
| title | text not null | 京都 2泊3日 |
| destination_label | text | 京都 |
| start_date / end_date | date not null | 旅行日判定の核 |
| party_size | int not null default 1 | |
| status | text not null default 'planned' | planned/active/archived |
| created_at/updated_at/deleted_at | | soft delete |
- PK: id。FK: user_id。
- index: `(user_id, start_date desc)`, `(user_id, status)`。
- `date_range_label` は **保存しない**（表示時に start/end から整形）。

### 1.2 `travel_days`（TripDay 正本）
| col | type | 備考 |
|---|---|---|
| id | uuid pk | 共通 |
| user_id | uuid not null references auth.users(id) on delete cascade | RLS owner-only |
| trip_id | uuid not null references travel_trips(id) on delete cascade | |
| date | date not null | |
| day_index | int not null | 1.. |
| weekday_label / month_day_label | text | 表示用（保存 or 整形いずれか・整形推奨） |
| theme / theme_subtitle | text | |
| weather | jsonb | {icon,tempMax,tempMin,current} |
| hero_photo_id | uuid references travel_photos(id) on delete set null | nullable |
| walking | jsonb | {steps, distanceKm} |
- **unique: `(trip_id, date)`**（C-1 改訂）。`(user_id, date)` は採らない＝**同一ユーザーが同じ日に複数 trip を持つケースを潰さない**（出張＋私的旅行の重複日など）。1日1旅行に制限する場合は別途 `unique(user_id, date)` を**明示的な制約として**追加するが、**現時点は複数 trip 許容（より安全）**を既定とする。
- index: `(trip_id, day_index)`, `(user_id, date)`（Calendar lookup 用・非 unique）。
- **Calendar lookup / primary day 選択**: Calendar は `user_id + date` で **候補 day を複数取得し得る**前提とし、`getTravelDayForDate(userId, date)` が **primary day を 1 件選ぶ**（選択規則の既定: ① `trip.status='active'` を優先 → ② `trip.start_date` 昇順 → ③ `created_at` 昇順 の安定順）。候補 0 件 → null（通常日）。将来「その日の複数旅行」を見せる UI が要れば候補配列も返せる拡張余地を残す。
- **day_phase（before/during/after）は保存しない**＝読み取り時に `date` と today から導出。

### 1.3 `travel_itinerary_items`（ScheduleItem 正本）
| col | type | 備考 |
|---|---|---|
| id | uuid pk | 共通 |
| user_id | uuid not null references auth.users(id) on delete cascade | RLS owner-only |
| day_id | uuid not null references travel_days(id) on delete cascade | |
| start_time / end_time | text | 空=時刻未定枠 |
| name | text not null | |
| subtitle / description / address | text | |
| categories | text[] | |
| duration_min | int | |
| photo_id | uuid references travel_photos(id) on delete set null | |
| coords | jsonb | {lat,lng} |
| reservation_id | uuid references travel_reservations(id) on delete set null | |
| transport_to_next | jsonb | TransportLeg |
| sort_order | int not null default 0 | |
| source_kind | text not null default 'user_added' | fixture/user_added/imported |
| source_location_note_id | uuid references location_notes(id) on delete set null | 「旅程に追加」元 |
- index: `(day_id, sort_order)`。
- unique（重複追加ガード = Phase B `hasAdded` の DB 版）: `(day_id, source_location_note_id)` where `source_location_note_id is not null`（partial unique）。

### 1.4 `travel_movement_legs`（MoveLeg 正本・hard delete）
| col | type | 備考 |
|---|---|---|
| id | uuid pk | 共通 |
| user_id | uuid not null references auth.users(id) on delete cascade | **RLS owner-only に必須（hard delete でも明示）** |
| day_id | uuid not null references travel_days(id) on delete cascade | |
| time | text | |
| endpoint_kind | text | depart/arrive |
| name / sub | text | |
| mode / mode_label | text | |
| duration_text / distance_text / fare_text | text | |
| is_destination | bool default false | |
| sort_order | int not null default 0 | |
- index: `(day_id, sort_order)`。soft delete なし。

### 1.5 `travel_reservations`（Reservation 正本）
| col | type | 備考 |
|---|---|---|
| id | uuid pk | 共通 |
| user_id | uuid not null references auth.users(id) on delete cascade | RLS owner-only |
| trip_id | uuid not null references travel_trips(id) on delete cascade | |
| day_id | uuid references travel_days(id) on delete set null | nullable |
| category | text not null | 宿泊/食事/交通/体験 |
| name / status / confirmation_code / time_label / address / phone | text | |
| changeable / needs_action | bool | 4-stat 集計 |
| tags | jsonb | [{label,tone}] |
| transit_from/transit_to/transit_depart/transit_arrive/seat | text | 交通 |
| check_in/check_out | text | 宿泊 |
| party_size | int | |
| actions | jsonb | [{kind,label,emphasis,url?}]（url は提供時のみ＝捏造リンク禁止） |
| coords | jsonb | |
| photo_id | uuid references travel_photos(id) on delete set null | |
- index: `(trip_id)`, `(user_id, status)`, `(day_id)`。soft delete 有。

### 1.6 `location_notes`（LocationItem 正本）
| col | type | 備考 |
|---|---|---|
| id | uuid pk | 共通 |
| user_id | uuid not null references auth.users(id) on delete cascade | 投稿者＝所有者・RLS owner-only |
| kind | text not null | trip/spot |
| prefecture | text not null | |
| title / area_label / description / genre / hours / price_level | text | |
| classification | text not null | classic/hidden/standard |
| contributor_type | text not null default 'self' | **投稿者属性**: local（地元民）/ traveler（旅行者）/ self（自分）（C-1 分離） |
| source_type | text not null default 'self_memo' | **情報由来**: self_memo / firsthand（現地体験）/ book / sns / search（C-1 分離・§2.2） |
| author | jsonb | {name, roleLabel}（表示名・肩書。属性は contributor_type が正本） |
| theme_keys / tags / stops / match_reasons | text[] | |
| rating | numeric(2,1) default 0 / rating_count int default 0 | |
| duration_label / tagline / why_special / why_hidden | text | |
| spot_count / match_pct | int | |
| photo_id | uuid references travel_photos(id) on delete set null | |
| status | text not null default 'private' | draft/private/published/hidden/reported（§2） |
| moderation_status | text not null default 'none' | none/pending/approved/rejected |
| report_count | int not null default 0 | |
| created_at/updated_at/deleted_at | | soft delete |
- index: `(user_id, status)`, `(prefecture, status)`, `(status, moderation_status)`（公開 feed）, GIN `theme_keys`, GIN `tags`。将来 `title/description` の Postgres FTS（tsvector 生成列＋GIN）。
- check: `source_type = 'self_memo'` の行は `status in ('draft','private')`（自分メモは公開不可）。

### 1.7 `location_note_saves`（保存/heart・hard delete）
- cols: id, user_id, `location_note_id uuid not null references location_notes(id) on delete cascade`, created_at。
- unique: `(user_id, location_note_id)`（トグル）。index 兼用。

### 1.8 `location_note_to_itinerary`（ノート→旅程 追加履歴・hard delete）
- cols: id, user_id, `location_note_id` FK, `itinerary_item_id uuid references travel_itinerary_items(id) on delete cascade`, `day_id uuid references travel_days(id) on delete cascade`, created_at。
- unique: `(user_id, location_note_id, day_id)`（重複追加ガード）。

### 1.9 `travel_photos`（TravelPhoto 正本）
| col | type | 備考 |
|---|---|---|
| id | uuid pk | 共通 |
| user_id | uuid not null references auth.users(id) on delete cascade | RLS owner-only |
| source | text not null | auto/user/placeholder（既存 enum） |
| storage_path | text | Supabase Storage（user アップロード時） |
| url | text | 外部/署名URL |
| label / caption / tone | text | |
| captured_at | timestamptz | 撮影時刻候補（§5） |
| coords | jsonb | 位置候補（§5・機微） |
| linked_kind | text | day_hero/itinerary/reservation/memory/note |
| linked_id | uuid | 緩い参照（多態のため FK は張らない・整合は app 側） |
- index: `(user_id, linked_kind, linked_id)`, `(user_id, captured_at)`。
- binary は **Supabase Storage（owner-only バケット）**。`placeholder` は path/url なし＝blank/サンプル維持。soft delete 有。

### 1.10 `travel_memories`（MemoriesNote＋旅行後）
| col | type | 備考 |
|---|---|---|
| id | uuid pk | 共通 |
| user_id | uuid not null references auth.users(id) on delete cascade | RLS owner-only |
| trip_id | uuid references travel_trips(id) on delete cascade | |
| day_id | uuid references travel_days(id) on delete set null | nullable |
| text | text | |
| photo_ids | uuid[] | travel_photos 参照（配列・app 整合） |
| summary | text | 旅行後 AI 要約（任意） |
| highlights / next_learnings | jsonb | |
| phase | text not null default 'after' | before/during/after |
| origin_synced | bool not null default false | Origin/Memory 反映ハンドオフ（実装は対象外） |
- index: `(user_id, trip_id)`, `(day_id)`。soft delete 有。

---

## 2. RLS 案

### 2.1 private データ（trips/days/itinerary_items/movement_legs/reservations/photos/memories/saves/note_to_itinerary）
**owner-only**（house 規約・例 `supabase/migrations/20260611130000_create_lifeops_structured_sources.sql`）:
```sql
alter table <t> enable row level security;
create policy <t>_owner_select on <t> for select using (auth.uid() = user_id);
create policy <t>_owner_insert on <t> for insert with check (auth.uid() = user_id);
create policy <t>_owner_update on <t> for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy <t>_owner_delete on <t> for delete using (auth.uid() = user_id);
```
service_role 非前提・cross-user 不可。

### 2.2 location_notes（private＋将来 public/shared）
- **書込（insert/update/delete）**: owner-only（`auth.uid() = user_id`）。
- **読込（select）**: `auth.uid() = user_id`（自分の全 status）**OR** 公開可視（`status = 'published' AND moderation_status = 'approved' AND deleted_at is null`）。
  ```sql
  create policy location_notes_read on location_notes for select using (
    auth.uid() = user_id
    OR (status = 'published' AND moderation_status = 'approved' AND deleted_at is null)
  );
  ```
  → これが**唯一の非 owner-only 読取経路**。Match/王道/穴場 等で他者ノートを見せる公開 feed の土台。
- **解禁ゲート（C-1 明確化）**:
  - **Phase D（local dry-run）**: 上記 select policy を**書く・テストするのみ**（他者の private/draft が読めないこと／published+approved だけが cross-user で見えることを local Supabase で検証）。**実 published 行は作らない**（テストフィクスチャを除き、production 相当の公開データは生成しない）。
  - **Phase G（共有解禁）**: published を実際に生成し公開 feed を有効化。moderation/report/公開 feed UI もこのゲート。**それまでは実質 private のみ**で運用。
- 投稿者属性 / 情報由来 の扱い（C-1 分離・いずれも **security ではなく表示/ランキング用メタ**）:
  - **`contributor_type`（投稿者属性）**: local（地元民）/ traveler（旅行者）/ self（自分）。誰の視点かを表示（地元民バッジ等）。RLS は user_id でのみ判定し、contributor_type は権限に**関与しない**。
  - **`source_type`（情報由来）**: self_memo / firsthand / book / sns / search。出典の信頼差は §7（表示/ランキング）で扱う。
  - status × source_type: `draft`=編集中・本人のみ／`private`=確定・本人のみ（既定）／`published`=moderation approved で公開可視／`hidden`=本人が非表示／`reported`=通報され公開停止（select は owner のみ・審査対象）。
  - `self_memo`: check 制約で published 不可（自分メモは常に owner-only）。Phase D 最小は **private / self_memo＋contributor self|local|traveler** に閉じ、`book/sns/search` 由来・published は Phase G 以降。

### 2.3 save / itinerary add の権限
- `location_note_saves` / `location_note_to_itinerary` は **owner-only**（自分の保存・追加履歴）。
- 「読める note なら保存/追加できる」: 対象 note が **自分の note** か **published+approved** であることを app 層で確認（RLS の select 可視性と一致）。他者の private/draft は読めない＝保存対象にならない。
- 集計（rating_count 等）の他者ノート更新は将来 RPC（SECURITY DEFINER・限定）で実装し、直接 update は owner-only を維持。

---

## 3. API / Provider 差し替え案

### 3.1 現状（Phase B）
- `ItineraryContext`（added）/ `LocationNotesScreen`（savedIds, userItems）は `_lib/travel/travelLocalStore.ts`（localStorage）で restore + persist。公開 hook/props は不変。

### 3.2 Supabase-backed への差し替え（公開シグネチャ不変）
- **Repository インターフェース**（UI 非依存・`lib/shared` 流儀）を導入し、実装を差し替える:
  - `InMemoryRepo`（最初期）→ `LocalStorageRepo`（Phase B・現状）→ `SupabaseRepo`（Phase D/E）。
  - `useTravelItinerary` / `useMergedSchedule` / `viewProps` の**型・シグネチャは不変＝消費側ゼロ改修**。
- **Phase B（localStorage）との関係**: localStorage は **オフラインキャッシュ＋楽観層**に格上げ。Supabase = source of truth。
  - load: Supabase（react-query 等）→ 成功でキャッシュ更新。**オフライン/失敗時は localStorage キャッシュにフォールバック**（Phase B 挙動）。
  - keys: Phase B の `aneurasync.travel.*.v1` を引き続きキャッシュとして使用（スキーマ互換）。
- **optimistic update / rollback**:
  - 追加/保存/投稿: ①UI＋キャッシュを即時更新（現体感維持）→ ②Supabase mutation → ③失敗で rollback＋`onToast(info)`＋**pending queue** に退避（オフライン再送）。
  - 重複は DB unique 制約（§1）＋クライアント `hasAdded` の二重ガード。
- **offline / fail-soft**: Supabase 到達不可でも localStorage キャッシュで操作継続→オンライン復帰時に pending queue を flush。`travelLocalStore` の try/catch fail-soft は維持。
- **id 整合**: ローカル発行 `user-<ts>` → Supabase uuid へ sync 時に置換。`location_note_to_itinerary` 等は sourceId 基準で再リンク。

---

## 4. Calendar 実データ接続案（既存 CalendarTab 導線の実データ化）

> 方針: **新規に繋ぐのではなく、既にある `CalendarTab.tsx` の導線を実データ化**する。導線・overlay・gate は維持。

### 4.1 現状（不変・参照のみ）
`app/(culcept)/plan/tabs/CalendarTab.tsx`:
- `travelTripDay = useMemo(() => { if (!isTravelDayDetailEnabled()) return null; if (selectedDate < SAMPLE_KYOTO_TRIP.startDate || selectedDate > SAMPLE_KYOTO_TRIP.endDate) return null; return getSampleTripDay(selectedDate); }, [selectedDate])`
- 旅行日のみ「旅の詳細を見る」ボタン表示 → `{travelOpen && travelTripDay && <TravelDayDetail trip day onClose />}`。
- flag OFF or 旅行日でない → `travelTripDay=null` → ボタン非表示＝**既存 CalendarTab 完全不変**。

### 4.2 実データ化の設計（最小差分・将来）
**`travelTripDay` useMemo の本体のみ差し替え**（gate・overlay・`{trip, day}` 形は不変）:
```
travelTripDay = useMemo(() => {
  if (!isTravelDayDetailEnabled()) return null;            // ← UX-3 gate 維持（不変）
  return getTravelDayForDate(userId, selectedDate);         // ← fixture を実データ lookup に差し替え
}, [userId, selectedDate]);                                  // {trip, day} | null
```
- `getTravelDayForDate(userId, date)`: `travel_days`（`(user_id, date)` index・**非 unique**＝同一日に複数 trip 可）＋親 `travel_trips` を合成し、§1.2 の **primary day 選択規則**（① `trip.status='active'` → ② `start_date` 昇順 → ③ `created_at` 昇順）で **1 件**に確定して `{trip, day} | null` を返す DataSource。複数旅行を見せる UI が要れば候補配列版を追加（§1.2）。
- **旅行データがない日 → null → Travel UI を出さない**（現在の通常日と同一・退行ゼロ）。
- **旅行データがある日だけ TravelDayDetail を開く**（現挙動と同型）。

### 4.3 通常日 / 旅行日 / 旅行後 Memory day の判定
- `getTravelDayForDate` が **null** → **通常日**（Travel UI なし）。
- 非 null かつ `dayPhase(date, today) ∈ {before, during}` → **旅行日** → Concierge Dashboard（現 `TravelDayDetail`）。
- 非 null かつ `dayPhase = after` かつ `travel_memories` あり → **旅行後 Memory day** → **Memory Detail**（Phase F で実装。Dashboard 資産流用）。after かつ memory 無し → 当面 Dashboard（回想は空）。
- `dayPhase` = trip 期間と today の比較（read 時導出・DB 非保存）。

### 4.4 UX-3 gate 維持（実データ接続後も dormant）
- `isTravelDayDetailEnabled()`（`NEXT_PUBLIC_PLAN_TRAVEL_DAY_DETAIL_ENABLED` default OFF）は **第一ガードとして不変**。実データが DB にあっても **flag OFF なら一切表示しない**（dormant 維持）。本番表示は別 GO。
- **fixture / real 混線の防止**: flag ON ∧ 実データ無し時の `getSampleTripDay` フォールバックは **dev 限定**（`process.env.NODE_ENV !== "production"` 等）に閉じ、production は実データのみ。`source_kind='fixture'` で由来を明示。

---

## 5. 写真設計（Phase F まで未実装・blank 維持）

`travel_photos` ＋ Supabase Storage（owner-only バケット）。`TravelPhoto.source`(auto/user/placeholder) と `captured_at`/`coords` は既存型にあり、段階導入は型変更不要。
1. **手動アップロード**（最初）: PhotoSlot「＋写真を追加」→ Storage → `travel_photos(source=user, storage_path)`。Phase B の objectURL は `normalizePhotoForStore` で placeholder 化 → ここで実アップロードに差し替え。
2. **撮影時刻ベース候補**: 許可のうえ `captured_at` を旅程時刻帯と突合し**候補提示**（自動挿入しない）。
3. **位置情報許可ベース候補**: `coords` 近接で精度向上（§7 機微・要許可）。
4. **自動挿入**（最後）: 高信頼候補のみ `source=auto` の**下書き**として挿入・ユーザー確定/差替可。
5. **blank / no-photo 維持**: 候補無しは無理に埋めず「＋写真を追加」。placeholder は「サンプル」印で実写真と区別（honesty）。

---

## 6. migration 方針

- **今回（Phase C）は migration ファイルを作らない**。本書の DDL は設計表現（未適用）。
- **Phase D（local dry-run）に進む条件**:
  1. 本 schema/RLS 設計の CEO 承認
  2. owner-only RLS（§2）＋ location_notes 公開 select policy の設計承認
  3. **ローカル Supabase のみ**（`supabase start`）で適用・検証する合意（remote 非対象）
  4. 明示 GO
- **staging / production へ絶対に apply しない条件（C/D 共通の禁止）**:
  - `supabase db push` / remote migration を **実行しない**。
  - Phase D は `supabase start`（local）に閉じる。remote へ向く db コマンドは CEO 明示承認＋backup＋link 二重確認ゲートが別途必要（本フェーズ対象外）。
- **Supabase linked ref の確認手順（db 操作前に必ず・read-only）**:
  - `supabase projects list` / `supabase status` / `cat supabase/.temp/project-ref`（存在時）で **現 link 先を確認**。
  - メモリ警告: CLI が過去 production `aljavfujeqcwnqryjmhl` に link していた事故源あり（staging=`hjcrvndumgiovyfdacwc`）。**db 操作前に staging/local を二重確認**。Phase D は local のみのため remote link に依存しないが、確認は必須。

---

## 7. リスク

| リスク | 内容 | 緩和 |
|---|---|---|
| privacy | 旅程/予約/写真/位置は機微 | 全 private テーブル owner-only RLS。位置/写真は明示許可 |
| photo metadata | `captured_at`/`coords` で時刻・位置が漏れうる | owner-only＋取得は都度許可（§5）。placeholder は metadata 持たない |
| public 投稿 moderation | published ノートの不適切投稿 | 既定 private。published は `moderation_status='approved'` 必須（§2.2）。Phase G まで published 作らない |
| source trust | 出典信頼差（SNS/本/地元民/自分メモ） | `source_type` は**表示/ランキング用メタ（非 security）**。self_memo は published 不可（check 制約） |
| spam / report | 公開後の濫用 | `report_count`＋`reported` status＋将来 rate limit/RPC。reported は公開停止 |
| RLS leakage | 公開 select policy が唯一の cross-user 経路 | published+approved+未削除のみ許可。Phase D で policy テスト（他人の private/draft が読めないことを検証） |
| fixture / real 混線 | dev fixture が本番に出る | fixture フォールバックは dev 限定（§4.4）。`source_kind='fixture'` 明示。production は実データのみ |
| localStorage → DB 整合 | Phase B キャッシュと DB の不一致 | キー互換維持。初回 Supabase load 時に local pending を reconcile（sourceId 基準）。local `user-<ts>` → server uuid 置換 |

### ゲート（再掲）
- **G-D（Phase D 進入）**: 本書承認＋RLS 承認＋local-only 合意＋明示 GO。
- **G-REMOTE（絶対条件）**: staging/production への apply は本フェーズ群では禁止。実施時は CEO 明示承認＋link 二重確認＋backup（別決裁）。

---

## 8. 付録 — 参照
- Phase B: `app/(culcept)/calendar/_lib/travel/travelLocalStore.ts`（`69e40e7cc`）
- 既存 RLS 規約: `supabase/migrations/20260611130000_create_lifeops_structured_sources.sql`
- 接続全体計画: `docs/final-aneurasync-travel-location-notes-connection-plan.md`
- 既存 CalendarTab 導線（不変・参照）: `app/(culcept)/plan/tabs/CalendarTab.tsx`（`travelTripDay` useMemo / TravelDayDetail overlay）
- 関連メモリ: `project_travel-concierge-preview`, `project_shared-style-domain`, `project_github-suspended-local-only`（DB drift / CLI link 警告含む）
