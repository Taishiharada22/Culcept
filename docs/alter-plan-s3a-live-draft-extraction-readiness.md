# S3A Readiness — live draft extraction to review screen

> 命名（CEO 2026-06-04）: **S3A = live draft extraction to review screen**。
> 以前の「S5」は live VLM + save smoke に近い意味だったため**使わない**。
> S3A の到達点は **確認画面まで**。保存はしない。

## 0. 目的（ゴールから逆算）

```
在app入口から画像を選ぶ
 → live VLM で cells を作る
 → ShiftReviewGrid 確認画面に出す
 → 人間が元画像と照合する
```

ここまで。**保存（反映）はしない。** `PLAN_SHIFT_IMPORT_SAVE=false` を絶対維持。

```
live VLM = allowed after CEO gate
DB保存   = not allowed
反映     = not allowed
```

## 1. 重要な前提: 経路はほぼ実装済み（dev route が参照実装）

S3A は**新規開発ではなく「検証済み dev 経路の在app移植」**。`/plan/dev-shift-draft`
（`DevShiftDraftClient`）が既に下記を実装し、強い安全不変条件を守っている:

| 部品 | 実体 | 状態 |
|---|---|---|
| 画像選択（PNG/JPEG） | file input + `loadImageMetadata`（ObjectURL のみ・base64/dataURL 不使用） | ✅ |
| 行選択（本人行 + ヘッダ帯） | `AssistedRowSelector` | ✅ |
| 対象年月入力 | `targetMonth`（現在月固定にしない） | ✅ |
| crop / combined 生成 | `generateAssistedCrops` / `generateCombinedDraftImage` | ✅ |
| VLM 呼出（cost gate 付き） | `runDraftExtractionSubmit` → `extractShiftDraftAction` → `runExtractShiftDraft` | ✅ B1a/B1b staging 実証 |
| 結果 = cells のみ | `ExtractShiftDraftResult.cells`（`{day,date,rawCode,confidence}`・**Blob/base64/raw response 非混入**） | ✅ 構造的に保証 |
| 確認画面 | `ShiftImportModal` → `ShiftReviewGrid`（risk/unresolved/blank-risk 表示・曜日配置 fix 済 `b29760fd`） | ✅ |

→ **S3A は「この flow を在app入口（`ShiftImportEntryInner`）から、新 live flag 下で起動できるようにする」だけ。**

## 2. 在app入口から画像を渡す流れ（CEO項目1）

`ShiftImportEntryInner`（在app入口の本体）を `draftLiveEnabled` で分岐:

- **`draftLiveEnabled = true`（live VLM gate ON）**:
  ```
  入口ボタン → 画像選択 → AssistedRowSelector（本人行/ヘッダ帯）
   → 対象年月 → crop/combined 生成 → extractShiftDraftAction(live VLM)
   → cells → ShiftImportModal(cells, saveEnabled=false) → ShiftReviewGrid 確認画面
  ```
- **`draftLiveEnabled = false`（既定・本番）**: 現状の **fixture modal を維持**（= A案 debug fallback。CEO「debug fallback として残してよい」）。

## 3. `extractShiftDraftAction` をどう呼ぶか（CEO項目2）

dev route と**同一**: `runDraftExtractionSubmit({ year, month, daysInMonth, mode, generateCrops|generateCombined, callAction: extractShiftDraftAction, onActionStart })`。

- FormData は submit 内で crop Blob から構築（client は Blob を state に持たない）。
- `callAction` は DI seam（実 = `extractShiftDraftAction` / test = fake）。
- 結果 `ExtractShiftDraftResult`（ok: cells | error: {kind,message}）。**保存系は一切呼ばない。**

action 側 gate chain（既存・不変）: flag → staging allowlist + production deny → `GEMINI_API_KEY`+`B1B_VLM_MODEL` → 認証 user → file 検証 → **全通過後にのみ Gemini 呼出**（cost 防御）。

## 4. live VLM を許可する flag（CEO項目3・3 flag 分離）

**3 つを混ぜない**:

| 用途 | flag | prefix | 既定 | 評価 |
|---|---|---|---|---|
| 入口表示 | `NEXT_PUBLIC_PLAN_SHIFT_IMPORT_ENTRY_ENABLED` | NEXT_PUBLIC | OFF | client 直読（既存） |
| **live VLM** | **`PLAN_SHIFT_DRAFT_LIVE_ENABLED`**（新規） | なし（server-side） | OFF | server 読み → prop で client へ |
| 保存 | `PLAN_SHIFT_IMPORT_SAVE` | なし | **OFF 維持** | server-side（触らない） |

live flag を **server-side（非 NEXT_PUBLIC）**にする理由: live VLM は cost 入口。client が flip できない方が安全。`composeTimelineEnabled` / `calendarMonthGridEnabled` と同じ「server 評価 → prop」方式。

### ★ 決定が必要: 新 live flag と既存 `PLAN_SHIFT_DRAFT_HOST` の関係

action `extractShiftDraftAction` の現行 gate は `PLAN_SHIFT_DRAFT_HOST`（dev route 用）。在app live 経路をどう gate するか 2 案:

