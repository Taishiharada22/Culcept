# /plan freeze + My-Style 永続化 + cutout 表示復旧 — close (2026-05-31)

**承認**: CEO 最終 PASS（2026-05-31 / branch `claude/loving-pike-fa227a`、HEAD `a77c8933`）

CEO 観測 7 件を 9 commits で連鎖修正し、 一括 close とした。 本ドキュメントは「**何が起きていて、 なぜ、 どう直したか**」を 1 ファイルに残す。
`docs/decision-log.md` には 1 行サマリのみ（同日付）。

> ⚠️ **触っていない領域**:
> push / deploy / DB migration / Supabase schema / server-sync 仕様 / external API / package 追加 / production canary /
> course / C1L-5 ロジック / OutfitItemImage（最初の hotfix 後は不変）/ BackgroundRemover / cutout 生成アルゴリズム /
> UI 全体再設計 / 3 候補生成改修 / IndexedDB 自動削除 / localStorage 自動削除 / 既存 item 自動削除 / 既存 item 一括復旧。

---

## 解決した CEO 観測

| # | 観測 | 原因 | 解決 commit |
|---|---|---|---|
| 1 | `/plan` Calendar タブクリックで Chrome 不応答 | unstable `selectedDayAnchors` ref が effect 依存に入り `setDisplayMap(new Map())` の async loop を発火 | `0773f074` |
| 2 | おすすめコーデの描画時に背景除去が走り重い | `OutfitItemImage` が render-time `removeBackground` を呼んでいた | `74d7ab68`（前回 close 済） |
| 3 | server 保存が全面失敗（22P02） | `wardrobe_categories` は `text[]` 列なのにオブジェクトを送信 | `48f55a5e` |
| 4 | 削除した item が更新で復活 | localStorage virgin / quota MISSING で remote-load が古い server で上書き | `80a7dcc8` → `71db4795` |
| 5 | 追加した item が更新で消える | server 同期が握り潰しの 200 で完了扱い、 client が成功と誤認 | `48f55a5e` |
| 6 | 写真が reload 後に消える | server stripped を adopt して画像が消える + v2_backup の古い id 集合で merge が機能しない | `db7aeb02` → `a77c8933` |
| 7 | `/plan` のおすすめコーデに反映されない / 透過が出ない | C1L-5 で `getWardrobeDisplayImageUrl` まで届いていなかった + IDB に画像が残らない | `e4a6e168`（前回 close 済） + `e1526076` + `a77c8933` |

---

## 累計 9 commits（branch `claude/loving-pike-fa227a` / 未 push）

| | commit | 役割 |
|---|---|---|
| 1 | `0773f074` | /plan: `CalendarTab` `selectedDayAnchors` を `useMemo` で安定化、 unstable ref → async setState loop を停止 |
| 2 | `74d7ab68` | /plan: `OutfitItemImage` の render-time cutout 処理を停止（前回 close 済） |
| 3 | `e4a6e168` | /plan: C1L-5 `getWardrobeDisplayImageUrl` で confirmed cutout を優先表示（前回 close 済） |
| 4 | `e1526076` | My-Style: IDB cached state から `imageUrl` / `cutoutUrl` / `originalUrl` を復元（`mergeRestoredWardrobeImageFields`） |
| 5 | `48f55a5e` | bridge route: `wardrobe_categories` を `text[]` に正規化（22P02 解消）+ styleSummary 失敗時に 500 を返して握り潰しを止める |
| 6 | `80a7dcc8` | My-Style: localStorage virgin でも `current` が meaningful なら remote-load を adopt しない + quota 失敗時に main を `removeItem` しない |
| 7 | `71db4795` | My-Style: remote adoption を revision-aware に（`remoteRev > currentRev` なら採用＝削除を server から受け取る） |
| 8 | `db7aeb02` | My-Style: remote adopt 時に `prev` の heavy 画像 fields を id 一致で保持（`mergeRemoteStateWithLocalImages`） |
| 9 | `a77c8933` | My-Style: branch3 で IDB cache を current の正本にする（`mergeCachedStateWithLocalImages` + `rawSetState`）+ remote-load を `restorationResolved` で gate |

