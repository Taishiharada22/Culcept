# S3A-2-3 Local Smoke Readiness — 在app live draft flow → 確認画面まで（保存なし）

> 目的: `/plan` 入口から **実画像** で `画像 → row/header 選択 → crop 確認 → live VLM →
> cells_loaded → ShiftImportModal / ShiftReviewGrid` までを通す。**保存は絶対にしない**。
> これが通れば「画像 → VLM → 人間確認」までが本流入口で成立する。

## 0. 到達点と非到達点

```
到達:   /plan「シフト表」→ 実2025年6月画像 → 本人行/ヘッダ選択 → crop確認
        → 「この画像で読み取る」(live VLM) → cells_loaded → 確認画面（正しい曜日で cells）
非到達: 確認画面 → 保存 → DB → 月grid反映（後続 gate・S3A-2-3 では禁止）
```

## 1. ★ 必須 env（staging・smoke 時のみ・値は log/commit しない）

```env
NEXT_PUBLIC_PLAN_SHIFT_IMPORT_ENTRY_ENABLED=true   # 在app入口を出す
PLAN_SHIFT_DRAFT_LIVE_ENABLED=true                 # live VLM flow を出す（server→prop）
PLAN_SHIFT_VLM_INPUT_MODE=combined                 # ★必須（下記理由）
PLAN_SHIFT_IMPORT_SAVE=false                        # ★絶対維持（保存しない）
GEMINI_API_KEY=...                                  # 既存（staging・設定済み）
B1B_VLM_MODEL=gemini-2.5-pro                         # 既存
PLAN_ROUTE_LIVE=true                                # /plan 描画（既存）
NEXT_PUBLIC_SUPABASE_URL=...staging...              # 既存（staging ref・production deny 通過）
```

### ★ なぜ `PLAN_SHIFT_VLM_INPUT_MODE=combined` が必須か（最重要）

- **client 側**（ShiftDraftInApp / useShiftDraftFlow）は **combined-biased**
  （`resolveShiftDraftVlmInputMode`: 既定/不正→combined・split は明示時のみ）。
- **action 側**（extractShiftDraftAction / runExtractShiftDraft）は **split-biased**（無改変）
  （`PLAN_SHIFT_VLM_INPUT_MODE === "combined" ? "combined" : "split"`）。
- action は FormData の mode を server 再評価して照合する（mixed-input 禁止）。
- → **env="combined" を設定すると双方 combined で一致**（= 成功経路・Phase A/B 実証済み）。
- **env 未設定/不正の場合: client=combined / action=split → mode 不一致で `invalid_input`**
  （fail-loud。silent な列ズレデータより安全だが、smoke は失敗する）。
- **したがって smoke では `PLAN_SHIFT_VLM_INPUT_MODE=combined` を明示設定する。**

### action gate（S3A-1）の確認

- action flag gate = `PLAN_SHIFT_DRAFT_LIVE_ENABLED || PLAN_SHIFT_DRAFT_HOST`。
- `PLAN_SHIFT_DRAFT_LIVE_ENABLED=true` で通過（`PLAN_SHIFT_DRAFT_HOST` は不要）。
- さらに staging allowlist + production deny + GEMINI_API_KEY + B1B_VLM_MODEL + 認証 user を通過後にのみ Gemini 呼出。

## 2. 起動方法

`.env.local` 直編集は避け、inline env で dev server 起動（CEO 操作可）:

```sh
NEXT_PUBLIC_PLAN_SHIFT_IMPORT_ENTRY_ENABLED=true \
PLAN_SHIFT_DRAFT_LIVE_ENABLED=true \
PLAN_SHIFT_VLM_INPUT_MODE=combined \
npm run dev
```

（`GEMINI_API_KEY` / `B1B_VLM_MODEL` / `PLAN_ROUTE_LIVE` / supabase URL / `PLAN_SHIFT_IMPORT_SAVE=false` は
`.env.local` 既存値を使用。`PLAN_SHIFT_IMPORT_SAVE=true` は**絶対に設定しない**。）

## 3. 手順

1. ログイン（action は認証 user 必須）。
2. `/plan` → ヘッダ付近「**シフト表**」ボタンを押す。
3. （draftLiveEnabled=true なので）**live flow（ShiftDraftInApp）**が開く →「画像を選ぶ」。
4. **実 2025年6月シフト表画像**（PNG/JPEG）を選択。
5. 本人行（原田行）+ ヘッダ帯を選択 → **対象の年月 = 2025-06** を選ぶ。
6. 「クロップを確認」→ combined/header/personRow プレビューで画像・月の一致を目視。
7. 「**この画像で読み取る**」→ live VLM 抽出（user action 時のみ発火）。
8. `cells_loaded` →「確認画面を開く」→ **ShiftReviewGrid** に cells が **2025年6月の正しい曜日**で並ぶ。
9. 元画像と照合（risk / unresolved / blank-risk を確認）。
10. **「反映」は disabled のまま**（`saveEnabled=false`・保存しない）を確認。

## 4. 合否チェック（観測項目）

| # | 確認 | 期待 |
|---|---|---|
| 1 | 入口押下で live flow が開く | ShiftDraftInApp（fixture でない） |
| 2 | 画像選択 → 行/ヘッダ選択 → crop 確認 | 各ステップ遷移 |
| 3 | 「読み取る」で live VLM 発火 | cells_loaded 到達（auto 実行でない） |
| 4 | 確認画面に cells | **2025年6月の正しい曜日**に配置（曜日 fix 効果） |
| 5 | 元画像照合 | imageSrc で原稿 crop 表示 |
| 6 | 保存 | **「反映」disabled**・DB write なし |
| 7 | 失敗時 | safe error（raw/key 非露出）+ retry |

## 5. 失敗時の切り分け

- `invalid_input`（読み取り直後）→ **`PLAN_SHIFT_VLM_INPUT_MODE=combined` 未設定**を最優先で疑う（client combined / action split の不一致）。
- 「下書き取り込みは現在ご利用いただけません」→ `PLAN_SHIFT_DRAFT_LIVE_ENABLED` 未設定（action flag gate）。
- 「設定が完了していません」→ staging URL / GEMINI_API_KEY / B1B_VLM_MODEL 不足。
- 「ログインが必要です」→ 未認証。
- fixture が出る（live flow でない）→ `PLAN_SHIFT_DRAFT_LIVE_ENABLED` の server→prop が届いていない（dev server 再起動で env 反映）。

## 6. smoke 後

- dev server を停止（inline env なので停止で env は消える）。
- 観測結果を報告（合否 + 代表 cells の曜日正置 + 「反映」disabled の確認）。
- 成功すれば「画像→VLM→人間確認」までが本流入口で成立。次段（保存）は別 gate。

## 7. S3A-2-3 で絶対にやらないこと

```
PLAN_SHIFT_IMPORT_SAVE=true
DB write / 保存 / import_shift_roster RPC 実行
production
追加 migration
M3-c auto-open seam
保存成功後の月grid遷移
push / PR / GitHub / deploy
raw画像 / base64 / VLM raw response の commit
```

## 8. 既知の caveat（将来 scope）

- action の vlmInputMode normalize は split-bias のまま（dev route 互換のため無改変）。
  client は combined-bias。**env 明示（combined）で一致**させる前提。
- 恒久的に揃えるなら action 側 normalize も combined-bias 化（proven path 変更・別 gate）。
