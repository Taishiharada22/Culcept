# Rendezvous 実装タスク分解 (C)

## 実装済み

### DB / Schema
- [x] `supabase/migrations/20260308100000_rendezvous.sql` — 全11テーブル + RLS + トリガー + インデックス

### Scoring Logic (`lib/rendezvous/`)
- [x] `types.ts` — 全型定義（DB行型、DTO型、Enum型、評価型）
- [x] `similarityScore.ts` — similarity / complement / mixed スコア関数
- [x] `categoryWeights.ts` — カテゴリ別重み定義
- [x] `categoryAffinity.ts` — カテゴリ適性計算
- [x] `thresholds.ts` — 閾値 + isMutual + カテゴリ別Guard
- [x] `buildReasons.ts` — Reason/Caution収集 + テキストマッピング
- [x] `buildLabel.ts` — ラベル生成 + overallScore + syncPercent
- [x] `evaluateDirection.ts` — A→B一方向評価
- [x] `evaluate.ts` — evaluatePair（ペア全体評価）
- [x] `serializer.ts` — DB行 → カードDTO / 詳細DTO変換
- [x] `index.ts` — 統合エクスポート

---

## Phase 1: API Routes（優先順位順）

### 1-1. Settings / Opt-in
- [ ] `app/api/rendezvous/settings/route.ts` — GET/POST 参加設定
- [ ] `app/api/rendezvous/opt-in/route.ts` — POST 初回参加（profiles + preferences 初期作成）
- [ ] `app/api/rendezvous/opt-out/route.ts` — POST 完全停止

### 1-2. Feed / List / Detail
- [ ] `app/api/rendezvous/feed/route.ts` — GET Home用feed（limit=3、summary付き）
- [ ] `app/api/rendezvous/list/route.ts` — GET 一覧（tab=new|waiting|saved|conversations、cursor pagination）
- [ ] `app/api/rendezvous/[candidateId]/route.ts` — GET 詳細（unseen→seen自動更新）

### 1-3. Actions
- [ ] `app/api/rendezvous/[candidateId]/like/route.ts` — POST Like（transaction: mutual check → chat生成）
- [ ] `app/api/rendezvous/[candidateId]/pass/route.ts` — POST 見送り（suppression 30日）
- [ ] `app/api/rendezvous/[candidateId]/save/route.ts` — POST 保留
- [ ] `app/api/rendezvous/[candidateId]/block/route.ts` — POST ブロック
- [ ] `app/api/rendezvous/[candidateId]/report/route.ts` — POST 通報

### 1-4. Conversations
- [ ] `app/api/rendezvous/conversations/route.ts` — GET 会話一覧

### 1-5. Internal Jobs
- [ ] `app/api/internal/rendezvous/encounters/process/route.ts` — POST encounter処理→候補生成
- [ ] `app/api/internal/rendezvous/notifications/dispatch/route.ts` — POST 遅延通知送信
- [ ] `app/api/internal/rendezvous/candidates/expire/route.ts` — POST 期限切れ処理

---

## Phase 2: フロント実装

### 2-1. 画面ルーティング
- [ ] `app/rendezvous/page.tsx` — 一覧画面（Server Component → Client）
- [ ] `app/rendezvous/[candidateId]/page.tsx` — 詳細画面
- [ ] `app/rendezvous/settings/page.tsx` — 設定画面

### 2-2. Home Rendezvousセクション
- [ ] `components/rendezvous/RendezvousHomeSection.tsx` — feed取得 + main/sub分配
- [ ] `components/rendezvous/RendezvousSectionHeader.tsx` — セクションヘッダー
- [ ] `components/rendezvous/RendezvousMainCard.tsx` — メイン候補カード
- [ ] `components/rendezvous/RendezvousMiniCard.tsx` — サブ候補カード
- [ ] HomePageClientNew.tsx にRendezvousセクション追加

### 2-3. 共通部品
- [ ] `components/rendezvous/RendezvousStateBadge.tsx` — 状態バッジ（New/応答待ち/保留中等）
- [ ] `components/rendezvous/RendezvousSyncRing.tsx` — SYNC%リング表示
- [ ] `components/rendezvous/RendezvousReasonList.tsx` — 理由リスト表示
- [ ] `components/rendezvous/RendezvousCautionText.tsx` — 注意点表示
- [ ] `components/rendezvous/RendezvousEmptyState.tsx` — タブ別空状態
- [ ] `components/rendezvous/RendezvousErrorState.tsx` — エラー状態

### 2-4. 一覧画面
- [ ] `components/rendezvous/RendezvousListTabs.tsx` — タブ切替（新しい交差/応答待ち/保留中/会話）
- [ ] `components/rendezvous/RendezvousListView.tsx` — 一覧表示
- [ ] `components/rendezvous/RendezvousListItem.tsx` — 一覧アイテム

### 2-5. 詳細画面
- [ ] `components/rendezvous/RendezvousDetailHero.tsx` — ヒーロー（アバター/名前/SYNC/ラベル）
- [ ] `components/rendezvous/RendezvousDetailActions.tsx` — アクション（Like/見送る/あとで考える）

### 2-6. 双Like後
- [ ] `components/rendezvous/RendezvousConversationPrompt.tsx` — 接続成立中間画面

### 2-7. 設定画面
- [ ] `components/rendezvous/RendezvousSettingsForm.tsx` — 設定フォーム

---

## Phase 3: 安全・運用

- [ ] Block/Report の管理レビュー導線（admin page）
- [ ] Suppression cleanup cron
- [ ] Analytics: delivered/opened/liked/mutual/report rate tracking
- [ ] Reminder通知（candidate当たり最大1回）

---

## 実装順序ガイド

```
1. DB migration 適用
2. lib/rendezvous/ のunit test作成
3. settings/opt-in API
4. encounter process internal API
5. notification dispatch internal API
6. feed API → RendezvousHomeSection
7. list API → 一覧画面
8. detail API → 詳細画面
9. like/pass/save API → DetailActions
10. mutual_like → chat生成
11. block/report API
12. expire job
13. 設定画面
14. HomePageClientNewへの統合
```
