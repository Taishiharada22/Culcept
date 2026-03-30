# Partner 身元確認設計書

**ステータス**: 確定（CEO 承認済み 2026-03-27）
**作成日**: 2026-03-27
**対象**: Rendezvous 3枠（Romance / Connection / Partner）の本人確認レベル設計

---

## 1. 目的

Rendezvous の3枠それぞれに適切な本人確認レベルを定義し、**安全性と離脱率のバランス**を取る。

Partner は「結婚前提の交際」であり、Romance よりも強い確認が必要だが、初期版では過剰に重くしない。

### 設計原則

- **段階的開放**: 最初から全部求めず、関係の深度に応じて必要なレベルを上げる
- **既存インフラ活用**: `rendezvous_verification` テーブル、`identity-verify` API、`IdentityGate` コンポーネントが既に存在する。これを拡張する
- **安心 > 手間**: Partner ユーザーは「ちゃんとしている人としか出会いたくない」動機が強い。確認の手間は安心の証拠として受容されやすい

---

## 2. 確認レベル設計

### レベル定義

| Level | 名称 | 内容 | 自動/手動 |
|-------|------|------|-----------|
| **L0** | 未確認 | アカウント作成のみ | — |
| **L1** | メール確認済み | メール認証完了（Supabase Auth 標準） | 自動 |
| **L2** | 写真確認済み | 4枚写真 + セルフィー一致 + 年齢確認（18+） | 手動レビュー |
| **L3** | 身分証確認済み | L2 + 身分証画像（運転免許/パスポート/マイナンバーカード） | 手動レビュー |
| **L4** | 追加証明済み | L3 + 独身証明書 or 年収証明書（Partner 上位） | 手動レビュー |

### 枠別の必須レベル

| 機能段階 | Connection（つながり） | Romance（恋愛） | Partner（結婚前提） |
|----------|----------------------|-----------------|-------------------|
| **登録・プロフィール作成** | L1 | L1 | L1 |
| **候補の閲覧** | L1 | L2 | L2 |
| **いいね/スキップ** | L1 | L2 | L3 |
| **マッチ成立** | L1 | L2 | L3 |
| **チャット開始** | L2 | L2 | L3 |
| **写真の段階開示** | L2 | L2 | L3 |
| **面会（オフライン移行）** | L2 | L3 | L3 + review_status=approved |
| **連絡先交換** | L2 | L3 | **L3 + review_status=approved** |
| **日程調整** | L2 | L3 | **L3 + review_status=approved** |
| **初回面会機能** | L2 | L3 | **L3 + review_status=approved** |
| **追加証明バッジ表示** | — | — | L4（任意） |

### 要点

- **Connection**: アバター先行のため、写真確認はチャット開始時まで不要
- **Romance**: 候補閲覧から写真確認必須（既存の `IdentityGate` の動作と一致）
- **Partner**: 候補閲覧は L2 だが、**いいね/マッチ/チャットは L3（身分証）必須**
- **Partner 連絡先交換・日程調整・初回面会**: L3 かつ **review_status=approved** が必須。pending 状態では不可
- **L4**: Partner のみ任意。提出すると「追加証明済み」バッジが表示される

---

## 3. UX フロー

### 3.1 Partner オンボーディングへの統合

現在の Partner オンボーディング Hub（3ステップ）に身元確認を追加:

```
Partner オンボーディング Hub
├─ Step 1: 人生設計の観測（Life Plan 35問）   ← 既存
├─ Step 2: 絶対条件の設定（Dealbreaker 6項目）← 既存
├─ Step 3: Process Profile 同期              ← 既存
└─ Step 4: 身元確認（NEW）
    ├─ 4a: 年齢確認（生年月日入力 → 18+チェック）
    ├─ 4b: 写真登録（4枚: 雰囲気/顔/ベスト/最近）
    ├─ 4c: 身分証アップロード（運転免許/パスポート/マイナンバーカード）
    └─ 4d: 追加証明（任意: 独身証明/年収証明）
```

### 3.2 段階的要求（離脱を減らすために）

**初回訪問時**:
- Step 1〜3 を完了させることを優先
- Step 4 は「候補を見る準備が整いました。安全のため、身元確認をお願いします」と案内
- Step 4a（年齢）と 4b（写真）は Partner 候補閲覧の前提条件 → **この時点で L2 に到達**

