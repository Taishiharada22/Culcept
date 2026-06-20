# S3A-2-pre — 共有 flow 抽出（案A）diff preview

> **これは diff preview（設計差分）であり実装ではない。** 本 doc 時点でコードは未変更。
> live VLM 未実行 / 保存なし / DB 非接触 / push なし。CEO の本実装 GO 後に S3A-2 で着手する。

## 0. 到達点（S3A-2 の範囲）

```
在app入口から画像を選ぶ → crop/combined → extractShiftDraftAction(live VLM)
 → cells → ShiftReviewGrid 確認画面（saveEnabled=false）
```
**ここまで。** `確認画面 → 保存 → DB → 月grid反映` は後続 gate（S3A-2 では禁止）。

---

## ★ 抽出境界の判断: component-variant（A1）より **hook（A2）を推奨**

GPT 案は `SharedShiftDraftFlow`（component を `variant="dev"/"inapp"` で分岐）。
独立分析の結論: **共有すべきは「危険なロジック」、分けるべきは「正当に異なる presentation」**。

| | A1: component-variant（GPT 原案） | **A2: hook 抽出（推奨）** |
|---|---|---|
| 共有単位 | flow 全体（JSX 込み）を 1 component に。variant で testid/copy/chrome/debug を分岐 | **state machine + ObjectURL lifecycle + crop/submit handlers を hook に**。JSX は各 consumer |
| dev JSX | **置換**（thin wrapper が `variant="dev"` を render） | **不変**（既存 JSX のまま、内部ロジックを hook 呼出に差替） |
| dev render-contract | variant="dev" が同一 testid/copy を出すか**再検証要**（割れリスク） | **JSX 不変＝構造的に green**（idle 静的描画は hook を exercise しない） |
| Blob/ObjectURL lifecycle | 1 実装（◎） | **1 実装（◎・hook が所有）** |
| presentation 差（dev debug chrome vs product clean） | variant 分岐で 1 component に混在（△ 肥大・条件分岐） | **各 consumer が自前 JSX（◎ 関心分離）** |
| blast radius | 大（dev JSX 置換 + 全 testid/copy параметр化） | **中（dev は内部差替のみ・JSX 温存）** |

**推奨 = A2。** 危険な部分（Blob/ObjectURL/VLM submit/連打防止/state machine）を hook で一本化しつつ、
**dev route の JSX を一切触らないため render-contract が構造的に green**（CEO 懸念「dev route を壊さない」を構造で担保）。
presentation は dev（debug 重）と in-app（product clean）で正当に異なるため、無理に 1 component へ寄せない。

> A1 も「案A: 共有 flow 抽出」の範疇。差は**抽出単位（component 全体 vs ロジック hook）**。最終決定は CEO。

---

## 1. 変更予定ファイル（A2 採用時）

| 区分 | ファイル | 変更 |
|---|---|---|
| 新規 hook | `app/(culcept)/plan/components/useShiftDraftFlow.ts` | state machine + ObjectURL lifecycle + crop/submit handlers（dev から抽出） |
| 移動(任意) | `lib/plan/shift/shiftDraftReducer.ts` ← `dev-shift-draft/devShiftDraftReducer.ts` | pure reducer を neutral 位置へ（dev→shared 依存方向の是正・**任意**） |
| 変更 | `app/(culcept)/plan/dev-shift-draft/DevShiftDraftClient.tsx` | inline useReducer/handlers → `useShiftDraftFlow()` 呼出。**JSX 不変** |
| 新規 | `app/(culcept)/plan/components/ShiftDraftInApp.tsx` | in-app product presentation（hook 消費・debug 無し・clean copy） |
| 変更 | `app/(culcept)/plan/components/ShiftImportEntryInner.tsx` | `draftLiveEnabled` で `<ShiftDraftInApp saveEnabled={false}>` か fixture modal を分岐 |
| 変更 | `app/(culcept)/plan/components/PlanShiftImportEntry.tsx` | `draftLiveEnabled` prop を受けて子へ |
| 変更 | `app/(culcept)/plan/PlanClient.tsx` | `draftLiveEnabled?: boolean` prop 追加 → `PlanShiftImportEntry` へ |
| 変更 | `app/(culcept)/plan/page.tsx` | `PLAN_FLAGS.shiftDraftLiveEnabled` を読み `<PlanClient draftLiveEnabled={...} />` |
| 変更 | `lib/plan/featureFlags.ts` | `shiftDraftLiveEnabled: process.env.PLAN_SHIFT_DRAFT_LIVE_ENABLED === "true"`（page 読取用・server-side） |
| 新規 test | `tests/unit/plan/shiftDraftInAppRenderContract.test.tsx` | flag OFF=fixture / ON=live shell（VLM fake）+ saveEnabled=false |
| 変更 test | `tests/unit/plan/shiftImportEntryRenderContract.test.tsx` | draftLiveEnabled 分岐の追加 assertion |