- **案α（action 非改変・推奨度中）**: `PLAN_SHIFT_DRAFT_LIVE_ENABLED` は**在app入口の表示/経路 gate のみ**。action は従来どおり `PLAN_SHIFT_DRAFT_HOST` で gate。
  - → 在app live smoke には **両方**必要（`PLAN_SHIFT_DRAFT_LIVE_ENABLED=true` ∧ `PLAN_SHIFT_DRAFT_HOST=true`）。defense-in-depth。
  - 短所: 名前が `_HOST`（dev route 由来）で在app用途に紛らわしい。dev route も同時に開く。
- **案β（action 1 行 OR・推奨）**: action の `flagOn` を `PLAN_SHIFT_DRAFT_LIVE_ENABLED === "true" || PLAN_SHIFT_DRAFT_HOST === "true"` に。
  - → `PLAN_SHIFT_DRAFT_LIVE_ENABLED` が CEO 意図どおり**唯一の live VLM gate**になり、dev route（`PLAN_SHIFT_DRAFT_HOST`）も従来どおり動く。
  - 変更は action 1 行（staging/key/auth gate は不変）。在app smoke は live flag 1 個で済む。

**推奨 = 案β**（CEO の「`PLAN_SHIFT_DRAFT_LIVE_ENABLED` = live VLM gate」意図に最も忠実・最小変更）。最終判断は CEO。

## 5. `GEMINI_API_KEY` の存在確認方法（値は出さない・CEO項目4）

- **presence boolean のみ**: `grep -qE "^GEMINI_API_KEY=" .env.local && echo set`（値は echo しない）。
- 実行時は action の gate が `apiKey.trim() === ""` で `env_misconfigured` を返す（値露出なし）。
- 現状確認済み（2026-06-04・値非表示）: `GEMINI_API_KEY` ✅定義 / `B1B_VLM_MODEL` ✅定義 / supabase URL = **staging ref**（production ref 非含有）。
- **禁止**: env 値の echo / log / commit / readiness への転記。

## 6. `PLAN_SHIFT_IMPORT_SAVE=false` 維持（CEO項目5）

- `ShiftImportModal` への `saveEnabled` は **false 固定**（在app live 経路でも `saveEnabled={false}`）。
- `ShiftReviewGrid` の「反映」は disabled placeholder（「反映（次段で有効化）」）のまま。
- import action（`import_shift_roster` 等）は**配線しない**。`PLAN_SHIFT_IMPORT_SAVE` env は触らない。

## 7. `ShiftImportModal` / `ShiftReviewGrid` への cells 受け渡し（CEO項目6）

- 抽出結果 `result.cells`（`ShiftReviewCell[]`）→ `ShiftImportModal.cells` → `ShiftReviewGrid`。
- `imageSrc` = 元画像 ObjectURL（確認画面の原稿 crop 照合用）。`riskReviewEnabled=true`。
- 曜日配置は `b29760fd` で修正済 → 実 2025年6月 cells も真の曜日に並ぶ。

## 8. raw画像 / base64 / VLM raw response を保存しない方針（CEO項目7）

既存 dev flow の不変条件を**そのまま継承**（新たな緩和を一切しない）:

- state は **ObjectURL string + 寸法 metadata のみ**（File/Blob を長期保持しない）。
- **base64 / dataURL を作らない**（`FileReader` 不使用・`createObjectURL` のみ）。
- localStorage に画像本体を入れない。
- action 結果は **cells のみ**（Blob/base64/raw response/API key 非混入・runner で構造保証）。
- ObjectURL は遷移/unmount で revoke。
- **commit 禁止**: 画像ファイル / base64 / VLM raw response / crop 画像 / .env 値。

## 9. 失敗時の表示（CEO項目8）

- action の `error.kind` → safe copy（`SAFE_MESSAGES`：timeout/rate_limited/model_error/invalid_response 等）をそのまま user 表示。
- raw error / stack / API key は出さない。
- error state に「もう一度試す（user 起点 retry）」「やり直す」。
- crop/decode 失敗は inline notice（画像本体は出さない）。

## 10. 追加 Gemini 連打を防ぐ条件（CEO項目9）

- **state machine による構造防止**: 抽出ボタンは `crop_review` 状態でのみ表示。`extracting` 中はボタン非表示 → 二重 submit 不可。
- VLM は **user の明示 action 時のみ**（auto 呼出なし）。
- retry は user 起点のみ（auto-retry なし）。
- 追加防御（S3A で入れる）: 抽出ボタンを in-flight 中 disabled（多重クリック吸収）。1 submit = 1 `callAction`（`runDraftExtractionSubmit` が保証）。

## 11. test 方針（CEO項目10）

- **render contract（renderToStaticMarkup・jsdom 不使用）**:
  - live flag OFF → 在app入口は fixture modal（live UI 非表示）。
  - live flag ON → 在app live 経路の初期 UI（画像選択）が render。
