# Rendezvous 完全実装指示書 (A)
# Claude Code / Codex 用

## 機能概要

**Rendezvous** は、分身同士が先に出会い、相互成立した接続だけを本人に届けるアバター先行型接続機能。
ユーザーが候補一覧から探すのではなく、裏側で分身同士が評価し、双方向で条件が成立した場合のみ Home に表示する。

---

## 絶対禁止事項

実装時に以下は **絶対にやらない**：

1. 不成立候補をUIに出さない
2. 片想い状態をUIに出さない（一方Likeの事実を相手に見せない）
3. 正確な位置・距離・分単位の時刻を出さない
4. encounter_events をクライアントへ露出しない
5. 相手側 user_state を返さない
6. 内部スコア（a_to_b_score, b_to_a_score）の生値を返さない
7. 即時通知をデフォルトにしない（遅延通知が基本）
8. 候補一覧型の無限スワイプUIにしない

---

## 技術スタック

- Next.js 15 App Router (Server Components + Client Components)
- Supabase (PostgreSQL + RLS + Auth)
- Tailwind CSS 4 + Framer Motion
- GlassCard, GlassBadge, GlassButton from `components/ui/glassmorphism-design.tsx`
- Route Handlers for API
- supabaseServer() for user-scoped queries
- supabaseAdmin for internal job operations

---

## 1. DB Schema

Migration: `supabase/migrations/20260308100000_rendezvous.sql`

### テーブル一覧（11テーブル）

| テーブル | 責務 |
|---------|------|
| rendezvous_profiles | 参加設定（enabled, categories, avatar, notification） |
| rendezvous_preferences | 求める方向性 + matching_vector (JSONB, 10軸 0..1) |
| encounter_events | 接触トリガー（内部用、UIに非公開） |
| rendezvous_candidates | 相互成立候補（scores, reasons, cautions, state） |
| rendezvous_user_states | ユーザー視点状態（unseen/seen/liked/passed/saved） |
| rendezvous_chats | 双Like後チャットスレッド対応 |
| rendezvous_blocks | 完全ブロック |
| rendezvous_reports | 通報履歴 |
| rendezvous_suppressions | 再出現抑止（ペア単位、user_low < user_high） |
| rendezvous_notifications | 遅延通知スケジュール |
| rendezvous_candidate_logs | 内部監査ログ |

### 重要なDB設計ルール
- Enum は CHECK 制約で実装（PostgreSQL ENUMは使わない）
- encounter_events, rendezvous_candidates は `user_a < user_b` 制約（正規化キー）
- suppressions も `user_low < user_high` 制約
- RLS: profiles/preferences は自分のみ、candidates は自分が関与するもの、user_states は自分のもののみ
- encounter_events は server only（RLSで全ユーザーブロック）

---

## 2. Scoring Logic

ファイル: `lib/rendezvous/`

### 評価フロー
```
encounter発生
  → profileA/B, preferencesA/B, vectorA/B 取得
  → 共有カテゴリ算出
  → カテゴリごとに evaluateDirection(A→B) + evaluateDirection(B→A)
  → isMutual(scoreAB, scoreBA, category) チェック
  → カテゴリ別Guard チェック
  → 最高カテゴリ選択
  → reason/caution/label 生成
  → candidate 作成
```

### MatchingVector (10軸, 各0..1)
```
conversation_temperature, distance_need, depth_speed,
stability_need, stimulation_need, initiative,
emotional_openness, conflict_directness, social_energy, structure_preference
```

### スコア関数
- `similarityScore(a, b)` = `max(0, 1 - |a - b|)` — 近いほど高
- `complementScore(a, b)` = `max(0, 1 - |(1-a) - b|)` — 補完ほど高
- `mixedFitScore(a, b, pref)` = similarity × (1-pref) + complement × pref

### カテゴリ別閾値
romantic: 0.72, friendship: 0.68, cocreation: 0.70, community: 0.66