> dev の `runDraftExtractionSubmit` / `extractShiftDraftAction` / `generateAssistedCrops` /
> `generateCombinedDraftImage` / `AssistedRowSelector` / `ShiftImportModal` は**再利用（無改変）**。

## 2. 共有化する component / hook / reducer の名前

- **hook（新規・共有の核）**: `useShiftDraftFlow(opts)` — state/handlers/derived を返す。
  ```ts
  // 設計スケッチ（未実装）
  interface UseShiftDraftFlowOpts {
    vlmInputMode?: "split" | "combined";
    defaultYear?: number;
    defaultMonth?: number;
    // saveEnabled は flow ではなく consumer が ShiftImportModal に渡す（flow は抽出のみ）
  }
  interface ShiftDraftFlowApi {
    state: DevShiftDraftState;            // 既存 reducer の state
    targetMonthValue: string;
    notice: string | null;
    lastElapsedMs: number | null;
    // handlers（全て既存 DevShiftDraftClient から移設・ロジック不変）
    onFileInputChange, triggerFilePicker, fileInputRef,
    onRowChange, onRowConfirm, onCancel,
    setTargetMonthValue, handlePrepareCrops, onBackToRowSelect,
    handleExtract, onRetry, onOpenReview, onCloseReview, onSaveSucceeded,
  }
  ```
- **reducer（再利用）**: 既存 `devShiftDraftReducer`（pure・IO-free・product 品質）。`saved` 状態は
  `save_succeeded` でのみ到達＝**在app（saveEnabled=false）では未到達**。無改変で共有可。
  （任意: `shiftDraftReducer` に rename + `lib/plan/shift/` へ移動で dev 依存を解消）
- **presentation（共有しない）**: dev=`DevShiftDraftClient` JSX / in-app=`ShiftDraftInApp` JSX。

## 3. dev route がどう thin wrapper になるか

`DevShiftDraftClient` は **JSX を保ったまま**、冒頭の `useReducer`+各 `useCallback`+`useEffect(revoke)` を
`const flow = useShiftDraftFlow({ vlmInputMode })` に差し替えるのみ。
JSX 内の `state` → `flow.state`、`handlePrepareCrops` → `flow.handlePrepareCrops` 等の参照変更だけ。
→ **idle 静的描画の出力は不変**（render-contract green）。debug summary / 「検証 host」warning も温存。

## 4. in-app entry がどう product wrapper になるか

```tsx
// ShiftImportEntryInner.tsx（設計スケッチ・未実装）
export function ShiftImportEntryInner({ now, draftLiveEnabled }: Props) {
  const [open, setOpen] = useState(false);
  // ...入口ボタンは現状どおり...
  return (
    <>
      <button onClick={() => setOpen(true)} data-testid="plan-shift-import-entry">…</button>
      {open && (draftLiveEnabled
        ? <ShiftDraftInApp onClose={() => setOpen(false)} />   {/* live: 画像→VLM→確認画面 */}
        : <ShiftImportModal {...fixture} saveEnabled={false} … /> )} {/* fallback: fixture */}
    </>
  );
}
```
`ShiftDraftInApp` は `useShiftDraftFlow()` を消費し、`cells_loaded` で
`<ShiftImportModal cells={state.cells} saveEnabled={false} imageSrc={state.imageObjectUrl} … />` を出す。

## 5. `saveEnabled=false` がどこで固定されるか

- **3 重に固定**:
  ① `ShiftDraftInApp` が `ShiftImportModal` に `saveEnabled={false}` を**ハードコード**（在app live 経路は保存しない）。
  ② `PLAN_SHIFT_IMPORT_SAVE` env は触らない（既定 false／本 phase で読まない）。
  ③ `ShiftImportModal`/`ShiftReviewGrid` の保存 controller は `saveEnabled=false` で dormant（「反映」disabled placeholder）。
- test で `saveEnabled=false` の render を固定。

## 6. `draftLiveEnabled` がどこから渡るか

```
PLAN_SHIFT_DRAFT_LIVE_ENABLED (env, server)
 → featureFlags.ts: PLAN_FLAGS.shiftDraftLiveEnabled
 → plan/page.tsx（server）: <PlanClient draftLiveEnabled={PLAN_FLAGS.shiftDraftLiveEnabled} />
 → PlanClient: <PlanShiftImportEntry draftLiveEnabled={...} />
 → ShiftImportEntryInner: live 経路 or fixture fallback
```
`composeTimelineEnabled` と同方式（client 直読み不可・server 評価→prop）。既定 false。

## 7. Blob を state に持たないこと

