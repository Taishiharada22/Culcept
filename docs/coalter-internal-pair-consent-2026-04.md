# CoAlter M0-6B 内部ペア consent 記録（雛形）

> **この文書は雛形です**。全ての `__未記入__` 欄は CEO および協力者が手書きで埋める。
> AI が自動補完してはならない（M0-6B prerequisites §3 前提① のため）。
>
> 記入完了までは M0-6B 着手不可。

---

## 0. メタ

| 項目 | 値 |
| --- | --- |
| 対象 Milestone | CoAlter Stage 1 Understand M0-6B |
| 記入日 | `2026-04-20`（YYYY-MM-DD） |
| 記入責任者 | `Taishi Harada`（CEO 氏名） |
| 保管場所 | この repo `docs/` 配下（匿名化済み文書のため commit 可） |
| 対応表の保管場所 | repo 外 `~/.coalter/pair-map.json`（本書には pairHash のみ記載） |

---

## 1. 対象の内部ペア

**新規アカウントは作成しない**。既存 2 アカウントを 1 組として使う。

| 識別 | 値 |
| --- | --- |
| pair 内部コードネーム | `aneurasync` |
| pairHash | `TBD_at_export_run`（16 hex chars; 実値は `~/.coalter/pair-map.json` 生成時に `sha256(userIdA + ":" + userIdB + ":" + pepper)[0..16]` で算出。記入時点では未算出） |
| アカウント A 本人 | `taishi harada`（氏名） |
| アカウント B 本人 | `kumi harada`（氏名） |
| 両者の関係性 | `既知ペア`（例: 既知ペア / 共同検証者） |
| 対応表の userId 参照 | 本書に記載しない（`~/.coalter/pair-map.json` で管理） |

---

## 2. 同意内容（必須 5 要素）— M0-6B prerequisites §2.1 に一致

両者は以下 5 項目を理解した上で同意する（§3 の理解確認欄「はい」×2 名分で担保）:

```
[x] ① 既存の会話履歴 + Understanding に必要な既存プロファイル参照を
       Stage 1 Understand の shadow 評価に使う（scope は §2.1 参照）
[x] ② Anthropic ZDR 経由で LLM に送信する
       （入力は構造化フィールドのみ、
        turns.body / email / displayName / userId は含まない）
[x] ③ 生成された LLM 出力は DB / analytics / log に保存しない
[x] ④ M0-6B 完了後 or 同意撤回時に internal-pair-*.json を削除する
[x] ⑤ 撤回申し出はいつでも可能（email または口頭、記録は CEO 管理）
```

## 2.1 参照データの scope（2026-04-20 CEO 更新、両者再確認済み）

当初 ①「対話のみ」を想定していたが、Understanding pipeline が十分な signal を
抽出するためには既存プロファイル参照が必要なため、以下の scope に拡張する。

**使ってよい範囲（Y-lite）**:
- `talk_messages`（ペア会話本文。`coalter_sessions` の時間窓で slice）
- Stargazer 観測データ（性格・判断特性）
- Alter 観測データ（Alter 対話由来の内面モデル）
- `coalter_fairness_ledger`（公平性台帳）
- 既存の relationship / shared history 系（`genome_connections` / `coalter_pair_states` 等）

**まだ使わない範囲（M0-6B scope 外、将来の別同意で扱う）**:
- `calendar` 系（着用記録・AIカレンダー等）
- `wardrobe` 系
- `styleProfile` 系
- その他の横断データ（顔・体・avatar 等）

**運用制約**:
- 読み取りのみ（read-only）。DB への書込なし。
- export JSON には **email / displayName / userId / turns.body を含めない**（`assertAnonymized` で機械的に enforce）
- pairHash + 集約 signal + RuleSnapshot のみを書き出す

**両者の再確認**: 2026-04-20 CEO が対面で原田久美に scope 拡張を説明し、同日「はい」の返答を得た。本書の commit 時点をもって再確認記録とする。

---

## 3. 署名相当記録

git commit の author 情報 + 本文内の本人確認で法務契約書を代替する。
**両者それぞれの欄を、本人が自分で埋めること**。

### アカウント A 本人

| 項目 | 値 |
| --- | --- |
| 氏名 | `taishi harada` |
| 同意日 | `2026-04-20` |
| 同意方法 | `対面`（対面 / 電話 / メール / チャット） |
| 5 要素 ①〜⑤ を理解したか | `はい`（はい / いいえ） |
| 撤回手段の認識 | `はい`（はい / いいえ） |
| 記入者の本人確認 | `はらだたいし`（この欄は本人が埋めること。CEO 記入不可） |

### アカウント B 本人

| 項目 | 値 |
| --- | --- |
| 氏名 | `kumi harada` |
| 同意日 | `2026-04-20` |
| 同意方法 | `対面` |
| 5 要素 ①〜⑤ を理解したか | `はい` |
| 撤回手段の認識 | `はい` |
| 記入者の本人確認 | `原田久美`（この欄は本人が埋めること） |

### 両者同時の git commit

本書を commit した時点で署名相当とする（commit author = git 設定者 = CEO 本人）。
commit hash は **commit 実行後** に本書へ追記する（後続 commit で 1 行更新）。

```
commit による記録:
  author: Taishi Harada (Taishiharada22)
  date:   2026-04-20
  commit hash: 273adda2（下書き confirm commit）
               ※ 本書の記入完了確定 commit は CEO 最終チェック後に別途追記
  message: "consent: CoAlter M0-6B internal pair (A=taishi harada / B=kumi harada)"
```

---

## 4. sessions 件数（≥20 の確認）

| 項目 | 値 |
| --- | --- |
| 対象 session の抽出元 | `public.coalter_sessions`（`pair_state_id = <本ペアの id>`） + `public.talk_messages`（同 `thread_id` + 各 session の `created_at` 〜 `ended_at` 時間窓）。補助として `public.stargazer_*` / `public.alter_*` / `public.coalter_fairness_ledger` / `public.genome_connections` を read-only 参照 |
| session 件数 | `23`（`>=20` を満たすこと ✓、coalter_sessions の行数） |
| 期間 | `2026-04-01 〜 2026-04-20` |
| 抽出時刻 | `2026-04-20 02:55 JST` |
| 抽出クエリ hash | `TBD_at_extraction_run`（`scripts/coalter/export-internal-pair.ts` 実行時に、実行された SQL を `sha256` した先頭 16 hex を記入） |

---

## 5. ペア多様性の注記

本件は **1 pair（既知ペア）での shadow 検証** であり、ペア多様性 = 1。
昇格判定 (M0 昇格 Gate A-4) ではこの点を加味し、
多様性が必要な場合は追加 pair を別途確保する前提とする。

---

## 6. 撤回ログ

同意撤回があった場合に追記。

| 日付 | 撤回者 | 手段 | CEO 対応 |
| --- | --- | --- | --- |
| (空) | | | |

---

## 関連ドキュメント

- [coalter-m0-6b-prerequisites.md](./coalter-m0-6b-prerequisites.md) — M0-6B 着手前提の正式定義
- [coalter-m0-promotion-gates.md](./coalter-m0-promotion-gates.md) — M0 昇格 Gate（正式版）