**候補閲覧後、いいね/マッチ前**:
- 「この方にいいねを送るには、身分証の確認が必要です」
- 4c（身分証）を案内 → **L3 に到達**
- 審査中は「確認中」ステータスを表示し、他の操作（候補閲覧・Life Plan 追加回答）は可能

**マッチ後（任意）**:
- 「追加証明を提出すると、お相手に安心感が伝わります」
- 4d（独身証明/年収証明）を案内 → **L4 バッジ取得**

### 3.3 離脱を減らす文言設計

| 場面 | 文言案 |
|------|--------|
| L2 要求時 | 「結婚を真剣に考えている方と出会うために、写真の確認をお願いしています」 |
| L3 要求時 | 「お互いの安心のために、身分証の確認をお願いしています。確認後はより信頼できるマッチングが始まります」 |
| L4 案内時 | 「独身証明を提出すると、候補一覧で ✓ バッジが表示されます（任意）」 |
| 審査中 | 「確認中です。通常24時間以内に完了します。その間も他の機能をお使いいただけます」 |
| 却下時 | 「書類が確認できませんでした。[理由]。再提出いただけます」 |

### 3.4 確認バッジの見せ方

候補カード・詳細画面に表示:

| Level | バッジ | 表示場所 |
|-------|--------|----------|
| L2 | `✓ 写真確認済み` (グレー) | 候補カード名前の横 |
| L3 | `✓ 本人確認済み` (テラコッタ) | 候補カード名前の横 + 詳細ヘッダー |
| L4 | `✓✓ 追加証明済み` (ゴールド) | 候補カード名前の横 + 詳細ヘッダー + 専用セクション |

---

## 4. データ設計

### 4.1 既存テーブルの活用と拡張

**既に存在するもの（変更不要）:**

| テーブル/カラム | 用途 |
|----------------|------|
| `rendezvous_profiles.verification_status` | `unverified/pending/verified/rejected/expired` |
| `rendezvous_profiles.verification_submitted_at` | 提出日時 |
| `rendezvous_profiles.verification_reviewed_at` | レビュー日時 |
| `rendezvous_profiles.verification_reviewer_note` | 管理者メモ |
| `rendezvous_profiles.id_document_path` | 身分証画像パス |
| `rendezvous_profiles.selfie_path` | セルフィーパス |
| `rendezvous_profiles.document_type` | `drivers_license/passport/my_number_card` |
| `rendezvous_profiles.birth_date` | 生年月日 |
| `rendezvous_profiles.age_verified_at` | 年齢確認日時 |
| `rendezvous_verification.*` | 4枚写真 + ID + レビュー状態 |

**新規追加が必要なカラム:**

```sql
-- rendezvous_profiles への追加
ALTER TABLE rendezvous_profiles
  ADD COLUMN IF NOT EXISTS verification_level smallint NOT NULL DEFAULT 0
    CHECK (verification_level BETWEEN 0 AND 4),
  ADD COLUMN IF NOT EXISTS additional_document_type text
    CHECK (additional_document_type IS NULL
      OR additional_document_type IN ('single_certificate', 'income_certificate')),
  ADD COLUMN IF NOT EXISTS additional_document_path text,
  ADD COLUMN IF NOT EXISTS additional_document_status text NOT NULL DEFAULT 'none'
    CHECK (additional_document_status IN ('none', 'pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS additional_document_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_review_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frozen_at timestamptz,
  ADD COLUMN IF NOT EXISTS frozen_reason text;

CREATE INDEX IF NOT EXISTS idx_rendezvous_profiles_verification_level
  ON rendezvous_profiles(verification_level);

CREATE INDEX IF NOT EXISTS idx_rendezvous_profiles_frozen
  ON rendezvous_profiles(frozen_at) WHERE frozen_at IS NOT NULL;
```

### 4.2 verification_status / review_status / verification_level の三層構造

`verification_status` と `review_status` は **別物** である。

#### 定義

