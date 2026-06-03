# D1: おすすめコーデ 3 候補生成 — 設計（design gate close, 2026-05-31）

**承認**: CEO（2026-05-31 / branch `claude/loving-pike-fa227a`、 design gate A 採用 + 補正 1 件）

`/plan` Calendar タブの「おすすめコーデ」を、 **常に 3 候補** を中央主役で並べる体験に整える。 ただし engine 本体（Calendar 共用）には触らず、 **adapter 側の純粋関数レイヤ**で 3 候補保証する。

> ⚠️ **触らない領域** （D1 全体共通）:
> 実装で UI 全体再設計に戻らない / bag/accessory engine 追加 / My-Style persistence / cutout / quota cleanup / weather route / 既存 item 再処理 /
> server purge / IndexedDB 削除 / localStorage 削除 / Supabase / DB / migration / server-sync / external API / package 追加 / push / deploy / production canary.

---

## 1. 現在の候補生成フロー（事実 / 監査済み）

```
useCalendarOutfit
  └─ generateCalendarOutfitProposal  (outfitEngineAdapter.ts)
       └─ facade @/lib/shared/outfitEngine.generateTodayProposal
            └─ generateDayProposal  (app/(culcept)/calendar/_lib/outfitEngine.ts)
                 ├─ pools = { outer, tops, bottoms, shoes }    ← bag/accessory 無し
                 ├─ main = buildCombo("main")                  ← null なら全体 null
                 └─ alternatives ⊂ ["casual","dressy"(+rain/cold)]
                      └─ buildCombo(v) → main と 1 件でも差分があれば push
       └─ facade で alternatives = slice(0, 2)
       └─ [main, ...alternatives].slice(0, 3).filter(items.length>0)
       └─ proposals.length===0 なら null
       (null fallback)
  └─ hydrateOutfitVM(mock, wardrobe)   ← B-1 既存
  (空 wardrobe fallback)
  └─ MOCK_CALENDAR_OUTFIT_VM
```

### 関連コード（行番号付き・read-only 監査結果）

- `app/(culcept)/calendar/_lib/outfitEngine.ts`
  - L100 `type CategoryGroup = "outer" | "tops" | "bottoms" | "shoes"`
  - L240-345 `buildCombo`: tops / bottoms / shoes を pickBest、 outer は条件付き。 `selectedItems.length < 2` で null
  - L348-414 `generateDayProposal`: main → variants ループ。 L407 `alt.items.some(i => !main.items.find(mi => mi.id === i.id))` で **main と 1 件でも差分があれば push、 完全同一は drop**
- `lib/shared/outfitEngine/index.ts` L155 `alternatives: proposal.alternatives.slice(0, 2)` — alternatives を 2 件に絞る
- `app/(culcept)/plan/tabs/_calendar-outfit/outfitEngineAdapter.ts`
  - L174 `[result.main, ...(result.alternatives ?? [])].slice(0, 3)`
  - L177 `.filter((p) => p.items.length > 0)` — 0 items を drop
- `app/(culcept)/plan/tabs/_calendar-outfit/OutfitCarousel.tsx`
  - L37 `initialIndex = count > 0 ? Math.floor((count - 1) / 2) : 0` — **count=3 で index=1 が中央**

---

## 2. なぜ 1 候補になるのか（drop の連鎖）

1. **`buildCombo` 内 null**: `pools[cat]` が空（tops/bottoms/shoes/outer のいずれか）、 または pickBest 集合が小さく `selectedItems.length < 2` → 該当 alt まるごと消える
2. **main と完全一致 drop**: pool が小さいと `pickBest` の top-3 ローテが同じ id を返し、 variant 違えど全 item 一致 → drop（L407）
3. **facade の `slice(0, 2)`**: 4 variant 通っても alternatives は 2 件まで
4. **adapter `items.length > 0`**: 0 items のみ drop（主因は ①②）

**典型シナリオ（CEO 観測の素因）**:
- wardrobe が小さい / カテゴリ偏り → main 1 件のみで終わる
- wardrobe が tops 2/bottoms 2/shoes 1 程度 → variant の差分が出ず全部 drop で **main 1 件のみ**

---