- **VLM は test で発火させない**: `callAction` を fake 注入 or fixture。実 Gemini 呼出なし。
- 既存 unit（reducer / `runDraftExtractionSubmit` / `runExtractShiftDraft` gate chain / `assistedDraftToShiftReviewCells`）は再利用。
- 新規: 在app入口の flag 分岐 render contract + saveEnabled=false 固定 + （案β採用時）action flag OR の gate test。
- tsc baseline 1112 維持。

## 12. smoke 手順（CEO項目11）

前提 env（staging・**値は設定するが log/commit しない**）:

```env
NEXT_PUBLIC_PLAN_SHIFT_IMPORT_ENTRY_ENABLED=true   # 入口
PLAN_SHIFT_DRAFT_LIVE_ENABLED=true                 # live VLM（新規・現状未定義）
PLAN_SHIFT_DRAFT_HOST=true                          # 案α時のみ追加（案β採用なら不要）
PLAN_SHIFT_IMPORT_SAVE=false                        # 保存 OFF 維持（絶対）
GEMINI_API_KEY=...                                  # 既存（staging）
B1B_VLM_MODEL=...                                   # 既存
NEXT_PUBLIC_SUPABASE_URL=...staging...              # 既存（staging ref）
```

手順:
1. 上記 env で dev server 起動（inline or .env.local は CEO 操作）。
2. ログイン（action は認証 user 必須）。
3. `/plan` →「シフト表」入口 → 画像選択（実 2025年6月シフト表）。
4. 本人行 + ヘッダ帯を選択 → 対象年月 = 2025-06 → crop 確認 → 「読み取る」。
5. live VLM 抽出 → 確認画面に**実 cells が 2025年6月の正しい曜日**で並ぶことを目視。
6. 元画像と照合（risk/unresolved/blank-risk を確認）。**「反映」は disabled のまま**（保存しない）。
7. smoke 後 env を戻す（live flag を未定義へ）。

## 13. flag 方針（再掲・混ぜない）

```env
入口:    NEXT_PUBLIC_PLAN_SHIFT_IMPORT_ENTRY_ENABLED=true
live VLM: PLAN_SHIFT_DRAFT_LIVE_ENABLED=true
保存:    PLAN_SHIFT_IMPORT_SAVE=false
```

## 14. S3A でやってよいこと

- live VLM を**明示 flag 下で**呼ぶ設計。
- 画像 → crop/combined → VLM → cells。
- cells を `ShiftReviewGrid` に表示。
- risk / unresolved / blank-risk を確認画面に出す。
- `saveEnabled=false` のまま。
- DB write なし。

## 15. S3A でやってはいけないこと（CEO項目12）

```
PLAN_SHIFT_IMPORT_SAVE=true
DB write
保存
import_shift_roster RPC 実行
production
追加 migration
M3-c auto-open seam
保存成功後の月grid遷移
push / PR / GitHub / deploy
raw画像 / base64 / VLM raw response の commit
```

## 16. アーキテクチャ判断（実装粒度・CEO 確認したい点）

在app live 経路は dev route と**同じ flow**が要る（画像→行選択→crop→VLM→cells→確認画面）。
重複実装は divergence を生むため、推奨は **共有化**:

- **推奨**: `DevShiftDraftClient` の core flow を共有 component `<ShiftDraftFlow variant onCells saveEnabled>` に抽出。
  - dev route = `<ShiftDraftFlow variant="dev">`（挙動不変 → 既存 test 維持）。
  - 在app入口 = `<ShiftDraftFlow variant="inapp" saveEnabled={false}>`（product copy・埋め込み chrome）。
  - → 1 つの検証済み flow を両者で共有（source of truth 一本化）。
- **代替（blast radius 最小）**: dev client を据え置き、在app入口に既存 module（reducer/crop/submit/action/AssistedRowSelector/ShiftImportModal）で薄い flow を組む（重複あり）。

最終粒度は CEO 判断。どちらでも **保存・DB・production 非接触**は不変。

## 17. readiness 後の分割（CEO 指定）

readiness OK なら小さく分けて進める:

```
S3A-1: live VLM flag + action wiring
       （新 flag PLAN_SHIFT_DRAFT_LIVE_ENABLED + server→prop plumbing
        + 案α/β の action gate 決定 + 既存 gate 不変の test）
S3A-2: review screen connection
       （在app入口 ShiftImportEntryInner を live flag で draft flow へ分岐
        + cells → ShiftImportModal(saveEnabled=false) → ShiftReviewGrid
        + 共有 or 薄い flow のアーキテクチャ採用）
S3A-3: local smoke
       （staging env + live flag + 実 2025年6月 画像で確認画面まで・保存なし）
```

各 step 後に validation + 報告 + 停止。

## 18. CEO に仰ぐ判断

1. **flag 関係**: 案α（action 非改変・両 flag 必要）/ 案β（action 1 行 OR・live flag 単独・**推奨**）。
2. **アーキテクチャ粒度**: 共有 `<ShiftDraftFlow>` 抽出（推奨）/ 在app薄 flow（重複・最小 blast）。
3. S3A-1 から着手してよいか（実装は承認後）。

独断で実装・live VLM 常時 ON・保存有効化・DB write・production・push はしない。
