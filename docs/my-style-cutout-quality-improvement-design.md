# M3: cutout 品質改善（復活ブラシ + 控えめ post-process）— design / roadmap（2026-06-01）

**承認**: CEO（Phase 1 GO 済・Phase 2 GO・Phase 3 deferred）

D2 で導入された C1L 系背景除去エンジンの実機品質を、 **自動精度の追求ではなく「ユーザーが直せる」UX** を優先して向上させる。 既存 backgroundRemovalV1 / BackgroundRemover の大改修は行わず、 復活ブラシと控えめな post-process のみ追加。

> ⚠️ **触らない領域**（M3 共通）:
> backgroundRemovalV1 本体改修禁止 / 一括自動再処理 / imageUrl 上書き /
> item 削除 / IDB-localStorage-server 直接書込 / My-Style persistence 大改修 /
> BackgroundRemover 大改修 / cutout アルゴリズム改修 / /plan 改修 /
> UI 全体再設計 / 外部 API / package 追加 / Supabase / DB / migration /
> push / deploy / production canary

---

## 1. 現状アルゴリズム精読と 5 つの構造的欠陥

`backgroundRemovalV1.ts` 全 537 行を精読した結果、 アルゴリズムは「辺サンプリング → 適応 tolerance → flood-fill → 囲み穴 pass → 影 pass → 二値 mask 出力」。 実機で観測される 2 症状（背景が部分的に残る / 服自体が一部消える）の根本原因:

| # | 欠陥 | 結果として出る症状 | 対応策 |
|---|---|---|---|
| **D1** | 二値 mask（0/1） — 部分透明 alpha を扱えない | エッジに「ジャギー」「色フリンジ」「まだら残留」 | feathering / deep matting |
| **D2** | 色距離だけで判定 — テクスチャ / グラデ / 影は色だけでは分けられない | グラデ背景の濃淡 / 紙背景の grain が「中間距離」で flood-fill が止まる | morphology close / GMM 風 2nd pass |
| **D3** | flood-fill が「届かない」隔絶領域 — 服内の白タグ・裏地 | 服内の小領域が「囲み穴」で誤抜き、 または背景の小領域が残る | morphology open / 復活ブラシ |
| **D4** | shadow pass の greedy 性 — 3 iter で背景隣接画素を順次拡張 | 服の暗い縁 / 影と一体化した袖口が削られる | iter / TOL 調整 / 復活ブラシ |
| **D5** | confidence と人間視覚のギャップ | 「精度 100%」表記でも視覚的に不満 | UI 文言調整（別スライス） |

**所見**: D1（二値判定）が最も根本的。 古典 flood-fill 系は alpha を 0/255 でしか出せず、 エッジで必ず破綻する。 D2-D4 は heuristic 調整で改善できるが、 D1 を本質的に解くには alpha matting / deep matting が必要。

---

## 2. 文献調査の結論

### 階層 1: 古典精度向上（外部依存なし）
- **Border matting + feathering**: hard mask の境界周辺 N px の alpha をグラデ化（CSAIL Levin et al. 2006 / Brown CS Lab）
- **Morphological close / open**: dilate→erode で背景の小穴を埋め、 erode→dilate で服内の誤抜きを救済
- **Trimap-based refinement**: 確定前景 / 確定背景 / 不明領域の 3 値マスクで alpha 推定

### 階層 2: 軽量モデル（package 追加が必要）
- MODNet / MediaPipe Selfie — portrait 専用、服には不向き

### 階層 3: SOTA（ブラウザで実用化進行中、 2026 年現在）
- **RMBG-2.0 / BiRefNet** (Transformers.js): ~40-50MB モデル、 服・物体に強い汎用 matting
- **@imgly/background-removal-js**: U²-Net、 80MB、 商用ライセンス確認
- **rembg-webgpu**: WebGPU 加速、 production-grade

### 品質の階段
古典 heuristic（現状）→ 古典 + 後処理（Phase 2 案）→ deep matting（Phase 3 案）で品質飛躍が起きる。 ただし bundle size（30-80MB）と商用ライセンスのトレードオフ。

---

## 3. Phase 分割（CEO 承認順）