### 成立条件
```ts
scoreAB >= threshold && scoreBA >= threshold && passesGuard(category)
```

---

## 3. API Routes

### Auth パターン
```ts
const supabase = await supabaseServer();
const { data: auth } = await supabase.auth.getUser();
if (!auth?.user) {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}
```

### レスポンス形式
```ts
// 成功
return NextResponse.json({ ok: true, ...data });
// エラー
return NextResponse.json({ ok: false, error: "message" }, { status: 4xx });
```

### UI向けAPI

#### GET /api/rendezvous/feed
Home用。delivered_at が入った候補のうち、自分のuser_stateを基に優先順位付けして返す。
- limit=3
- 返す: RendezvousCardDTO[] + summary(newCount, waitingCount, openedConversationCount)
- 返さない: 相手のuser_state, 生スコア, encounter情報

#### GET /api/rendezvous/list?tab=new
一覧用。tab: new(unseen) / waiting(seen+未応答/Like相手待ち) / saved / conversations
- cursor pagination
- 返す: RendezvousCardDTO[] + nextCursor

#### GET /api/rendezvous/[candidateId]
詳細用。開いた時点で unseen → seen に自動更新（冪等）。
- 返す: RendezvousDetailDTO（reasons最大3, cautions最大2, actions）

#### POST /api/rendezvous/[candidateId]/like
**Transaction 必須**:
1. candidate所属確認
2. user_state → liked
3. 相手もliked? → mutual_liked → chat_thread作成 → rendezvous_chats作成 → 通知
4. レスポンス: `{ status: "waiting_for_counterpart" }` or `{ status: "mutual_liked", threadId }`

#### POST /api/rendezvous/[candidateId]/pass
user_state → passed + suppression 30日作成。相手に「見送られた」とは伝えない。

#### POST /api/rendezvous/[candidateId]/save
user_state → saved。保留タブへ移動。

#### POST /api/rendezvous/[candidateId]/block
rendezvous_blocks追加 + 既存候補closed + 再生成禁止。相手にblock事実は非通知。

#### POST /api/rendezvous/[candidateId]/report
rendezvous_reports作成 + 短期suppression + レビュー対象送り。

### Internal Job API（service role / cron token 必須）

#### POST /api/internal/rendezvous/encounters/process
pending encounters をバッチ処理。profile/preferences取得 → eligibility → block/suppression → category交差 → 双方向evaluate → candidate生成 → 通知スケジュール。

#### POST /api/internal/rendezvous/notifications/dispatch
scheduled_for <= now の pending 通知を送信。candidate有効性確認 → push/in-app送信 → delivered_at設定。

#### POST /api/internal/rendezvous/candidates/expire
expires_at < now の候補を expired に。user_statesも expired。

---

## 4. フロント実装

### 画面構成
```
app/rendezvous/page.tsx          — 一覧画面
app/rendezvous/[candidateId]/page.tsx — 詳細画面
app/rendezvous/settings/page.tsx — 設定画面
+ HomePageClientNew.tsx 内 RendezvousHomeSection
```

### コンポーネント（`components/rendezvous/`）

#### RendezvousHomeSection
- /api/rendezvous/feed からデータ取得
- main card 1件 + sub cards 0-2件
- loading / empty / error 分岐
- セクションタイトル: "Rendezvous"
- サブコピー: "あなたの分身が見つけた交差"

#### RendezvousMainCard
カード要素: アバター, 公開名, カテゴリBadge, SYNC%, 関係ラベル, 理由2件, 注意点1件, CTA
CTA文言: unseen→「軌道を見る」, seen→「応答する」, liked→「応答待ち」, mutual→「会話へ」, saved→「続きを見る」

#### RendezvousMiniCard
軽量版: アバター, 名前, カテゴリ, SYNC%, 一言ラベル

#### RendezvousStateBadge
unseen→"New", liked→"応答待ち", saved→"保留中", chat_opened→"Connection Opened", expired→"期限切れ"

#### RendezvousSyncRing
SYNC 84% のリング表示。シンプルなprogress circle + 数値。