---

## 詳細

### /plan freeze の原因と修正
**症状**: `/plan` Calendar タブの「クリックすると Chrome『ページが応答しません』」。 画像取り込み導入以前から、 Calendar タブのみで再現。
**根本原因**: `CalendarTab.tsx` L146 で `selectedDayAnchors = anchorsForDay(anchors, selectedDateObj)` を**毎レンダー新規配列**として生成。 これを `useMapTabMovementDisplay` / `useCalendarTabFeasibilityDisplay` の effect 依存に渡し、 hook が async 完了で `setDisplayMap(new Map())` を返す → 再レンダー → 毎レンダー effect 再実行 → main thread 飽和。 React の max-update-depth ガードは async setState では効かない。
**対照証拠**: `MapTab.tsx` L161 は `dayAnchors = useMemo(() => anchorsForDay(...), [...])` で安定化済み → 固まらない。 同じ hook、 渡し方だけが違う。
**修正**: `CalendarTab.tsx` の `selectedDateObj` / `selectedDayAnchors` を `useMemo` で安定化（MapTab と同じパターンに揃える）。 shared hook 本体・MapTab・旧タイムラインには触れず、 1 ファイル `useMemo` 1 個。
**commit**: `0773f074`。

### CalendarTab anchors memoize
- `selectedDayAnchors = useMemo(() => anchorsForDay(anchors, selectedDateObj), [anchors, selectedDateObj])`
- `selectedDateObj` も `useMemo([selectedDate])` で安定化（hook deps が安定する経路を作る）。
- 回帰テスト: `tests/unit/plan/calendarTabAnchorsMemo.test.ts` で source-assertion により `useMemo` 経路を固定。

### render-time cutout processing 停止
- `OutfitItemImage` から `useCutoutImage` 経路を撤去。 `src` を `<img>` にそのまま渡す。
- 描画時の重い背景除去（旧 `removeBackground`）をすべて停止し、 cutout は登録時（My-Style）の保存値（`cutoutUrl`）を C1L-5 ロジックで返す方針に統一。
- commit: `74d7ab68`（前回 close 済）。

### My-Style bridge `wardrobe_categories` 修正
- **症状**: server 保存が完全失敗するが POST は 200 を返す。 dev log に `code: '22P02' / "expected JSON array" / "wardrobe_categories"`。
- **根本原因**: `user_style_summary.wardrobe_categories` 列は `text[]`（migration `20260326300000_my_style_tables.sql` L10）。 一方 `deriveSyncSignals().summary.wardrobeCategories` は `countBy` の**オブジェクト**を返す。 オブジェクトを `text[]` 列に upsert すると Postgres 22P02。
- **修正**: `app/api/my-style/bridge/bridgePayload.ts` に pure helper `wardrobeCategoriesToTextArray(value)` を新設。 `Object.keys()` で `text[]` に正規化（null/undefined→`[]`、 array はそのまま sanitize）。
- migration はしない（列型を変えずコード側で吸収）。
- commit: `48f55a5e`。

### styleSummary failure を握り潰さない修正
- 旧設計: bridge POST の `Promise.allSettled([styleSummary, prefProfile])` が**全失敗時のみ 500**。 styleSummary 単独失敗（= `quiz_result.myStyleState.wardrobe` の保存失敗）でも prefProfile が成功すれば **200** を返していた → client は `res.ok` で synced 扱い、 失敗を検知できない。
- **修正**: `bridgeWriteHttpStatus(failures)` で `failures.includes("styleSummary")` の場合は 500 を返す。 prefProfile 単独失敗のみ 200 + `partialFailures` で明示（既存挙動は維持）。
- client は既存の `if (!res.ok) throw` で自動的に失敗扱い（enqueue 再試行 + error 表示）→ client コード変更不要。
- commit: `48f55a5e`。

