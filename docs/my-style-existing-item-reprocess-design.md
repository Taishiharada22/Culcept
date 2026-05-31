# M2: 既存 item の背景再処理（reprocess）— read-only audit / mini plan（2026-06-01）

**フェーズ**: M2-0（read-only audit + 実装分割提案。コード変更なし）
**承認待ち**: CEO（本 audit が安全と判断されれば M2-1 以降へ）

D6 完了後の次フェーズ。 既存 wardrobe item の背景透過（cutout）を、 ユーザーが任意で**個別に再処理**できるようにする。 自動一括処理は禁止。 imageUrl が失われた item の自動復旧は不可能であり、 正直に「再登録が必要」と扱う。

> ⚠️ **触らない領域**（M2 共通）:
> 一括自動再処理 / 既存 item 自動削除 / imageUrl 無し item の無理な復旧 /
> IndexedDB 削除 / localStorage 削除 / server purge / My-Style persistence 大改修 /
> cutout アルゴリズム大改修 / 外部 API / package 追加 / Supabase / DB / migration /
> D6 scoreCandidate / UI 全体再設計 / push / deploy / production canary

---

## 1. M2-0 audit 結果（全 8 項目・ファイル/行の根拠付き）

### ① My-Style closet / item card 実装箇所
- メインページ: `app/(immersive)/my-style/page.tsx`
- item card: `_components/WardrobeTab.tsx`（カテゴリ別グリッド）+ page 内 ShowcaseRail（横スクロール、 page.tsx 602 / 627）。 いずれも tap → `onSelectItem(item.id)` → `setActiveItemId`
- **item 詳細モーダル**: `page.tsx` 1180–1230。 `activeItem`（`ItemInsight` memo, 1029–1044）の `.item` が `WardrobeItem`。 `ImageSurface image={activeItem.item.imageUrl}`（1194）+ バッジ + 「セットアップに追加」（1199–1206）
- **→ 「背景をきれいにする」導線の自然な設置場所はこの詳細モーダル**（item の原画が大きく表示される唯一の面）

### ② item 編集 / 削除 / 保存の既存フロー
- **保存（追加）**: `handleItemSave`（page.tsx 812–816）→ `setState((prev) => ({ ...prev, wardrobe: [...prev.wardrobe, item] }))`
- **保存の中枢**: `setState` wrapper（784–791）→ `finalizeSavedState` + `_revision` 単調増加 → persist `useEffect`（820–840）が自動で IDB + localStorage へ書込
- **個別 item の編集 / 削除 UI は現状存在しない**。 詳細モーダルは read-only + 「セットアップに追加」のみ。 delete-all（revision-aware）はあるが個別 item mutation はない
- **→ M2 が「詳細モーダルから個別 item を mutate する」最初の導線**になる。 ミューテーション手段は `handleItemSave` と同じ `setState((prev) => ({...prev, wardrobe: prev.wardrobe.map(...)}))` パターン

### ③ BackgroundRemover を既存 item に再利用できるか → **Yes（無改修）**
- `BackgroundRemoverProps`（`_components/BackgroundRemover.tsx` 22–33）は既に:
  - `imageFile?: File` **または** `imageUrl?: string`（"If provided instead of imageFile, use this data URL directly"）
  - `onApply: (draft: CutoutDraft) => void` / `onSkip: () => void` / `onCancel?: () => void`
- useEffect（74–82）: `externalImageUrl` があればそれを `originalUrl` にして処理。 `processImage`（85–122）は `imageFile ?? externalImageUrl ?? originalUrl` を `processImageCutout` に投入
- **→ `<BackgroundRemover imageUrl={item.imageUrl} onApply={…} onSkip={…} onCancel={…} />` で既存 item を再処理できる。 BackgroundRemover 自体への変更は不要**

### ④ processImageCutout / cutoutBrowser を既存 item に使えるか → **Yes（production 稼働中）**
- `processImageCutout(input: Blob | string, …)`（`_lib/cutoutBrowser.ts` 190–212）は **string（dataURL）を直接受理**。 browser-only・throw しない（SSR/失敗時は `skipped`/`failed` を返す）
- **production で既に稼働**: `PhotoAddWizard.tsx` 22–24 が `processImageCutout` / `cutoutResultToItemFields` / `cutoutDraftToItemFields` を import、 `BackgroundRemover.tsx` 15 が `processImageCutout` / `resolveApplyDraft` を import
- cutoutBrowser.ts 冒頭の「production path には接続しない」コメント（9–11 行）は **C1L-4a 当時の制約で、 現在は stale**（C1L-4b/4c で接続済）
- 写像 helper（pure・テスト容易）: `cutoutDraftToItemFields(draft)`（282–290, manual も保持）/ `cutoutResultToItemFields(result)`（227–235）