| カラム | 型 | 役割 | 値 |
|--------|-----|------|-----|
| `verification_status` | text | **本人確認フロー全体の到達状態**（ユーザー向け） | `unverified` / `pending` / `verified` / `rejected` / `expired` |
| `review_status` | text | **提出済み証憑に対する審査状態**（管理側） | `not_submitted` / `pending` / `approved` / `rejected` |
| `verification_level` | smallint | 算出された確認レベル（0〜4） | L0〜L4 |

#### 役割の違い

- `verification_status` は「**そのユーザーが現在どの確認段階にいるか**」を表す
- `review_status` は「**提出物が審査でどう扱われているか**」を表す
- 両者は連動するが同一ではない

#### 状態の組み合わせ例

| 状態 | verification_status | review_status | verification_level |
|------|--------------------|--------------|--------------------|
| 未提出 | `unverified` | `not_submitted` | 0 |
| 提出直後 | `pending` | `pending` | 変化なし |
| 承認後 | `verified` | `approved` | 3 |
| 却下時 | `rejected` | `rejected` | 変化なし |
| 有効期限切れ | `expired` | `approved` | 要再確認 |

※ `expired` は過去に承認されたが、現在は再確認が必要な状態。`review_status` は `approved` のまま残る。

#### 運用ルール

- Partner の Like / Match / Chat / 連絡先交換 / 日程調整 / 初回面会 は
  **`verification_level >= 3` かつ `review_status = 'approved'`** を必須条件とする
- `verification_status = 'verified'` だけでは不足で、**`review_status = 'approved'` を必ず併用する**
- 凍結中（`frozen_at IS NOT NULL`）は上記条件を満たしていても全 Partner 行動を停止する

#### 状態遷移フロー

```
ユーザー提出   → verification_status='pending',   review_status='pending'
管理者承認     → verification_status='verified',   review_status='approved',  verification_level=3
管理者却下     → verification_status='rejected',   review_status='rejected'
ユーザー再提出 → verification_status='pending',    review_status='pending'
期限切れ       → verification_status='expired',    review_status='approved'  ← 審査結果は保持
```

```sql
-- DB CHECK 制約
ALTER TABLE rendezvous_profiles
  ADD CONSTRAINT rendezvous_profiles_verification_status_check
    CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected', 'expired'));

ALTER TABLE rendezvous_profiles
  ADD CONSTRAINT rendezvous_profiles_review_status_check
    CHECK (review_status IN ('not_submitted', 'pending', 'approved', 'rejected'));
```

### 4.3 verification_level の算出ロジック（アプリケーション層）

```
L0: デフォルト
L1: email_confirmed_at IS NOT NULL（Supabase Auth から取得）
L2: L1 + age_verified_at IS NOT NULL + rendezvous_verification.status = 'approved'
L3: L2 + review_status = 'approved'（身分証レビュー承認済み）
L4: L3 + additional_document_status = 'approved'
```

`verification_level` は書き込み時に計算して保存する（derived column ではなく、レビュー承認時に更新）。理由: フィルタクエリの性能と、複数テーブル参照の簡略化。

### 4.3 ストレージ構成

```
identity-verification/
  {userId}/
    photo_atmosphere_{timestamp}.jpg
    photo_face_{timestamp}.jpg
    photo_best_{timestamp}.jpg
    photo_current_{timestamp}.jpg
    id_document_{timestamp}.jpg      ← L3
    additional_document_{timestamp}.jpg ← L4
```

- バケット: `identity-verification`（既存）
- RLS: ユーザー本人 + service_role のみアクセス可
- 管理画面では signed URL で一時的に閲覧可能（有効期限 5分）

---

## 5. 運用設計

### 5.1 自動審査と手動審査の分担

| 処理 | 方式 | 詳細 |
|------|------|------|
| メール確認 | 自動 | Supabase Auth 標準 |
| 年齢確認 | 自動 | 生年月日入力 → 18+チェック（クライアント + サーバー二重チェック） |
| 写真4枚 | **手動** | 管理者が「実在する人物か」「公序良俗に反しないか」を確認 |
| セルフィー一致 | **手動**（MVP）| 将来は AI 顔照合。MVP では管理者が写真とセルフィーを目視比較 |
| 身分証 | **手動** | 管理者が「写真と一致するか」「有効期限内か」を確認 |
| 追加証明 | **手動** | 管理者が書類内容を確認 |