### localStorage quota 超過時の IDB primary 化
- **観測**: console 出力で localStorage 総容量 = **5,242,879 ≒ 5.24 MB**（quota 上限）。 `[my-style] localStorage quota exceeded` 警告が出続けていた。
- **症状**: persist の catch で `ensureStorageSpace()` が `culcept_my_style_v3_backup` を expendable として削除（`lib/stargazer/localStorageHelper.ts` L22）、 さらに **catch 内の `removeItem(STORAGE_KEY)`** が main を削除 → 両方 MISSING → reload 時 virgin → server で上書き → 削除復活。
- **Fix C**: catch 内の `removeItem(STORAGE_KEY)` を**削除**。 quota 失敗でも main snapshot を残し、 IDB を primary として継続。
- 圧迫源の削減（Fix B 系列）は別スライス。 現在は IDB 正本化により quota 飽和でも実害は出ない。
- commit: `80a7dcc8`。

### remote-load / IDB / server の採用順修正
- **Fix D**（採用条件）: 旧設計は `initialBundle.state`（stale）を見て virgin 判定し remote を `rawSetState(remote)` で復元していた。 → mount 後に IDB から復元されても server が即座に上書きする経路があった。
- **修正**: `shouldAdoptRemoteState(current, remote)` pure helper を新設。 `current = prev`（functional setState の prev、 IDB 復元後）で判定する。 `current._revision > 0 || hasMeaningfulState(current)` なら remote 不採用（IDB / current > server）。
- 影響範囲: server remote を採用するのは **localStorage も IDB も本当に空の新規端末** + remote に中身がある場合だけ。
- commit: `80a7dcc8`。

### revision-aware remote adoption
- 上記 Fix D を入れても、 server が**新しい**情報を持つケース（CEO が別端末で削除したケースなど）で remote を取り込めない問題が残った。
- **修正**: `shouldAdoptRemoteState` を revision-aware に拡張。
  - `remoteRev > currentRev` なら adopt（**削除が server に届いていれば反映**）
  - `currentRev >= remoteRev` かつ current meaningful なら不採用
  - virgin かつ remote に中身があれば採用
- これで「server に到達した削除」が次回 reload で client にも反映されるようになった。
- commit: `71db4795`。

### remote adopt 時に画像 field を保持
- revision-aware で adopt するようになった結果、 **server snapshot は `stripHeavyImageUrls` 済**（`createPortableStateSnapshot` 経由）で画像が無いため、 adopt 時に **IDB から復元された画像が消える**副作用が判明（reload 後に写真が白抜き化）。
- **修正**: `mergeRemoteStateWithLocalImages(remoteState, prevWardrobe)` pure helper を新設。
  - remote の wardrobe を base（**削除は remote に従う**＝ remote に無い id は復活させない）
  - prev の heavy 画像 fields（`imageUrl` / `cutoutUrl` / `originalUrl`）を **id 一致のみ補完**
  - metadata は remote 優先（最新 name / category / colorHex 等）、`_revision` も remote のものを採用
- commit: `db7aeb02`。

### IDB 正本化 + restorationResolved gate
- 上記 `db7aeb02` 後も写真が消える観測が残った。 観測ログ:
  ```
  REMOTE-LOAD adopt:true prevImg:24 prevLen:24 prevRev:1 remoteImg:0 remoteLen:7 remoteRev:26
  ```
  → prev = **24件 画像あり rev 1** だが、 これは `loadStateBundle` が `PREVIOUS_BACKUP_STORAGE_KEY = "culcept_my_style_v2_backup"` を読んだ結果。 v2 時代は `stripHeavyImageUrls` の cutoutUrl/originalUrl 適用前で**画像込み**保存だった。