### ⑤ imageUrl から File/Blob または dataURL を処理できるか → **imageUrl は既に dataURL**
- `resizeImage`（`_lib/constants.ts` 60–88）は `canvas.toDataURL("image/jpeg", 0.85)` を返す（82 行）。 PhotoAddWizard は登録時 `imageUrl = await resizeImage(imageFile, 400, 800)`（224–227）
- **→ imageUrl は base64 JPEG dataURL（400×800 リサイズ済）。 File/Blob 化は不要、 `processImageCutout(item.imageUrl)` に string をそのまま渡せる**
- **CORS 懸念なし**: dataURL は same-origin 扱いで `getImageData` が tainted にならない。 `loadImageElement`（116–123）が `crossOrigin` 未設定でも dataURL なら安全。 （仮に remote http URL なら getImageData が SecurityError → catch → `failed`。 だが imageUrl は dataURL なので該当しない）

### ⑥ originalUrl / imageUrl / cutoutUrl の優先関係
- `imageUrl`: 原画（JPEG dataURL）。 表示の base / fallback
- `originalUrl`: 現行 add flow では基本未設定（cutoutBrowser 214 行「imageUrl が原画を兼ねる」）。 旧 `backgroundRemoval.ts` 307 のみ設定。 **M2 では imageUrl を原画として扱い、 originalUrl は触らない**
- `cutoutUrl`: 透過 PNG。 **/plan 表示優先**: `getWardrobeDisplayImageUrl`（`plan/tabs/_calendar-outfit/wardrobeToOutfit.ts` 129–141）= `cutoutStatus === "success" && cutoutUrl` を最優先、 それ以外は `imageUrl` フォールバック
- 3 つとも localStorage では `stripHeavyImageUrls`（state.ts 1341–1352）で除去、 IDB が正本、 reload 時 `mergeRestoredWardrobeImageFields`（1373–1404）で id 一致復元

### ⑦ IDB / localStorage / server snapshot の保存経路
- 中枢は persist `useEffect`（page.tsx 820–840）:
  - **IDB**: `cacheState("my-style-state", normalizeSavedState(state))`（825, `_lib/stateCache.ts` 20 が `objectStore.put`）— full state + 画像（無制限・**正本**）。 Calendar/plan が読む
  - **localStorage**: `createPortableStateSnapshot(state)` → `stripHeavyImageUrls` で imageUrl/cutoutUrl/originalUrl 除去した軽量 snapshot（828, 5MB quota）
  - **server**: snapshot を sync（offlineManager / bridge、 同じく heavy 画像なし）
- reload 復元: 軽量 localStorage を base に、 IDB の画像を `mergeRestoredWardrobeImageFields` で復元（C1L-6 fix, 1354–1404）
- **→ cutoutUrl は imageUrl と完全に同じ経路。 M2 は `setState` で cutoutUrl を足すだけで、 既存の C1L-6 機構がそのまま永続化・復元を処理する。 新しい永続化コードは不要**

### ⑧ cutoutStatus = success / needs_review / failed の扱い
- `resolveApplyDraft`（cutoutBrowser.ts 255–274, BackgroundRemover「適用」時）:
  - 手動編集あり → `success` / `manual` / 編集結果 dataUrl
  - 編集なし & V1 が cutout 出した（success/needs_review）→ `success` / `heuristic_v1`（**needs_review を success に昇格**）
  - 編集なし & V1 失敗 → `failed`/`skipped` / `none`（原画を cutout にしない）
- `cutoutDraftToItemFields`（282–290）: adopted（success/needs_review）& dataUrl → `cutoutUrl` 保存 + method。 **非 adopted のときは `cutoutUrl` キー自体を含めない**（既存 cutoutUrl を spread merge で消さない）
- /plan は `cutoutStatus === "success"` のみ cutoutUrl 採用

---

## 2. 既存 item 再処理が可能な条件
1. `item.imageUrl` が非空の dataURL（= 原画が残っている）
2. ブラウザ環境（canvas / getImageData 利用可。 SSR 不可だが UI は client）
3. それ以外の前提なし（属性・cutout 既存値の有無は不問）

→ **imageUrl があれば必ず再処理導線を出せる。 失敗しても `processImageCutout` が throw せず `failed`/`skipped` を返すので UI は壊れない**

## 3. imageUrl なし item の扱い（CEO 指定の正直さ）
- imageUrl が空/未設定の item は **再処理不可**（処理する原画が無い）
- **導線を出さない**（ボタン非表示 or disabled）+ 文言「写真が残っていないため再処理できません。 もう一度登録すると背景をきれいにできます」
- **自動復旧は行わない**。 imageUrl を失った item は再登録が必要、 と正直に表示

