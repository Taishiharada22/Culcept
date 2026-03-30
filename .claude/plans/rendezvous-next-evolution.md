# Rendezvous 200% — 分身誕生プロセス＋究極の6機能

## Phase A: 分身誕生プロセス（本人確認リデザイン）

### A1. DB & Storage
- `rendezvous_profiles` に追加:
  - `verification_status` text ('none'|'pending'|'approved'|'rejected') default 'none'
  - `verification_submitted_at` timestamptz
  - `verification_reviewed_at` timestamptz
  - `verification_reviewer_note` text
  - `id_document_path` text (Supabase Storage path)
  - `selfie_path` text (Supabase Storage path)
  - `document_type` text ('drivers_license'|'passport'|'my_number_card')
- 既存の `birth_date`, `age_verified_at` はそのまま活用
- Supabase Storage: `identity-verification` バケット作成（private, RLS付き）

### A2. 分身誕生フロー（クライアント）
`components/rendezvous/AvatarBirthFlow.tsx` — 全画面モーダル、5ステップ:

1. **導入画面**: 「あなたの分身を現実と結びつけます」説明 + 書類タイプ選択（免許証/パスポート/マイナンバーカード）
2. **書類撮影**: カメラのみ（`<input accept="image/*" capture="environment">`）、ガイドオーバーレイ（枠線表示）、画質チェック
3. **プレビュー確認**: 生年月日エリア以外を自動ぼかし表示（Canvas API）+ 「この情報のみ確認します」明示
4. **セルフィー撮影**: カメラのみ（`<input accept="image/*" capture="user">`、ギャラリー不可）、顔枠ガイド表示
5. **提出完了**: 「分身が誕生の準備をしています...」パーティクルアニメーション

### A3. APIルート
- `POST /api/rendezvous/identity-verify` — 書類＋セルフィーをStorageアップロード、ステータスpendingに更新
- `GET /api/admin/rendezvous/verifications` — 管理者用: pending/全件一覧取得
- `PATCH /api/admin/rendezvous/verifications` — 承認/再撮影依頼/リジェクト処理

### A4. 管理画面（確認キュー）
`app/admin/rendezvous/verifications/page.tsx`:
- pending件数バッジ
- カード: ぼかし済み書類画像 + セルフィー横並び + 生年月日のみ判読可能
- 3アクション: ✅ 承認 / 📸 再撮影依頼 / ❌ リジェクト

### A5. ゲート更新
- `AgeVerificationGate` → `IdentityGate` にリネーム
- `verification_status` に応じた表示:
  - `none` → 分身誕生フロー表示
  - `pending` → 3段階プログレス（📤受領 → 🔍確認中 → ✨覚醒）+ プロフィール設定は可能、マッチングのみロック
  - `approved` → 全機能解放
  - `rejected` → 再提出フロー + 理由表示
- **romantic + orbiter のみゲート適用**。friendship/cocreation/community は不要

---

## Phase B: 200%の6機能

### B1. 分身の生命感（Avatar Vitality）
**ファイル:**
- `lib/rendezvous/avatarNarrative.ts` — マッチング判定ログを自然言語ナラティブに変換
- `components/rendezvous/AvatarJourney.tsx` — 分身の行動タイムラインUI

**仕様:**
- 分身の1日の行動をタイムライン形式で表示
- 抽象的な表現（相手の詳細は絶対に非表示）:
  - 「今日、分身は5人と交差しました」
  - 「1人の前で長く立ち止まりました」
  - 「ある人との共鳴度が少し高まりました」
- RendezvousHomeのトップセクションに配置
- `rendezvous_match_candidates` のログデータから自然言語を生成
- 時間帯アイコン（🌅朝 🌤昼 🌙夜）付き

### B2. 発見の深さ（Self-Discovery）
**ファイル:**
- `lib/rendezvous/selfDiscovery.ts` — チャットパターン分析エンジン
- `components/rendezvous/SelfDiscoveryInsight.tsx` — 自己発見カード

**仕様:**
- チャットの統計分析: 返信速度、メッセージ長、時間帯、話題傾向
- ユーザー自身の傾向を第三者視点で提示:
  - 「この方との会話で、あなたは普段より多く過去の話をしています」
  - 「夜の時間帯、返信速度がいつもより速くなっています」
- チャット詳細画面のヘッダー下に控えめに表示
- 関係が一定の深さに達した時のみ表示（メッセージ数20以上）