**MVP ではすべて手動レビュー。将来の自動化ポイント:**
- 顔照合 AI（セルフィー vs 写真 vs 身分証写真）
- OCR で身分証の有効期限チェック
- 外部 KYC サービス連携（eKYC）

### 5.2 レビューフロー

```
ユーザー提出
  → verification_status='pending', review_status='pending'
  ↓
管理画面に表示（/admin/rendezvous/verifications）
  ↓
管理者アクション:
  ├─ 承認 → verification_status='verified',  review_status='approved',  verification_level=3
  ├─ 再提出要求 → verification_status='rejected', review_status='rejected', reviewer_note に理由
  ├─ 却下 → verification_status='rejected', review_status='rejected', reviewer_note に理由
  ├─ 凍結 → frozen_at=now, frozen_reason に理由
  └─ 凍結解除 → frozen_at=NULL, frozen_reason=NULL
```

**目標 SLA**: 提出から24時間以内にレビュー完了

### 5.3 再申請フロー

- 却下理由がユーザーに表示される
- 「再提出」ボタンで写真/身分証を差し替え可能
- 再提出すると `verification_status='pending'`, `review_status='pending'` に戻り、レビューキューに再度入る
- 再提出回数の上限は設けない（MVP）。悪用が目立てば後から制限

### 5.4 凍結条件（frozen_at / frozen_reason の発火条件）

#### 凍結トリガー一覧

| # | トリガー | 発火条件 | frozen_reason 値 | 自動/手動 |
|---|----------|----------|-----------------|-----------|
| F1 | なりすまし通報 | 他ユーザーから「なりすまし」カテゴリの通報を受信 | `report:impersonation` | 手動（管理者判断） |
| F2 | ハラスメント通報 | 他ユーザーから「嫌がらせ」通報を2件以上受信 | `report:harassment` | 手動（管理者判断） |
| F3 | 身分証詐称発覚 | 管理者レビューで他人の身分証使用が判明 | `fraud:document` | 手動 |
| F4 | 写真詐称発覚 | 管理者レビューで本人と著しく異なる写真が判明 | `fraud:photo` | 手動 |
| F5 | 複数アカウント検出 | 同一デバイス/IP から複数アカウント作成が検出された場合 | `policy:multi_account` | 手動（将来自動化） |
| F6 | 管理者の裁量 | 上記に該当しないが安全上の懸念がある場合 | `admin:discretion` + 詳細を note に記載 | 手動 |
| F7 | 年齢詐称発覚 | 身分証で18歳未満と判明 | `fraud:underage` | 手動 → **永久凍結** |

#### 凍結時の影響

| 影響範囲 | 詳細 |
|----------|------|
| 候補一覧 | 凍結ユーザーは他ユーザーの候補一覧から完全除外 |
| マッチ | 既存マッチは「一時停止」状態に。チャット送信不可 |
| プロフィール | 他ユーザーからは非表示 |
| 本人への通知 | 「アカウントが一時停止されました。詳細はサポートにお問い合わせください」 |
| 自身の操作 | 閲覧のみ可。いいね/チャット/面会すべて不可 |

#### 凍結解除

- 管理者が `frozen_at = NULL`, `frozen_reason = NULL` に更新
- F3/F7 は原則永久凍結（解除には CEO 承認が必要）
- 解除時、凍結履歴は `verification_reviewer_note` に追記保持

### 5.5 詐称/なりすまし時の扱い

- 身分証と写真の不一致 → 却下（再提出可）
- 意図的な詐称（他人の身分証使用）が判明 → **永久凍結 + アカウント停止**
- 詐称の証拠は `verification_reviewer_note` に記録
- 将来的に、凍結ユーザーの電話番号/デバイス ID をブラックリストに追加

---

## 6. 表示・制限設計

### 6.1 Level 別の機能制限