### Phase 1: 即実行（完了）
| | 内容 | 状態 |
|---|---|---|
| **M2-extra** | 案 B 実装（WardrobeCard tap → activeItem 経路）。 `<WardrobeCard>` の image 全面に透明 button を z-[1] で被せ、 既存 hover overlay を z-[2] へ。 quality badge / color swatch は pointer-events-none で透過 | ✅ `415d6ccd` |
| **M3-0** | 本 docs + decision-log | ✅ 本コミット |

### Phase 2: 復活ブラシ + 控えめ post-process（GO 済・続けて実装）
| | 内容 | リスク |
|---|---|---|
| **M3-1** | pure helper `cutoutPostProcess.ts`（保守的 morphology + 境界 feathering）+ unit tests | 低 |
| **M3-2** | BackgroundRemover に「戻す」ボタン追加（消しゴムの双対）+ post-process を **初期 auto cutout のみ** に適用（manual 編集後は再適用しない） | 低-中 |
| **M3-3** | close docs + 実機検証 | なし |

### Phase 3: deep matting（**deferred**、 別 audit で再検討）
- package 追加 / モデルダウンロード UX / 商用ライセンス確認 / bundle 影響評価が必要
- 現 M2-3 制約「外部 API / package 追加なし」に抵触
- 記録のみ、 本フェーズでは着手しない

---

## 4. 復活ブラシ（unerase brush）設計

CEO 補正:
- 復活ブラシは **元画像（original image）** を参照して戻す
- imageUrl は絶対に上書きしない（cutoutUrl / cutoutStatus / cutoutMethod / cutoutConfidence のみ更新）
- 消しゴムと同じ操作感・同じブラシサイズ UI
- 文言は「消す」「戻す」 または「消しゴム」「復活」

### コア仕組み（MDN で挙動確認済み）
- `destination-over` = 既存の不透明前景は保ったまま、 透明部分にだけ新規描画が現れる
- `clip()` で円形領域だけに作用させると、 ブラシで撫でた円形領域だけ original が透明部分に補充される
- 公式: `result = new × (1 − existing_alpha) + existing × existing_alpha`

### 実装スケッチ
```ts
// 既存 originalUrl を Image() に decode して ref 保持（mount once）
const originalImgRef = useRef<HTMLImageElement | null>(null);

const restoreDab = (ctx, x, y, radius) => {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();                                  // 円形領域に限定
  ctx.globalCompositeOperation = "destination-over";
  ctx.drawImage(originalImgRef.current,
                0, 0, canvas.width, canvas.height);
  ctx.restore();
};
```

### UX 設計（消しゴムと同質感）
- toolbar: `[ 消す ] [ 戻す ]` を排他トグル（両方 OFF 可）
- 同一 size スライダー共有
- pointer ハンドラは既存 `handleEraserPointerDown/Move/End` のロジック流用（dab 関数だけ切替）
- ストローク終了で `setProcessedUrl(canvas.toDataURL("image/png"))` で commit
- `setEdited(true)` で manual 扱い（既存 resolveApplyDraft フロー踏襲）

### トレードオフ（正直に）
- 元画像が「白服 + 白背景」境界なら、 復活で周辺の白背景も戻る
- ユーザー意図に従う操作なので OK、 UI 文言で誘導
- ブラシサイズは消しゴムより小さめがデフォルト（誤復元防止）

---

## 5. 控えめ post-process（CEO 補正 3 厳守）

CEO 補正:
- radius / iter は小さく
- feather は境界だけ
- 服本体を削る方向に強くしない
- success 判定を無理に上げない
- 既存の manual 編集を上書きしない
- **post-process は 初期 auto cutout に対してだけ適用**。 ユーザー手動編集後の再適用は禁止

### 設計
- **新規 pure module**: `app/(immersive)/my-style/_lib/cutoutPostProcess.ts`
- **入力**: `{ data: Uint8ClampedArray (RGBA), mask: Uint8Array (0/1), width, height }`
- **出力**: `{ data: Uint8ClampedArray (RGBA, alpha 0..255 で feathered), mask: Uint8Array }`