## 4. 保存経路（M2 が使うもの）
- **`setState` のみ**を呼ぶ。 IDB / localStorage / server へは直接書かない
- `setState((prev) => ({ ...prev, wardrobe: prev.wardrobe.map((w) => w.id === id ? { ...w, ...cutoutFields } : w) }))`
- persist `useEffect` が IDB（画像込み full state）+ localStorage（軽量）+ server（軽量）へ自動反映
- **不変条件**: merge は `...item` を base にするため imageUrl / 属性 / 他フィールドは保持。 cutoutUrl / cutoutStatus / cutoutConfidence / cutoutMethod のみ更新

## 5. /plan 反映の見込み
- /plan は `getWardrobeDisplayImageUrl` で `cutoutStatus === "success" && cutoutUrl` を最優先表示（C1L-5 既存実装）
- M2 で `success` cutout を保存すると、 IDB 正本が更新され、 /plan の次回読込で自動的に透過表示へ切替（C1L-5 経路は不変、 接続作業ゼロ）
- needs_review/failed のときは /plan は imageUrl 表示のまま（既存挙動）

## 6. 実装 GO 可能か → **可能（low risk）**
核心は「BackgroundRemover を `imageUrl` prop で再利用 → `onApply(draft)` → `cutoutDraftToItemFields(draft)` → `setState` で該当 item に merge」。 新規エンジンコード・新規永続化コードはゼロ。 既存の battle-tested な C1L 機構に乗るだけ。

---

## 7. 実装分割案

| | スコープ | テスト | リスク |
|---|---|---|---|
| **M2-0** | 本 audit + mini plan（docs-only） | — | なし（read-only） |
| **M2-1** | pure helper + unit test（1 commit） | あり | 低（純関数） |
| **M2-2** | 詳細モーダルに「背景をきれいにする」導線 + BackgroundRemover 接続 + onApply→helper→setState（1 commit, UI） | render/import smoke | 中（UI + state） |
| **M2-3** | 実機確認 + close docs（docs-only） | 実機 | なし |

CEO 推奨 4 分割のうち **M2-2（導線）と M2-3（BackgroundRemover 接続）を 1 commit に統合**した。 理由: ボタンだけ置いても処理が無ければ無意味で不可分。 ただしテスト容易性のため **ロジックを M2-1 の pure helper に全寄せ**し、 UI 層（M2-2）を薄くする（CEO の「導線と保存処理は分ける」指針に合致）。

### M2-1 で作る pure helper（`app/(immersive)/my-style/_lib/reprocessItem.ts` 新規）
- `canReprocessItem(item: WardrobeItem): boolean` — `imageUrl` が非空 dataURL かを判定（imageUrl なし item の導線出し分けに使う）
- `mergeCutoutDraftIntoItem(item, draft: CutoutDraft): WardrobeItem` — `cutoutDraftToItemFields(draft)` を使い `{ ...item, ...fields }` で merge。 **draft が非 adopted（cutoutUrl なし）かつ item が既に success cutout を持つ場合は item をそのまま返す**（過去の良好な cutout を degrade させない安全弁）
- `buildReprocessWardrobeUpdater(itemId, draft): (prev: SavedState) => SavedState` — setState 用 updater factory（pure, `wardrobe.map` で該当 id のみ merge、 他は不変参照）

### M2-2 の UI 設計詳細
- 詳細モーダル（page.tsx 1180–1230）に「背景をきれいにする」ボタンを追加（`canReprocessItem` が true のときのみ active）
- 押下 → 独立 state `reprocessItemId` をセット → BackgroundRemover を**独立 overlay**で mount（modal-in-modal の z-index 競合を避けるため詳細モーダルとは排他）
- `onApply(draft)` → `setState(buildReprocessWardrobeUpdater(id, draft))` → `pushNotice("背景をきれいにしました")` → overlay close
- `onSkip` / `onCancel` → overlay close（item 不変）
- imageUrl なし item → ボタン非表示 or disabled + 正直な文言

---

## 8. STOP 条件
- imageUrl から再処理できない（dataURL でない・remote URL で CORS）→ **audit 結果は dataURL 確定なので該当しない見込み。 実機で念のため確認**
- BackgroundRemover が既存 item に再利用できない → **prop で対応済、 該当しない見込み**
- 保存後に item が消える → setState merge は `...item` base なので消えない。 万一発生で STOP
- IDB / localStorage / server snapshot の整合が崩れる
- My-Style persistence の再発リスク（白抜き事故 C1L-6）が出る → cutoutUrl のみ追加・imageUrl 不変で回避見込み
- 外部 API が必要になる / UI 大改修が必要になる

---

## 9. GO / NO-GO
- **M2-0: audit 完了。 設計は low risk。 実装 GO 可能と判断**
- M2-1 着手は CEO の GO 後