- **症状の連鎖**:
  1. localStorage v3 が quota MISSING → v2_backup（24件 画像込み 古い id）が initialBundle
  2. branch3 の旧 merge は「prev base + cached の画像 patch」だったため、 prev (v2_backup) と cached (IDB 7件 新 id) の id 集合が一致せず prev のまま
  3. persist で IDB が v2_backup の古い state で上書き
  4. remote-load adopt 時に prev (v2_backup 古い id) と remote (server 7件 新 id) が id 不一致で `mergeRemoteStateWithLocalImages` が画像補完できず → 7件のほぼ全部が白抜き
- **修正 1 / IDB 正本化**: `mergeCachedStateWithLocalImages(cachedRaw, prevWardrobe)` pure helper を新設。 branch3 は **IDB cache を current の正本**（id 集合・rev・画像）にし、 prev は同 id の画像補完のみ（IDB が稀に画像欠落のケースの保険）に限定。 `rawSetState` で適用し setState wrapper の rev bump を回避（`cached._revision` を保持）。
- **修正 2 / restorationResolved gate**: remote-load effect を `if (!restorationResolved) return` で gate、 deps を `[initialBundle.state]` → `[restorationResolved]` に変更。 branch1/3 の IDB 復元完了後だけ remote-load adopt を判定（race を解消）。
- commit: `a77c8933`。 これが本連鎖の最終解決。

### /plan に写真・透過が反映されるようになったこと
- 上記の連鎖修正を経て、 `/plan` Calendar タブのおすすめコーデに **wardrobe の写真がそのまま表示**されるようになった（実機確認 PASS、 2026-05-31 23:20）。
- `cutoutStatus === "success"` + `cutoutUrl` の item は透過済み画像、 legacy は背景込み画像、 画像なしはシルエットの 3 段階で `getWardrobeDisplayImageUrl` が正しく分岐（C1L-5 のロジック不変・PR `e4a6e168` のまま）。

---

## 残課題（次セッション以降の候補）

### 既に白抜きになった既存 item は自動復旧しない
本連鎖修正は**これ以降の loss を止める**もの。 既に IDB から画像が失われた古い item は、 画像源（server / v2_backup）にも残っていない場合があり**自動復旧不能**。 復旧には **再 add（再アップロード）** が必要。 一括再処理は別スライス（C1L-6 既存 item 再処理 = deferred）。

### localStorage quota 圧迫は残課題
- 観測: 総容量 ≒ **5.24 MB**（quota 上限）。 14 keys 中の圧迫源は未特定。
- 現状: IDB 正本化により quota 飽和でも実害は出ない（写真消失・削除復活は解消）。
- 次トラック候補: Fix B 系列 — 圧迫源 key の特定 + サイズ削減 + 古い v2 / orphaned key の安全な cleanup。 これが解消すれば v2_backup race の素因も消える。

### `/api/weather/subscription` 404 は別件
- dev log に `GET /api/weather/subscription 404` + `Compiling /_not-found ...` が連発。
- freeze / 永続化 / 写真消失とは**無関係**（route 未実装が原因）。 別スライスで実装 or fetch 停止を判断。

### 3 候補生成は次トラック
- 現在の `/plan` おすすめコーデは中央 1 件主役で、 左右の peek は同提案を被せていることがある（main と alternatives の差分が薄い、 もしくは alternatives が drop されるケース）。
- 次フェーズ **D1**（design gate 起点）で扱う。

---

## State Safety（厳守完了）
- working tree **clean**（uncommitted 残置物 0、instrumentation 0）
- `git stash` / `reset --hard` / `checkout --` / `clean -f` / `restore .` 一切未使用（Rule 7）
- `git add` は全て個別ファイル指定（Rule 7）
- 全 commit で Section 8 三点確認（branch / status / log）実施（Rule 8）
- 一時 instrumentation は **commit しない** ルール厳守（過程で 2 度投入 → 観測完了後に除去）

---

## 次フェーズ
**D1**（おすすめコーデ 3 候補生成）の **design gate** へ。 まず実装に進まず、 中央主役 / 候補差分 / bag・accessory / 提案アイテム不足時 mock の方針を CEO 承認のうえで起草する。