### B3. 世界観の没入（Immersive Atmosphere）
**ファイル:**
- `lib/rendezvous/atmosphere.ts` — 時間帯→テーマ変数マッピング
- `components/rendezvous/AtmosphereProvider.tsx` — CSS変数注入プロバイダー

**仕様:**
- 時間帯別の空間演出（CSSカスタムプロパティ）:
  - 早朝(5-7): 薄い琥珀の光、霧のようなオーバーレイ
  - 朝(7-10): 柔らかい白、クリアな空気感
  - 昼(10-16): 温かいニュートラル、活発なトーン
  - 夕(16-19): 琥珀がかったオレンジ、ゆったり感
  - 夜(19-23): 深い青紫、星のパーティクル、静寂
  - 深夜(23-5): 最も深い紺、微かな光のみ
- RendezvousLayout全体に適用
- `prefers-reduced-motion` 対応

### B4. 不在の美学（Aesthetics of Absence）
**ファイル:**
- `lib/rendezvous/absenceTracker.ts` — 不在期間イベント蓄積・ナラティブ生成
- `components/rendezvous/AbsenceJournal.tsx` — 旅日誌UI（復帰時モーダル）

**仕様:**
- 最終アクティブからの経過時間を検出
- 不在期間中のマッチング活動を蓄積（DB上のmatch_candidates変動）
- 復帰時にフェードインモーダルで旅日誌を表示:
  - 「あなたの不在の3日間に、分身は12人と交差し...」
  - 「2人の前で立ち止まりました」
  - 「1つの新しい星座の兆しを見つけました」
- 24時間以上の不在で発動
- localStorage で最終アクティブタイムスタンプ管理
- 閉じるボタンで消え、二度と同じ日誌は表示しない

### B5. 記憶の結晶化（Memory Crystallization）
**ファイル:**
- `lib/rendezvous/memoryCrystals.ts` — チャットの特徴的瞬間検出エンジン
- `components/rendezvous/MemoryCrystal.tsx` — 結晶カードUI
- `components/rendezvous/MemoryCrystalList.tsx` — 結晶一覧

**仕様:**
- 検出パターン:
  - 深夜帯(23-4時)の長文交換 → 「深夜の対話」
  - 感情語密度が急上昇した区間 → 「心が動いた瞬間」
  - 初出トピック（家族、夢、過去）→ 「初めて話したこと」
  - 長い沈黙後の再開 → 「沈黙を越えて」
  - 笑い系の連続 → 「笑いが止まらなかった時」
- 結晶はガラス質のカードデザイン（glassmorphism）
- チャット画面ヘッダーに💎アイコン＋結晶数バッジ、タップで一覧
- 二人の共有資産として表示

### B6. 関係の変態（Relationship Metamorphosis）
**ファイル:**
- `lib/rendezvous/relationshipObserver.ts` — 関係変化の検出エンジン
- `components/rendezvous/RelationshipWhisper.tsx` — 分身の囁きUI

**仕様:**
- 検出指標:
  - 返信速度の変化（加速 or 減速）
  - メッセージ長の変化
  - 会話頻度の変化
  - 時間帯シフト（昼→夜など）
  - 話題の深度変化
- 分身の囁きとして控えめに表示（チャット画面上部、小さなカード）:
  - 加速時: 「この方との会話のリズムが変わってきています」
  - 減速時: 「最近、距離感に変化があります。あなた自身の状態の変化かもしれません」
  - カテゴリ横断の兆候: 「この関係に、新しい色が混ざり始めています」
- 押しつけない: ×で閉じ可能、1関係につき週1回まで
- 判断を強制しない（ボタンなし、カテゴリ変更提案なし）

---

## 実装順序
1. **Phase A** — 分身誕生プロセス（安全性基盤）
2. **Phase B1 + B4** — 分身の生命感 + 不在の美学（分身の実在感）
3. **Phase B3** — 世界観の没入（空間演出）
4. **Phase B5 + B6** — 記憶の結晶 + 関係の変態（関係の深化）
5. **Phase B2** — 自己発見（全体の仕上げ）
6. **ビルド確認 + 型チェック**

## ファイル総数
- lib/: 7ファイル
- components/: 8ファイル
- app/api/: 3ルート
- app/admin/: 1ページ
- migrations: 1ファイル
- **合計: 約20ファイル**
