# Life Ops — A-4-c16 UI Action Preview / No-write Display Mini-Design（表示のみ・押せない）

> 2026-06-11 / CEO・GPT GO「c15 descriptors を dev/operator preview で表示だけ。情報量・意味・誤操作リスクの確認が目的」。
> **禁止**: 押せる button・server action・writer 呼出・DB write・staging write smoke・PlanClient・R4・notification・production・external API・push/PR/merge。

---

## 1. 接続位置（最小 1 箇所）

**Morning 代表候補（briefing の recommended tier highlights・≤3 件）だけ**に action rail を付ける。
- 根拠: 「朝の代表」が本 codebase の代表概念（moment excludeKeys も同じ slice）。Moment/compose への拡張はしない（縦長化の確認が先）。
- 構造整合: briefing VM の `highlights = fitting.slice(0, BRIEFING_HIGHLIGHT_MAX)` と compute の `reps`（excludeKeys 用）が**同一式**→ index zip が構造的に安全。

## 2. DTO / VM 設計（handle 非搬出）

`LifeOpsPreviewActionDto { uiLabel, action, cadenceEligible, requiresConfirmation, previewOnly: true }` を
`LifeOpsPreviewHighlightDto.actions?`（recommended tier のみ・descriptors 空なら省略）として追加。
- **handle は writer 用内部 DTO のため UI preview に出さない**（intent→DTO 変換で落とす・JSON lock）。
- candidate/raw/placeQuery/dueReason/riskFlags は従来どおり不搬出。VM（briefing-preview）と縦 card-presenter は不変更。

## 3. 表示形式（client・presentational 維持）

各代表行の下に **read-only chip rail**: `採用 完了※ 後で 不要`（`<span>` のみ・`<button>`/onClick/useState なし・aria-disabled）。
- **完了の誤操作対策表現**: 完了 chip だけ amber 強調 + 「※」。rail が 1 つでもあれば section 末尾に 1 回だけ注記:
  「※完了は実際に終わった時だけ（次回の提案周期に影響）。自動では完了になりません。今は表示のみで、押せず・記録もしません。」
- 文言は非断定 BANNED_WORDS（すべき/必ず/今すぐ/確定 等）不使用。

## 4. test lock（GPT 13）
①descriptors 付与 ②固定順[採用,完了,後で,不要] ③done のみ cadenceEligible ④done のみ requiresConfirmation
⑤disabled/no-write（button 0・previewOnly=true・注記 render）⑥writer/server-only/supabase import 0 ⑦handle/`lifeops:` 非搬出
⑧placeQuery/dueReason/riskFlags/店舗名 非混入 ⑨lib/lifeops→action-intent 逆 import 0（c15 lock 継続）
⑩対象なし時は actions 省略・既存 preview 不変 ⑪⑫⑬ DB write/notification/production 0（静的）。

## 5. 変更ファイル
compute（DTO 拡張+rep zip）／RealityPipelinePreviewClient（chip rail+注記）／新 test `realityLifeopsActionPreview.test.tsx`／
既存 integration test の DTO allowlist 更新／docs/log。**briefing VM・縦 card-presenter・moment は不変更**。