#### RendezvousDetailActions
Like/見送る/あとで考える + overflow(ブロック/通報)。
Like成功でmutual_likedなら `/messages/[threadId]` へ遷移。

#### RendezvousConversationPrompt
双Like成立時の中間画面。
「接続が開きました / 分身同士の交差が、現実の会話へ変わりました」
[会話を始める] [あとで開く]

#### RendezvousEmptyState
タブ別文言:
- new: 「まだ新しい交差はありません / 成立した接続だけがここに届きます」
- waiting: 「分身は静かに世界を歩いています」
- saved: 「保留中の接続はありません」
- conversations: 「双Likeが成立すると、ここから会話が始まります」

#### RendezvousSettingsForm
参加ON/OFF, 一時停止, カテゴリ選択, 表示名, アバター, 通知ON/OFF, 遅延モード, publicMoodSummary, publicStyleSummary

### UIで絶対に表示しない
位置, 距離, 分単位時刻, source_event_id, encounter_event, 相手側user_state, 片側Like詳細, 内部スコア生値, 不成立候補, 惜しかった候補

### デザインパターン
- GlassCard + FadeInView でカードを表示
- Framer Motion で hover/tap アニメーション
- ラベル・バッジ・CTAは全て日本語
- responsive: mobile-first, sm/lg breakpoints

---

## 5. 遅延通知設計

- candidate生成後、即時通知しない
- `scheduled_for = created_at + random(delay_min..delay_max minutes)`
- 標準: 180-720分, ゆっくり: 720-1440分
- delivered_at が入るまで Home にも出さない
- ランダム窓で「さっき会った人だ」を推測不可にする

### 通知文言
- 新着: 「あなたの分身が、新しい交差を見つけました」
- 応答待ち: 「ひとつの交差が、まだ開かれずに残っています」
- 双Like: 「接続が開きました。会話を始められます」

---

## 6. 安全設計

### 制御優先順位
1. block（最強、以後一切なし）
2. report + temporary suppression
3. hide forever
4. pass（30日抑止）
5. save / mute

### 重複抑止
- pass後30日、expired後14日、active候補あり中は不可、block/reportは再出現なし
- candidate生成前に rendezvous_candidates(active), rendezvous_suppressions, rendezvous_blocks を必ず確認

### Reminder
- candidate当たり最大1回
- unseen放置 or seen未応答が一定時間継続した場合のみ

---

## 7. 実装順序

```
1. supabase migration 適用 (20260308100000_rendezvous.sql)
2. lib/rendezvous/ のunit test（evaluate, scoring, serializer）
3. settings/opt-in/opt-out API
4. encounter process internal API
5. notification dispatch internal API
6. feed API → RendezvousHomeSection → HomePageClientNew統合
7. list API → 一覧画面（タブ: 新しい交差/応答待ち/保留中/会話）
8. detail API → 詳細画面（unseen→seen自動更新）
9. like/pass/save API → DetailActions
10. mutual_like → chat生成 → ConversationPrompt
11. block/report API
12. expire job
13. 設定画面
14. analytics/tuning
```

---

## 8. テストすべきケース

### Scoring
1. shared category がない → mutual false
2. A→B 高い / B→A 低い → mutual false
3. 両方 threshold 超え → mutual true
4. romantic guard fail → total超えても mutual false
5. reasonCodes が高得点軸から抽出される
6. cautionCodes が低得点軸から抽出される
7. label が category と score に応じて変わる

### API
1. 未認証 → 401
2. 他人のcandidate → 404
3. 既にliked → idempotent 200
4. expired candidate → 422
5. 双Like → mutual_liked + threadId返却
6. block後 → 候補closed + 再生成なし
7. feed → delivered_at済みのみ返却
8. detail open → unseen→seen自動更新

### Safety
1. 片側Like → 相手に何も見えない
2. pass → 30日suppression
3. block → 双方向から候補消失
4. 同一ペア → 重複候補なし