## 3. alternatives drop の確定条件
- `pools[cat]` 空でカテゴリ不足 → `selectedItems.length < 2` → null
- variant=cold だが outer pool 0 → outer 抜けて casual と同じ → 複製判定 drop
- `pickBest` の topN.length=1 で variant 違っても同 id → 複製 drop
- 全件 main と完全一致 → drop

---

## 4. bag / accessory は D1 では未対応（D2 へ分離）

**現状**:
- engine: `CategoryGroup` に bag/accessory 無し、 `categorize`/`buildCombo`/scoring すべて未対応
- mock: 3 候補すべてに bag + watch を含む（理想画像準拠）
- VM 表示側 (`wardrobeItemToVM`): bag / accessory のカテゴリ表記には対応済み（adapter L64-72 `CATEGORY_MAIN_JA`）

**D2 分離理由（CEO 同意）**:
- engine 本体の `CategoryGroup` 拡張は Calendar 共用範囲に波及（buildCombo / scoreCandidate / pickBest / outfit 全件回帰）
- D1 のゴール「常に 3 候補・main 中央主役・意味差分・main 複製禁止・fallback」は **outer/tops/bottoms/shoes の 4 カテゴリで成立可能**
- D1 を膨らませないために本スコープから外す

**D2 のスコープ案（参考 / 確定ではない）**: `CategoryGroup` 拡張 + `categorize` + `buildCombo` で外出 anchor 有無や formal 寄りを条件にした bag/accessory 選定。

---

## 5. D1 で実現すること（ゴール定義）

1. **常に 3 候補を返す**（wardrobe 充足時は engine 由来、 不足時は派生 / mock fallback）
2. **main を中央主役にする**（`proposals[1] = engine.main` を厳守）
3. **relaxed / smart の意味差分** を作る（formality 軸で 1 段差）
4. **main 複製を並べない**（itemIds 完全一致は 1 件のみ）
5. **実服不足は fallback ladder** で安全に降りる
6. **`proposalsSource`** で源（engine / engine_padded / hydrated_mock / mock）を区別

---

## 6. **重要補正（CEO 1 点）: main を中央主役に配列順で固定する**

**根拠**: 既存 `OutfitCarousel.tsx` L37 の `initialIndex = Math.floor((count - 1) / 2)`。 count=3 なら **`activeIndex = 1`**。 つまり **`proposals[1]` が中央**で表示される（trackTransform の式 `translateX(calc(24% - activeIndex * 52%))` で中央寄せ）。

したがって **D1 では配列順を以下で組む**:

```
proposals[0] = relaxed  (左、 peek)
proposals[1] = main     (中央、 主役)  ← engine.main を必ずここに
proposals[2] = smart    (右、 peek)
```

- **UI 再設計は不要**（既存 Carousel の active 計算が自然に中央 = `proposals[1]` を選ぶ）
- engine path / engine_padded path で配列順を厳守
- hydrated_mock / mock path は既存 mock の順序を尊重（mock 側のリ並べは D2 以降で扱う候補；本 D1 では非接触）

---

## 7. D1 の方針（採用 / 不採用の明示）

### 採用
- engine 本体 `generateDayProposal` には **触らない**（Calendar 共用回避）
- adapter 側に **3 候補保証レイヤ**（pure helper）を置く
- UI は既存 3-up 構造（`OutfitCarousel` の peek + 中央主役）を **そのまま利用**
- bag / accessory は **D2 へ分離**
- D1 は **outer / tops / bottoms / shoes** の 4 カテゴリで 3 候補安定化

### 不採用 / 不要
- UI 全体再設計（active proposal 制御は不要 = `proposals[1]` 配置で吸収）
- engine `CategoryGroup` の拡張（D2）
- 新 endpoint / migration / package

---

## 8. fallback ladder（adapter 内で完結）

| Tier | 条件 | proposalsSource | 並べ方 |
|---|---|---|---|
| **A** | engine が main + 2 alternatives を出した | `"engine"` | `[engine.alt(casual寄り), engine.main, engine.alt(dressy寄り)]` |
| **B** | engine main 出るが alternatives 0〜1 件 / 完全同一 drop | `"engine_padded"` | `[swap派生 or mock, engine.main, swap派生 or mock]` |
| **C** | engine null だが wardrobe あり | `"hydrated_mock"` | 既存 `hydrateOutfitVM(mock, wardrobe)`（mock 3 件を実画像で patch） |
| **D** | wardrobe 空 / IDB 不可 | `"mock"` | `MOCK_CALENDAR_OUTFIT_VM` そのまま |

