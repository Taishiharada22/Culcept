# D4: accessory subcategory 別 eligibility — close（2026-06-01）

**承認**: CEO 最終 PASS（2026-06-01 / branch `claude/loving-pike-fa227a` / 1 commit + close docs）

D3-2 で smart=1 件 / dress=2 件 + cold scarf 優先を確立した上に、 **subcategory ごとの実用文脈 (hat/belt/jewelry/scarf)** で採用順を整える tuning。 D3 と同領域・低リスク・1 commit でまとめて実装。

> ⚠️ **触らない領域** （D4 共通）:
> scoreCandidate 本体 / D1 helper / outfitEngineAdapter / useCalendarOutfit / OutfitCollage / UI 全般 /
> mock 構造 / My-Style persistence / cutout / quota / weather route / 既存 item 再処理 /
> Supabase / DB / migration / server-sync / external API / package / push / deploy / production canary

---

## D4 commit
| | commit | 役割 |
|---|---|---|
| 1 | `57638fb8` | **D4 accessory subcategory eligibility** — `buildAccessoryContext` + `accessorySubcategoryTier` + `selectAccessories` に `ctx` 引数追加で tier 別 sub-pool 採用 |
| 2 | （本コミット） | **D4 close docs** — 本ドキュメント + decision-log 1 行 |

---

## 確定仕様（subcategory 別 eligibility）

### AccessoryContext（既存 field のみで安全に構築）
```ts
type AccessoryContext = {
  hotSunny: boolean;       // temp_max >= 28 + weather_icon ∈ {sun, cloud, unknown}
  rainy: boolean;          // weather_icon === "rain" || outfit_tag === "rain"（既存判定と整合）
  outdoorEvent: boolean;   // events に実 event_type "outdoor" がある（推測しない）
  hasBottoms: boolean;     // selectedItems に categoryMain="bottoms" または category="bottoms"
  baseFormality: "casual" | "smart" | "dress";  // inferBaseFormality ?? adjustedFormality
};
```

### subcategory tier 表（CEO 補正 5 点反映）

| subcategory | preferred 条件 | suppressed 条件 | normal |
|---|---|---|---|
| **scarf** | （cold は selectAccessories 側で別途強制 = D3-2 維持） | — | 常時 |
| **hat** | `hotSunny && outdoorEvent` | `rainy`（後ろへ・除外しない・**補正 1**） | それ以外 |
| **belt** | `hasBottoms && (smart \| dress)` | `!hasBottoms`（**補正 3**: bottoms 前提） | `hasBottoms && casual`（**採用可**） |
| **jewelry** | `baseFormality === "dress"` | `smart` / `casual`（後ろへ・**補正 4**） | — |

### 不変原則の保持
- **hard filter なし**（rain bag を除く既存パターン踏襲）。 suppressed は後ろへ並べ替えるだけ
- pool に **1 subcategory しか無い場合は必ず採用**（suppressed でも 1 種なら残る・**補正 1, 4 の核心**）
- **scarf cold 優先（D3-2）は最強**: subcategory tier の preferred より優先される sub-pool pick が走る
- supplemental 不変: accessory 全体は消えない / `selectedItems.length < 2` 境界も維持
- ctx 無し呼び出し（D3-2 互換 path）は **D3-2 と完全同一挙動**（後方互換）

---

## D4 で触らなかった領域
- `scoreCandidate` 本体（D3 と同じく未接触）
- `ensureThreeProposals.ts`（D1 helper）
- `outfitEngineAdapter.ts` / `useCalendarOutfit.ts`
- UI / `OutfitCarousel` / `OutfitCard` / `OutfitCollage` / `outfitCollagePlacement.ts`
- mock 構造（`mockCalendarOutfit.ts`）
- D3-1 で導入した `selectBagPool`（bag tuning は D3 で確定済）
- My-Style persistence / cutout / quota / weather route / migration / push / deploy

---

## 検証結果
- 新テスト `outfitEngineAccessorySubcategory.test.ts`: **28/28 PASS**
  - `buildAccessoryContext` 5 cases / `accessorySubcategoryTier` 10 cases / `selectAccessories` with ctx 8 cases / generateDayProposal end-to-end 4 cases / D3-2 不変回帰 2 cases
- Calendar 全テスト: **297 PASS**（D4 開始時 269→297、 +28、 **退化 0**）
- plan 全テスト: **3514 PASS**（退化 0）
- eslint: **clean**
- tsc: 全体 **1116（baseline 維持）/ 自分のファイル 0**（差分内 0）

---

## D5 以降の候補（情報のみ・着手は CEO 判断）
- **D5**: bag/accessory を diff 主軸に入れる検討（CEO 補正案 B = main-axis diff required + supplemental as tie-breaker で再設計予定）
- **D6**: scoreCandidate への bag/accessory 限定 weighting（高リスク・別 design gate 必須）
- **Maintenance**: localStorage quota cleanup / 既存 item 再処理 / weather route 404

---

## GO / NO-GO
- **D4: CLOSE（CEO 承認・技術的完了・実装＋ docs）**
- D5 着手は CEO の補正済 mini design 再提出 + GO 後
