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
| 記入日 | `2026-04-20`（雛形下書き）／最終確認日は §1 参照 |
| 記入責任者 | `Taishi Harada`（雛形下書きは AI 支援、§1 の事実確認は CEO 本人） |
| 対象 Milestone | CoAlter Stage 1 Understand M0-6B |
| 確認画面 | `https://console.anthropic.com/settings/data-retention` |

> **凡例**: `[CEO要確認]` プレフィクスは **CEO が Anthropic Console にログインして確認し、実値で置き換える必要がある** 欄。AI は埋めない。

---

## 1. ZDR enrollment 確認

| 項目 | 値 |
| --- | --- |
| Organization 名（公開可能な範囲） | `[CEO要確認]` |
| Organization ID の prefix（頭 8 文字のみ） | `[CEO要確認]`（形式: `org_xxxxxxxx`、**full ID は本書に記載しない**） |
| ZDR enrolled 状態 | `[CEO要確認]`（Yes / No） |
| enrollment 開始日 | `[CEO要確認]` |
| 確認日時 | `[CEO要確認]` |
| 確認者 | `Taishi Harada`（予定、実確認時に再署名） |
| 確認方法 | `console 画面`（予定、実確認で変わり得る — 他の選択肢: Anthropic 発行 email / 営業連絡） |
| スクリーンショット保管場所 | `~/Documents/coalter-evidence/zdr-console-YYYY-MM-DD.png` を想定（repo 外、CEO 手元 local のみ、**repo には commit しない**。iCloud Drive 配下を避ける場合は `~/coalter-evidence/` に変更） |

> **ブロッカー**: 上記 `[CEO要確認]` 5 項目のいずれかが埋まるまで M0-6B 着手不可。
> AI は console にログインできないため、これらは必ず CEO 本人が確認する。

---

## 2. API key 管理

**prod 運用 key とは別 key** を発行し、shadow 用として分離する。

| 項目 | 値 |
| --- | --- |
| shadow 用 key 識別子（末尾 4 文字のみ） | `[CEO要確認]`（key 発行後に末尾 4 文字を記入、full key は `.env.local` のみ） |
| key 発行日 | `[CEO要確認]` |
| 保管場所 | `.env.local`（git commit 禁止、`.gitignore` 済み） |
| env 変数名 | `COALTER_UNDERSTANDING_SHADOW_API_KEY` |
| 所属 organization | 本書 §1 と同一の ZDR enrolled org か確認: `[CEO要確認]`（はい / いいえ） |
| prod key と同一でないことの確認 | `[CEO要確認]`（はい / いいえ — 同一の場合は着手不可） |

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
| 実装 TODO の記載場所 | `lib/coalter/understanding/realApiAdapter.ts`（M0-6B 着手時に新規作成予定、startup ルーチンに ZDR 検証 throw を組込む） |
| 検証 test 名 | `tests/unit/coalter/understanding/leakAudit.test.ts` 内「adapter startup — 非 ZDR key で fail-fast」を追加予定 |
| 検証 commit hash | `PENDING_M0-6B_IMPLEMENTATION`（adapter 未実装のため） |

---

## 4. ZDR 構成の継続監査

| 項目 | 値 |
| --- | --- |
| 次回確認予定日 | M0-6B shadow 検証終了日（集計完了日と同日）に再確認。実日付は `[CEO要確認]` |
| 失効時の手順 | M0-6B shadow 実行を即時停止 + `scripts/coalter/internal-pairs/` を `rm -rf` + `docs/decision-log.md` に失効記録 |

---

## 関連ドキュメント

- [coalter-m0-6b-prerequisites.md](./coalter-m0-6b-prerequisites.md) — M0-6B 着手前提の正式定義
- [coalter-m0-promotion-gates.md](./coalter-m0-promotion-gates.md) — Gate E（漏洩監査）
