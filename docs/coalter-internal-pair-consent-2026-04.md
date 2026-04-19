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
[x] ① 既存の会話履歴を Stage 1 Understand の shadow 評価に使う
[x] ② Anthropic ZDR 経由で LLM に送信する
       （prompt は構造化フィールドのみ、
        turns.body / email / displayName / userId は含まない）
[x] ③ 生成された LLM 出力は DB / analytics / log に保存しない
[x] ④ M0-6B 完了後 or 同意撤回時に internal-pair-*.json を削除する
[x] ⑤ 撤回申し出はいつでも可能（email または口頭、記録は CEO 管理）
```

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
  commit hash: TBD_after_commit（この commit で本書が repo に入った直後に追記）
  message: "consent: CoAlter M0-6B internal pair (A=taishi harada / B=kumi harada)"
```

---

## 4. sessions 件数（≥20 の確認）

| 項目 | 値 |
| --- | --- |
| 対象 session の抽出元 | `Supabase public.dialogues`（`user_id IN (userIdA, userIdB)` でフィルタ） |
| session 件数 | `23`（`>=20` を満たすこと ✓） |
| 期間 | `2026-04-01 〜 2026-04-20` |
| 抽出時刻 | `2026-04-20 02:55 JST` |
| 抽出クエリ hash | `TBD_at_extraction_run`（`scripts/coalter/export-internal-pair.ts` 実行時に、実行された SQL を `sha256` した先頭 16 hex を記入。記入時点では export script 未実装） |

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