### 適用するもの（保守的）
1. **Morphological closing 1 iter**（3×3 dilate → erode）: 背景内の小穴（数 px）を埋める。 **服本体は触らない**
2. **Morphological opening 0 iter（既定 off）**: 服内の誤抜き救済は復活ブラシで人間が判断するので、 自動 open は **既定 off**（option で on にできるが Phase 2 では使わない）
3. **Border feathering 1 px**: mask の境界画素のみ alpha を 0/255 から 128 程度のグラデに（背景側 1 px のみ・服側は触らない）

### やらないこと
- 大きな radius（≥ 2）の morphology
- 服本体の alpha 変更
- success/needs_review/failed 判定の閾値変更
- confidence 計算ロジックの変更
- mask の連結性破壊

### 適用ゲート（重要）
BackgroundRemover の `processImage` で **`processImageCutout` の直後のみ** 適用。 `setEdited(true)` 後の `handleReprocess` で再 process されたときは同じ flow を通る（OK、 edited はそこでリセット）。 stroke commit（消しゴム / 復活）は別 path で post-process を通らない。

---

## 6. 失敗時の挙動 / STOP 条件

| 条件 | 行動 |
|---|---|
| 復活ブラシで既存の消しゴムが壊れる | STOP・revert ではなく追加修正で復旧 |
| post-process で服が明らかに削られる | post-process を実質 no-op に絞る or skip flag 追加 |
| manual 編集後に勝手に post-process が再適用 | 適用ゲート見直し |
| imageUrl を触る必要が出る | STOP・設計やり直し |
| BackgroundRemover 大改修が必要 | STOP・別 audit |
| 外部 package が必要 | STOP・Phase 3 audit へ |
| テスト退化 | STOP・原因特定 |

---

## 7. 精度文言調整（Phase 2 では触らない）

CEO 補正 4:「精度 100% のような表示は慎重に」。 既存 UI の "精度 N%" badge（BackgroundRemover.tsx L275-283）は **本 phase では変更しない**（CEO が「文言変更が大きくなるなら別スライスでよい」と明示）。 別フェーズで検討:
- 「自動処理の目安」
- 「確認推奨 / 微調整できます」
- パーセント表記の段階化（高/中/低 ラベル）

---

## 8. GO / NO-GO
- **Phase 1（M2-extra + M3-0）: 完了**
- **Phase 2（M3-1 → M3-2 → M3-3）: 完了**
- **Phase 3（deep matting）: deferred**

---

## 9. Phase 2 実装結果（M3-3 close）

### 確定した最終形
| | commit | 概要 |
|---|---|---|
| **M3-1** | `f23aa601` | pure helper `cutoutPostProcess.ts`（morphology + feather、 defaults 保守的）+ 27 unit tests |
| **M3-2** | `18d0d4db` | BackgroundRemover に「復活」ブラシ追加 + post-process を初期 auto cutout のみに適用 |
| **M3-3** | （本コミット） | close docs + decision-log 完了エントリ |

### 復活ブラシ — 最終仕様
- toolbar 配置: `[ 消しゴム ]` の右に `[ 復活 ]`（emerald 色で区別、 排他トグル）
- 仕組み: `ctx.clip(circle)` + `globalCompositeOperation = "destination-over"` + `drawImage(originalImg)`
  → 既存の不透明前景は保持、 透明部分のみ original が補充される（MDN 検証済）
- 元画像 source: `originalUrl` を Image() に decode して useRef で保持（imageUrl は読むだけ）
- pointer ハンドラ: 既存 `handleEraserPointerDown/Move/End` を再利用、 内部 `brushDab` dispatcher が `restoreMode` で `eraseDab` / `restoreDab` を切替
- ブラシサイズスライダーは消しゴムと共有
- 排他制御: 「消しゴム」「復活」「比較」「元に戻す」全ての toggle が他モードを OFF にする

### post-process — 最終仕様
- 適用箇所: `processImage` 内、 V1 cutout の直後・autoCrop の前で `applyCutoutPostProcess(finalUrl)` を 1 行
- defaults: `closeIter=1, openIter=0, bgFeatherAlpha=0`
  → 前景の小穴 (1-2 px) を closing で埋めるだけ。 服本体は不変
- 適用ゲート: 「**初期 auto cutout の path にのみ適用**」（stroke commit は別 path で post-process を通らない）
  → manual 編集後の再適用なしを構造的に保証
- fail-safe: 例外時は入力 dataURL をそのまま返す（既存 fallback 流儀）