| 機能 | L0 | L1 | L2 | L3 | L4 |
|------|:--:|:--:|:--:|:--:|:--:|
| Stargazer 観測 | ✓ | ✓ | ✓ | ✓ | ✓ |
| Genome Card 作成 | — | ✓ | ✓ | ✓ | ✓ |
| Connection 候補閲覧 | — | ✓ | ✓ | ✓ | ✓ |
| Connection チャット | — | — | ✓ | ✓ | ✓ |
| Romance 候補閲覧 | — | — | ✓ | ✓ | ✓ |
| Romance いいね/チャット | — | — | ✓ | ✓ | ✓ |
| Partner 候補閲覧 | — | — | ✓ | ✓ | ✓ |
| Partner いいね | — | — | — | ✓ | ✓ |
| Partner マッチ/チャット | — | — | — | ✓ | ✓ |
| Partner 連絡先交換 | — | — | — | ✓* | ✓* |
| Partner 日程調整 | — | — | — | ✓* | ✓* |
| Partner 初回面会機能 | — | — | — | ✓* | ✓* |
| Partner 追加証明バッジ | — | — | — | — | ✓ |

*✓\* = L3 かつ review_status=approved が必須。pending では不可。*

### 6.2 Partner 候補カードでの表示

未確認ユーザーの候補カードには「確認待ち」と表示し、お相手が L3 未満の場合は:

- いいねボタンを無効化
- 「この方はまだ本人確認が完了していません」と注記

→ **双方 L3 以上でないとマッチが成立しない**

### 6.3 既存 IdentityGate との統合

現在の `IdentityGate` は `romantic` と `orbiter` をゲートしている:

```typescript
const GATED_CATEGORIES = ["romantic", "orbiter"];
```

これを拡張:

```typescript
const GATED_CATEGORIES = ["romantic", "orbiter", "partner"];
```

Partner の場合、ゲートレベルを L3 に引き上げる（Romance は L2 のまま）。

---

## 7. 法務・プライバシー観点

### 7.1 保存期間

| データ | 保存期間 | 根拠 |
|--------|----------|------|
| 写真4枚 | アカウント存続中 + 退会後30日 | マッチング機能に必要 |
| 身分証画像 | レビュー完了後90日で削除 | 目的外利用防止。レビュー結果のみ保持 |
| 追加証明画像 | レビュー完了後90日で削除 | 同上 |
| セルフィー | レビュー完了後90日で削除 | 同上 |
| レビュー結果（approved/rejected） | アカウント存続中 | ステータス管理に必要 |
| 生年月日 | アカウント存続中 | 年齢確認に必要 |

**→ 証明書画像は「確認に使ったら消す」方針。審査結果メタデータは保持する。**

### 7.1.1 画像削除後に保持する審査結果メタデータ

身分証・追加証明の画像を削除した後も、以下のメタデータは `rendezvous_profiles` に永続保持する:

| 保持するカラム | 内容 |
|---------------|------|
| `review_status` | 審査結果（approved/rejected） |
| `verification_level` | 確認レベル（0〜4） |
| `verification_reviewed_at` | 審査完了日時 |
| `verification_reviewer_note` | 管理者メモ（却下理由含む） |
| `document_type` | 提出された書類種別（drivers_license 等） |
| `additional_document_type` | 追加証明の書類種別 |
| `additional_document_reviewed_at` | 追加証明の審査日時 |

| 削除するもの | タイミング |
|-------------|-----------|
| `id_document_path` の実画像（Storage） | 承認後90日 |
| `selfie_path` の実画像（Storage） | 承認後90日 |
| `additional_document_path` の実画像（Storage） | 承認後90日 |
| 上記パスカラムの値 | 画像削除と同時に NULL にリセット |

**つまり「この人は L3 で承認済み、書類種別は運転免許」は分かるが、画像そのものは残らない。**

### 7.2 画像の保持方針

- Supabase Storage に暗号化保存（Supabase 標準の encryption at rest）
- 管理画面からのアクセスは signed URL（有効期限5分）
- 管理者の閲覧ログを記録（将来: `verification_access_logs` テーブル）
- 画像の外部共有・ダウンロードは禁止（管理画面 UI でダウンロードボタンを設けない）

### 7.3 外部 KYC 利用

**MVP では使用しない。**

理由:
- 初期ユーザー数が少なく、手動レビューで十分対応可能
- 外部サービスへの個人情報提供には利用規約の改定が必要
- コスト（1件あたり 100〜500円）が初期段階では見合わない

将来の候補:
- TRUSTDOCK（日本向け eKYC）
- Stripe Identity
- Jumio

### 7.4 削除依頼時の扱い