既存 reducer の型で**構造的に禁止**（state に File/Blob field なし）。hook 抽出後も型は不変。
crop の Blob は `handlePrepareCrops`/`handleExtract` の関数スコープ内のみ（ObjectURL 化して string で保持）。

## 8. ObjectURL revoke lifecycle

hook が `useEffect`（`currentObjectUrls(state)` の前回/今回差分で revoke）+ unmount cleanup を**所有**。
- crop_review 離脱 → 3 crop URL revoke（元画像は持ち越し）。
- `saved`/`idle` → 全 URL revoke。
- cells_loaded への遷移は元画像 URL 持ち越し（確認画面で原稿照合に必要）。
→ dev/in-app で**同一 lifecycle**（hook 一本）。

## 9. base64 / dataURL / raw response を保持しないこと

- 画像は `URL.createObjectURL` のみ（**FileReader 不使用**＝base64/dataURL を作らない）。
- action 結果は cells-only（`runExtractShiftDraft` が Blob/base64/raw response/API key を構造的に排除）。
- localStorage に画像本体を入れない。
- **commit 禁止**: 画像 / base64 / VLM raw response / crop 画像。

## 10. VLM は user action 時だけ呼ぶこと

`handleExtract`（「読み取る」ボタン）押下時のみ `runDraftExtractionSubmit → extractShiftDraftAction`。
auto 呼出なし。auto-retry なし（retry は user 起点）。hook 化で挙動不変。

## 11. 連打防止

state machine による構造防止: 「読み取る」は `crop_review` のみ表示 → `extracting` 中は非表示＝二重 submit 不可。
追加で in-flight 中ボタン disabled。1 submit = 1 `callAction`（`runDraftExtractionSubmit` 保証）。

## 12. 失敗時の safe error 表示

action `error.kind` → `SAFE_MESSAGES`（timeout/rate_limited/model_error/invalid_response 等）。
raw error/stack/API key 非露出。`error` state に user 起点 retry。in-app も同 safe copy を表示。

## 13. 既存 dev route render contract の維持

**A2 の最大利点**: `DevShiftDraftClient` の JSX を触らない（内部ロジックを hook に移すだけ）→
`devShiftDraftClientRenderContract`（idle 静的描画の testid/copy: `dev-shift-draft-host`/`data-state`/
「検証 host」「製品の取り込み入口ではありません」/file-input/pick-image）は**構造的に green**。
着地条件: 同 test green を S3A-2 の必須ゲートにする。

## 14. in-app fixture fallback が残るか

**残る。** `draftLiveEnabled=false`（既定・本番）→ 現状の fixture modal（A案 debug fallback）。
live で詰まった時の確認手段として温存（CEO 方針）。

## 15. tests / tsc plan

- **dev render contract**: 不変で green（A2）。
- **新 in-app render contract**: flag OFF=fixture / ON=live shell（初期=画像選択 UI）。**VLM は fake/不発火**。saveEnabled=false 固定。
- **hook ロジック**: 中核は既存 `devShiftDraftReducer` / `runDraftExtractionSubmit` の unit test が既にカバー（再利用）。hook は薄い wiring。
- **flag 分岐**: `shiftImportEntryRenderContract` に draftLiveEnabled 分岐 assertion。
- **tsc**: 1112 維持目標（新 prop/hook の型整合）。
- jsdom 不使用（renderToStaticMarkup 規約）＝interaction は reducer/submit の pure test で担保。

## 16. commit 対象候補（S3A-2 本実装時・**今は commit しない**）

§1 の全ファイル（hook + dev 差替 + ShiftDraftInApp + plumbing 4 file + featureFlags + test 2）。
分割案: `S3A-2-1`=plumbing+flag、`S3A-2-2`=hook 抽出+dev 差替（render-contract green 確認）、`S3A-2-3`=ShiftDraftInApp 接続+test、`S3A-2-smoke`。

## 17. まだ実行していないこと

- 上記コードは**未実装**（本 doc は設計差分のみ）。
- live VLM 未実行 / 保存なし / DB 非接触 / migration なし / M3-c なし / production なし / push なし。
- raw画像 / base64 / VLM raw response の生成・commit なし。

---

## 本実装 GO の判断材料（CEO 確認事項）

1. **抽出境界**: A2(hook・推奨) / A1(component-variant・GPT 原案)。
2. reducer を移動・rename するか（neutral 化）/ 現状維持（最小）。
3. 上記で本実装 GO なら `S3A-2-1`（plumbing+flag）から着手。

禁止維持: `PLAN_SHIFT_IMPORT_SAVE=true` / DB write / 保存 / `import_shift_roster` RPC / production /
追加 migration / M3-c auto-open / 保存成功後の月grid遷移 / push・PR・GitHub・deploy / raw画像・base64・VLM raw response commit。
