# CoAlter Travel — 本番接続 runbook（#2 実 entity / #9 実 session・flag-on・partner 実読み）

**目的**: 本番接続前に実装した personalization→plan 核（S2〜S4-1 / C6-A〜D / P1〜P4）を、
**実際のユーザー資産・実 entity に繋ぐ手順**を明確に記録する。各項目は **CEO 承認 + 外部 API/DB の安全ゲート**を伴う。

> 現状の到達点（2026-06-23・全て flag OFF・demo fixture・書込ゼロ）:
> - 行程の **形**（pace/疲労/同行/予算/詰め込み上限）と **場所選択**（性格 fit）がペアで変わる。
> - 当日の備え（事前分岐）・予約直前リンク（Maps/safe）・前回からの学び（後悔→次回制約）が live demo で動く。
> - downstream pipeline は **実 PersonalizationSnapshot 対応済み**（C6-B/C/D が pure で証明）。

---

## 監査表の最終状態（本 runbook が埋める残り）

| # | 行 | 状態 | 残り（本 runbook） |
|---|---|---|---|
| 1 | 個人理解 M2→plan | 🔺 swap seam ○ | #9: 実 self fetch 配線 |
| 2 | 実 entity スコア | 🔺 | **#2: 実 entity 源**（外部 API・CEO 承認） |
| 5 | M3 予約直前 | 🔺 Maps 導線○ | readiness 状態機械（skeleton・任意） |
| 6 | M4 当日適応 | ○ solver ネイティブ | 実天気での自動切替（#9） |
| 8 | M6 後悔台帳 | 🔺 demo ループ○ | **#9: 永続化**（DB write・CEO 承認） |
| 9 | 実 session/flag-on | 🟧 | **#9: 本番経路全般** |
| 4 | entity 24軸 | 🔺 adequate | 実 entity 後に拡張（#2 依存） |

---

## #2 — 実 entity 源（demo seeds → Web Search/Places 正規化 seed）

**現状の swap 対象**:
- `app/(culcept)/plan/tabs/coalter/coalterTravelSeedFixture.ts` … `COALTER_DEMO_TRAVEL_SEEDS`（solver 入力 seed）
- `app/(culcept)/plan/tabs/coalter/coalterTravelEntityCatalog.ts` … `COALTER_DEMO_ENTITIES`（fit 用 TravelObjectState）
- `app/(culcept)/plan/tabs/coalter/coalterTravelSeedFixture.ts` … `COALTER_DEMO_PLACE_LABELS`（表示名 map）

**やること**:
1. 実 entity 源（Web Search / Google Places 等）→ **正規化**して以下に流す:
   - 既存 Provider Foundation（citation + uncertainty・movie 実績）で entity を抽出。
   - `TravelObjectState`（fit 用・SHARED_TRAIT_AXES + burden + roleAffinity）+ solver `seed`（destination/experience/lodging/move）+ 表示名を生成。
   - `placeIdCode` は opaque（raw place 名でない）を維持。
2. fit catalog と solver seed の **place universe を一致**させる（C6-D の前提）。
3. 実 entity が入れば **24軸拡充（#4）**も正当化される（trait coverage を上げる）。

**安全（CEO 承認 + 規約）**:
- 外部 API（Places/Routes/Booking affiliate/楽天新 API）は**全て CEO 承認 + API キー発行**案件。
- **スクレイピング禁止**。安全順: Google Maps / 公式サイト / OTA 検索 URL / 提携 API / affiliate link。
- 楽天旧 API は 2026-05-14 停止済み（新 API を使う）。価格/空室/キャンセル条件は**断定しない**（confidence 付き）。

---

## #9 — 実 session / flag-on / partner 実読み / 永続化

### 9-1. flag-on（live 経路を出す）
- `NEXT_PUBLIC_PLAN_COALTER_ENGINE_LIVE`（route の 404 gate・client tab 分岐）。本番点火は CEO 判断。
- 点火前に scope 確定（どの画面/route を core に）+ privacy/RLS/consent 監査。

### 9-2. M2 実 self 読み（#1 の実 fetch）
- **swap 点**: `app/api/plan/coalter/intelligence/route.ts` の `const realSelf = null;`（コメント明記）。
- 手順:
  1. flag `PLAN_COALTER_PERSONALIZATION_REAL_READ`（既定 off・P4 で追加済み）を gate に。
  2. `supabaseServer()`（**user-RLS**・service_role 禁止）で `auth.getUser()` → viewer userId。
  3. `getPersonalizationSnapshot(client, userId, asOf)`（`lib/shared/personalization/snapshotReader.ts`・read-only）で実 self。
  4. `resolveCoAlterPersonalizationPair(mode, { realSelf })` に渡すだけで全 downstream が実軸で動く。
- staging は軸なし → null → demo fallback（挙動不変）。consent ゲート（観測 read の同意）を併用。

### 9-3. partner 実読み（M2-B）
- 相手の snapshot は **RLS で読めない**（`PairPersonalizationContext.partnerSnapshot: null`・M2-B 設計凍結）。
- 必要なら **pair consent + RLS 設計**（相手が共有を許可した範囲のみ）を別途 CEO 承認で設計。
- それまで partner は demo 固定（resolver がそうする）。

### 9-4. M6 後悔台帳の永続化（#8 の write 側）
- 現状 read-only（demo 台帳）。実運用は旅行後の振り返りを **DB に書く**（`coalter_*` regret table）。
- **DB write = CEO 承認 + migration + RLS + staging 検証 + backup** ゲート必須。author/owner を RLS で限定。

### 9-5. M4 実天気 / 当日リアルタイム
- 現状は事前分岐（solver ネイティブ・実天気なし）。実天気での自動切替は外部 API（CEO 承認）。
- 設計方針: 監視員でなく「適切な瞬間だけ現れる執事」＝事前計算分岐 + checkpoint（朝ブリーフィング/1タップ疲労/雨トリガ）。

### 9-6. readiness 状態機械（#5 残り・任意）
- `readiness-core` / `contingency-core` は skeleton engine 世界（DecisionResult/ProposalComparison 入力）。
- live solver に繋ぐには cross-world adapter が要る（solver candidate → DecisionResult）。価値対コストを #2 後に再評価。

---

## 接続順（推奨）
1. **#9-2 M2 実 self 読み**（swap 点が整備済み・最小で「実データで動く」を実証）
2. **#2 実 entity 源**（外部 API・CEO 承認）→ 行程の場所が実在に → #4 24軸拡充
3. **#9-4 後悔台帳 永続化**（DB write・CEO 承認）
4. **#9-3 partner 実読み**（M2-B RLS 設計・CEO 承認）
5. **#9-5 実天気 / #9-6 readiness**（任意・価値次第）

各ステップは flag 裏で段階点火。production 反映・課金・法務・外部連携・一斉通知は **CEO 承認案件**（CLAUDE.md Operating Rules）。