### 不変原則の遵守確認
- ✅ `imageUrl` は読むだけ（M2-1 helper + BackgroundRemover で読み専用、 書込経路ゼロ）
- ✅ `originalUrl` も読むだけ（復活ブラシ source、 生成・復旧・推測なし）
- ✅ `cutoutUrl / cutoutStatus / cutoutMethod / cutoutConfidence` のみ更新（resolveApplyDraft + cutoutDraftToItemFields 経由）
- ✅ `backgroundRemovalV1.ts` 無改修
- ✅ `cutoutBrowser.ts` 無改修
- ✅ `/plan` 無改修
- ✅ success/confidence/status 判定変更なし（post-process は alpha のみ操作・signals 計算に関与しない）
- ✅ My-Style persistence 無改修
- ✅ IDB / localStorage / server 直接書込なし
- ✅ 外部 API / package 追加なし

### 検証総括（M3-1 + M3-2 累計）
- 新規 unit tests: 27 cases（cutoutPostProcess.test.ts）
- my-style 全テスト: 168 PASS（退化 0）
- eslint: clean
- tsc: baseline 1116 維持（touched files 0 error）
- dev server: healthy、 /my-style コンパイルエラーなし

### 実機確認手順（CEO 側で次セッション実施）
1. `npm run dev` でログイン済みセッションで `/my-style` を開く
2. closet タブ → ボトムス / 靴 / その他 のカテゴリ別 item を tap → 詳細モーダルが開くこと（M2-extra）
3. モーダルの「背景をきれいにする」を押下 → BackgroundRemover overlay が開く
4. 自動処理結果を確認（**post-process により前景の小穴 1-2 px が closing で埋まる**）
5. 服の一部が消えている場合: 「**復活**」ボタンを ON → 該当箇所をなぞる → 元画像から透明部分のみ補充される
6. 背景が残っている場合: 「**消しゴム**」ボタンを ON → 該当箇所をなぞる → destination-out で消える
7. 「適用」→ cutoutUrl 等が保存 → 詳細モーダル閉じて通知
8. `/plan` カレンダーで item が透過 cutout 表示に切り替わる（cutoutStatus=success 優先）
9. リロード後も写真が白抜き化しないこと（C1L-6 経路の imageUrl/cutoutUrl 両方残存）
10. 何度か手動編集→適用→再 reprocess を繰り返し、 manual 編集が auto post-process で上書きされないこと

### 残課題（M3 外・記録のみ）
- 精度文言「精度 N%」の調整（CEO 補正 4 で別スライス指定）
- Phase 3（deep matting）— package 追加が必要・別 audit
- opening / feather を実機で必要と判断した場合の有効化（caller 側 option 設定で可能）

---

## 10. M4 — BackgroundRemover 編集座標系補正（2026-06-01 完了）

### root cause（CEO 報告から）
M3 までは autoCrop ON 時、 cropped `processedUrl`（subject bbox + 8% padding）と uncropped `originalUrl`（resizeImage 由来）を同じ container（aspect-[4/5]）に `object-contain` で表示していた。 アスペクト比とサイズが違うため:

1. **比較スライダー**: 元画像と処理後で表示サイズ・位置がズレる
2. **消しゴム**: canvas は cropped、 比較表示で見ていた認知座標と合わない
3. **復活ブラシ（最も致命的）**: `drawImage(originalImg, 0, 0, canvas.width, canvas.height)` で uncropped originalImg を cropped canvas 全体に stretch → ブラシで撫でた座標が「拡大された元画像」の対応点を補充 → 服が変な場所に現れる

### 採用案: 案 Y（editableUrl / processedUrl 2-state 分離）

| state | 役割 | サイズ |
|---|---|---|
| **editableUrl** | post-process 後 / crop 前の uncropped 作業用 — **比較・消しゴム・復活ブラシ・stroke commit すべてが同座標系** | originalUrl とアスペクト比一致 |
| **processedUrl** | autoCrop 適用後の最終プレビュー / 保存候補 | cropped（subject bbox + 8% padding） |

useEffect で `editableUrl + autoCrop` → `processedUrl` を race-safe に同期（alive flag）。