- ユーザーがアカウント削除を要求 → 全画像を即時削除、レビューステータスも削除
- GDPR / 個人情報保護法に準拠: 「忘れられる権利」を尊重
- `ON DELETE CASCADE` が既にテーブル設計に含まれているため、`auth.users` 削除で連鎖削除される
- Storage の画像は別途削除処理が必要（cron or webhook）

### 7.5 利用規約・プライバシーポリシーへの反映ポイント

以下を追記する必要がある（実施は CEO 承認後）:

1. **利用規約**:
   - 本人確認の義務（Partner/Romance 利用時）
   - 虚偽情報・他人のなりすましの禁止と罰則
   - 確認書類の提出は任意だが、一部機能の利用に必要であること

2. **プライバシーポリシー**:
   - 収集する個人情報: 顔写真、身分証画像、生年月日
   - 利用目的: 本人確認、年齢確認、安全なマッチング環境の維持
   - 保存期間: 確認完了後90日で画像削除
   - 第三者提供: 行わない（MVP。外部 KYC 導入時に改定）
   - 開示・削除請求: 対応する

---

## 8. MVP 案

### MVP スコープ（初期リリース）

| 項目 | 内容 |
|------|------|
| 対象レベル | L0〜L3 のみ（L4 は将来） |
| 審査方式 | 全件手動レビュー |
| 年齢確認 | 生年月日入力の自己申告（L2。身分証で裏付け = L3） |
| 写真確認 | 既存の4枚写真登録フロー + 管理者目視レビュー |
| 身分証確認 | 画像アップロード + 管理者目視レビュー |
| IdentityGate 拡張 | `partner` を GATED_CATEGORIES に追加、Level チェックを L3 に |
| バッジ表示 | L3 のみ（`✓ 本人確認済み`） |
| 保存期間 | 身分証画像は承認後90日で自動削除（cron） |

### MVP で作らないもの

- L4（追加証明）
- AI 顔照合
- 外部 KYC 連携
- 画像自動削除 cron（手動削除で対応）
- 凍結の自動化（管理者手動のみ）

### MVP 実装タスク（概算）

| タスク | 規模 |
|--------|------|
| migration: `verification_level` + `frozen_*` + `additional_*` カラム追加 | S |
| IdentityGate 拡張（partner 対応 + Level チェック） | S |
| Partner オンボーディング Hub に Step 4 追加 | M |
| 確認バッジコンポーネント | S |
| 候補カード/詳細画面にバッジ表示 | S |
| Partner いいね時の L3 チェック API | S |
| 身分証画像の90日自動削除（cron） | S |

---

## 9. 将来拡張案

| 項目 | タイミング | 内容 |
|------|-----------|------|
| **L4 追加証明** | MAU 500+ | 独身証明書・年収証明書のアップロード + レビュー |
| **AI 顔照合** | MAU 1,000+ | セルフィー vs 写真 vs 身分証の自動一致判定 |
| **外部 eKYC** | MAU 5,000+ | TRUSTDOCK 等と連携、自動審査率 90%+ 目標 |
| **電話番号認証** | L1.5 として | SMS 認証で複数アカウント防止 |
| **ビデオ通話確認** | Partner 専用 | マッチ後、初回面会前にビデオ通話で本人確認 |
| **信用スコア表示** | L4+ | 確認レベル + 活動履歴 + 通報歴から算出 |
| **凍結自動化** | 通報数閾値 | 3件以上の通報で自動凍結 → 管理者レビュー |
| **画像自動削除** | 即時 | cron で `verified_at + 90日` の画像を自動パージ |

---

## 10. Romance vs Partner 比較まとめ

| 観点 | Romance | Partner |
|------|---------|---------|
| 最低確認レベル（候補閲覧） | L2 | L2 |
| 最低確認レベル（マッチ） | L2 | **L3** |
| 身分証必須 | 面会時のみ | **いいね送信時** |
| 追加証明 | なし | L4（任意） |
| 確認バッジ | `✓ 写真確認済み` | `✓ 本人確認済み` / `✓✓ 追加証明済み` |
| 凍結時の影響 | 候補非表示 | 候補非表示 + マッチ凍結 |
| 審査 SLA | 48時間 | **24時間** |
| 画像削除期限 | 90日 | 90日 |

---

**次のステップ**: CEO 承認後、MVP タスクの実装に進む。