**責務分担**:
- **Tier A / B は新規 pure helper `ensureThreeProposals` の責務**（D1-1）
- **Tier C / D は既存 adapter の path をそのまま使う**（adapter の早期 return / fallback で吸収）

---

## 9. diff 保証（差分の意味づけ）

「意味ある差分」の定義（adapter 内で計算）:

```
diffScore(a, b) =
  (a.items の id - b.items の id の対称差) ×1.0
  + (a に outer あり / b に outer なし、 または逆) ×0.5
```

**ルール**:
- 3 候補のうち任意ペアで `diffScore ≥ 1.0` を満たすこと
- 完全同一（diffScore = 0）のペアが残ったら、 片方を mock の同役割枠で **pad 置換**
- formality 差は **swap-by-axis** の生成方向で担保（明示の diffScore 加点はしない — 同じ formality の異なる item でも差分として認める）

---

## 10. swap-by-axis（派生生成）

**目的**: engine から alternatives が 0〜1 件しか得られない場合、 main の wardrobe item から 1 件を **formality 隣接の別 item に swap** して relaxed / smart 派生を作る。

**ルール**:
- 方向 `direction = -1` (relaxed): main の最も formality 高い item 1 件を、 同カテゴリの **formality が 1 段低い** item に置換
- 方向 `direction = +1` (smart): 逆に最も formality 低い item を **1 段高い** item に置換
- swap 元 / 先は **wardrobe item の `formality` 属性**（`"casual" | "smart" | "dress"`、 rank = 0/1/2）で判定
- 該当候補が pool に無い → 当該 slot は **mock で pad**（diff 保証で完全同一は弾く）
- swap は **1 item のみ**（main からの距離を最小限に保ち、 意味ある差を 1 軸に限定）

---

## 11. D1 commit 分割

| commit | 内容 | スコープ |
|---|---|---|
| **D1-0** | **本ドキュメント** + decision-log 1 行追記 | docs-only |
| **D1-1** | `ensureThreeProposals.ts` pure helper（diffScore / formalityRankOf / findSwapCandidate / ensureThreeProposals）+ `types.ts` に `"engine_padded"` 追加 + test | adapter ディレクトリ内 |
| **D1-2** | `outfitEngineAdapter.ts` 結線（`generateCalendarOutfitProposal` を helper 経由に）+ contract test | adapter 1 ファイル中心 |
| **D1-3** | `useCalendarOutfit.ts` の `proposalsSource` 受け渡し + hook 動作確認 test | hook |

各 commit 単独で PASS / 退化ゼロを保ち、 順次着地。 D1-2 終了時点で実機確認、 D1-3 で hook test 補強。

---

## 12. D2（bag / accessory）の分離

**D2 スコープ案**:
- `app/(culcept)/calendar/_lib/types.ts` の `CategoryGroup` に `bag` / `accessory` 追加
- `categorize`/`buildCombo` で bag/accessory pool を作成し、 条件付きで選定（外出 anchor 有 / formal 寄り 等）
- Calendar 既存テストの回帰確認
- adapter / mock 側は既に対応済み（adapter L64-72 `CATEGORY_MAIN_JA` / mock 3 候補に bag 含有）

D2 着手は CEO 判断（D1 安定確認後）。

---

## 13. State Safety
- 本ドキュメントは docs-only commit（D1-0）
- 以降の D1-1 / D1-2 / D1-3 は実装 commit。 commit ごとに Section 8 三点確認、 個別 file add、 一時 instrumentation は commit しない。
- D1 全体が close するまで `push` / `deploy` は行わない。

---

## 14. GO / NO-GO
- **D1 design gate: GO**（CEO 承認 / 本ドキュメント commit へ）
- 次: D1-0 docs commit → そのまま D1-1 実装 → D1-2 mini plan 提出で STOP