### CEO 補正（M4）の遵守
- ✅ imageUrl / originalUrl は読むだけ・絶対に上書きしない（書込経路ゼロ）
- ✅ editableUrl は UI 内部状態、 保存正本ではない
- ✅ 保存対象は cutoutUrl / cutoutStatus / cutoutMethod / cutoutConfidence のみ
- ✅ 復活ブラシ source: `originalUrl` → `imageUrl` fallback（M2-1 順序逆転）
- ✅ post-process は初期 auto cutout のみ（stroke commit / autoCrop 切替では再実行しない）
- ✅ crop は保存直前 + useEffect 同期のみ
- ✅ backgroundRemovalV1 / cutoutBrowser / /plan 無改修
- ✅ 外部 API / package 追加なし

### 適用ボタンの race-free 化
従来は `currentDataUrl: processedUrl` を渡していたが、 stroke commit 直後の useEffect 同期中に古い processedUrl が拾われる race を回避するため、 適用ボタンは `editableUrl` を基準に `autoCrop` ON ならその場で `cropToSubject` を当てて `onApply` に渡す。

### 復活ブラシの座標系一致（M3-2 の盲点解消）
- editableUrl = uncropped、 originalUrl = uncropped → 両者**同アスペクト比**
- canvas は editableUrl サイズで作成、 `drawImage(originalImg, 0, 0, canvas.width, canvas.height)` で同アスペクト・同範囲を補充
- → ブラシで撫でた canvas 座標 = 元画像座標 = pixel-perfect 一致

### M4 commit
- `7546d494` M4-1 実装（editableUrl/processedUrl 分離 + getReprocessSourceUrl 順序逆転 + tests）
- 本コミット M4-2 close docs

### M4 検証
- my-style 全: **169 PASS**（reprocessItem 23 拡充含む・退化 0）
- eslint: clean
- tsc: baseline 1116 維持（touched 0 error）
- dev server: CEO 側で稼働中のため追加 instance は lock 取得失敗（既存 CEO セッションでコンパイル確認可能）

### M4 実機確認手順（CEO 側で次セッション実施）
1. closet → カテゴリ別 item を tap → 詳細モーダル
2. 「背景をきれいにする」 → BackgroundRemover overlay
3. 「比較」を ON → 元画像と処理後が**同サイズ・同位置**で並ぶこと
4. 「消しゴム」を ON → canvas 上のブラシ位置が**比較で見た元画像と完全一致**することを確認
5. 「復活」を ON → 復活ブラシで撫でた箇所が**元画像のその位置の服**として補充されることを確認（M3-2 のズレが解消）
6. autoCrop checkbox を OFF→ON 切替 → 表示が cropped/uncropped に切り替わり、 編集中の内容は失われない（editableUrl は維持）
7. 「適用」 → cutoutUrl が cropped 版で保存される（既存挙動維持）
8. /plan で透過 cutout 表示
9. リロード後も白抜き化しない（C1L-6 経路）
10. 既存 PhotoAddWizard 新規登録フロー / 既存 item 再処理フローの両方が壊れていない

---

## 文献ソース
- [Closed-Form Solution to Natural Image Matting (Levin et al., CSAIL)](https://people.csail.mit.edu/alevin/papers/Matting-Levin-Lischinski-Weiss-CVPR06.pdf)
- [Alpha Matte Generation from Single Input for Portrait Matting (CVPRW 2022)](https://openaccess.thecvf.com/content/CVPR2022W/NTIRE/papers/Yaman_Alpha_Matte_Generation_From_Single_Input_for_Portrait_Matting_CVPRW_2022_paper.pdf)
- [Brown CS — Compositing and Morphology lab](https://cs.brown.edu/courses/csci1290/labs/lab_compositing/index.html)
- [addyosmani/bg-remove — Transformers.js client-side BG remover](https://github.com/addyosmani/bg-remove)
- [A Smart Background Removal with Transformers.js (Medium)](https://medium.com/@serohman/a-smart-background-removal-with-transformers-js-657bb5030eda)
- [Production-Grade Client-Side Background Removal with rembg-webgpu](https://www.rembg.com/en/blog/remove-backgrounds-browser-rembg-webgpu)
- [MDN — globalCompositeOperation (destination-over 挙動確認済)](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation)
