# CoAlter M0-6B Anthropic ZDR 構成確認（雛形）

> **この文書は雛形です**。全ての `__未記入__` 欄は CEO が Anthropic Console で
> 確認した上で手書きで埋める。AI が自動補完してはならない
> （M0-6B prerequisites §3 前提② のため）。
>
> 記入完了までは M0-6B 着手不可。

---

## 0. メタ

| 項目 | 値 |
| --- | --- |
| 記入日 | `__未記入__` |
| 記入責任者 | `__未記入__` |
| 対象 Milestone | CoAlter Stage 1 Understand M0-6B |
| 確認画面 | `https://console.anthropic.com/settings/data-retention` |

---

## 1. ZDR enrollment 確認

| 項目 | 値 |
| --- | --- |
| Organization 名（公開可能な範囲） | `__未記入__` |
| Organization ID の prefix（頭 8 文字のみ） | `__未記入__`（`org_xxxxxxxx` までに留める） |
| ZDR enrolled 状態 | `__未記入__`（Yes / No） |
| enrollment 開始日 | `__未記入__` |
| 確認日時 | `__未記入__` |
| 確認者 | `__未記入__` |
| 確認方法 | `__未記入__`（console 画面 / Anthropic 発行 email / 営業連絡） |
| スクリーンショット保管場所 | `__未記入__`（repo 外、CEO 手元 local のみ。**repo には commit しない**） |

---

## 2. API key 管理

**prod 運用 key とは別 key** を発行し、shadow 用として分離する。

| 項目 | 値 |
| --- | --- |
| shadow 用 key 識別子（末尾 4 文字のみ） | `__未記入__` |
| key 発行日 | `__未記入__` |
| 保管場所 | `.env.local`（git にコミットしない） |
| env 変数名 | `COALTER_UNDERSTANDING_SHADOW_API_KEY` |
| 所属 organization | 本書 §1 と同一の ZDR enrolled org か確認: `__未記入__`（はい / いいえ） |
| prod key と同一でないことの確認 | `__未記入__`（はい / いいえ） |

---

## 3. 非 ZDR 時のフェイルファスト

M0-6B adapter 実装時（本書記入完了後）に以下を adapter 起動時ルーチンへ組込。

```
[ ] ZDR 無効 org の key が検出されたら起動時に throw する実装 TODO 明記
[ ] throw 時のメッセージは key 値を露出しない（末尾 4 文字のみログ出力）
[ ] fail-fast は leakAudit.test.ts でも PASS 対象として検証する
```

記入欄:

| 項目 | 値 |
| --- | --- |
| 実装 TODO の記載場所 | `__未記入__`（ファイル path:line） |
| 検証 test 名 | `__未記入__` |
| 検証 commit hash | `__未記入__` |

---

## 4. ZDR 構成の継続監査

| 項目 | 値 |
| --- | --- |
| 次回確認予定日 | `__未記入__`（shadow 検証終了時に再確認） |
| 失効時の手順 | M0-6B shadow 実行を即時停止 + `internal-pair-*.json` を削除 |

---

## 関連ドキュメント

- [coalter-m0-6b-prerequisites.md](./coalter-m0-6b-prerequisites.md) — M0-6B 着手前提の正式定義
- [coalter-m0-promotion-gates.md](./coalter-m0-promotion-gates.md) — Gate E（漏洩監査）
