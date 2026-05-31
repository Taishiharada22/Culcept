# D6: scoreCandidate への bag/accessory 限定 weighting — close（2026-06-01）

**承認**: CEO 最終 PASS（2026-06-01）

D3 以降 scoreCandidate を不可触で進めてきた supplemental tuning を、 限定的に scoring 軸へ進出させる高リスクフェーズ。 D6-0 design gate → D6-1 baseline test → D6-2 実装 → D6-close の 4 commit で完了。

> ⚠️ **触らない領域**（D6 共通）:
> D1 helper / ensureThreeProposals / diffScore / buildCombo / outfitEngineAdapter /
> useCalendarOutfit / OutfitCollage / UI / My-Style persistence / cutout / quota cleanup /
> weather route / 既存 item 再処理 / server purge / IndexedDB 削除 / localStorage 削除 /
> Supabase / DB / migration / server-sync / external API / package / push / deploy / production canary /
> scoreCandidate 全体の構造改修 / tops/bottoms/shoes/outer のスコア

---

## D6 commit
| | commit | 役割 |
|---|---|---|
| 1 | `0bceb81c` | **D6-0** — design / risk audit docs + decision-log |
| 2 | `6711c934` | **D6-1** — baseline score test 17 cases（tops/bottoms/shoes/outer + bag/accessory 既存値）+ scoreCandidate export |
| 3 | `bba39686` | **D6-2** — scoreCandidate に bag/accessory 限定 weighting 追加（+3 controlled）+ baseline test 期待値更新 |
| 4 | （本コミット） | **D6-close** — close docs + decision-log |

---

## 確定した実装仕様

### D6-1: baseline score test の固定（必須前提）
- `tests/unit/calendar/scoreCandidateBaseline.test.ts` 新規（17 cases）
- 17 cases の構成（D6-1 commit 時）:
  - tops/bottoms/shoes/outer: 季節 / thickness / formality / outer 例外 / 属性未設定 / recently worn 各代表値
  - bag/accessory: D6-2 後 +3 されることを記録する 3 cases（当時 50 を assert）
- 最小依存原則: `localStorage` を空に初期化、 `recentlyWornIds = []`、 persona/satisfactionProfile/cache 未注入
- `scoreCandidate` を export（同ファイルからの import 用、 既存呼び出しに影響なし）

### D6-2: scoreCandidate に bag/accessory 限定 weighting
`app/(culcept)/calendar/_lib/outfitEngine.ts` の `scoreCandidate` の `return score` 直前に、 `item.categoryMain` で gated な分岐を追加:

**bag**:
- `subcategory.endsWith("backpack")` + `requiredFormality === "casual"` → +3
- `subcategory.endsWith("tote" | "shoulder" | "crossbody")` + `requiredFormality === "smart" | "dress"` → +3

**accessory**:
- `subcategory.endsWith("scarf")` + `recThickness === "thick"`（既存 cold day 代理） → +3
- `subcategory.endsWith("jewelry")` + `requiredFormality === "dress"` → +3
- `subcategory.endsWith("belt")` + `requiredFormality === "casual" | "smart"` → +3

**hat は D6 スコープ外**:
- `hotSunny` / `outdoorEvent` の context が scoreCandidate のシグネチャから取れない
- D4 で eligibility tier 済なので、 ここでの加点は次回 design gate で扱う

### D6-2 で実装した安全性
| 項目 | 実測 |
|---|---|
| NaN 発生 | なし（既存 `if (item.X)` パターン踏襲） |
| 属性未設定 case | subcategory 未設定 / 不明値 → 加減点なし（中性扱い） |
| tops/bottoms/shoes/outer のスコア | 完全不変（baseline 17 cases PASS） |
| 過剰加算 | 最大 +3 × 1 件 → 既存 ±15 と比べて controlled |
| scoreCandidate 構造改修 | なし（`return score` 直前に gated 分岐のみ） |

### baseline test の最終形（D6-2 後 25 cases）
- D6-1 の 17 cases（tops/bottoms/shoes/outer）は完全不変で全 PASS（スコア固定保証）
- bag/accessory 8 cases（D6-2 追加・差し替え）:
  - bag backpack + casual → 53
  - bag tote + smart → 53
  - bag backpack + smart → 50（mismatch・加点なし保証）
  - accessory scarf + thick → 53
  - accessory scarf + mid → 50（thick 限定保証）
  - accessory jewelry + dress → 53
  - accessory jewelry + smart → 50（dress 限定保証）
  - accessory belt + casual / smart → 53 / 53
  - accessory hat → 50（D6 スコープ外保証）
  - 属性全未設定 bag/accessory → 50（中性保証）

---

## 検証総括
- **D6-1**: scoreCandidateBaseline.test.ts 新規 17 cases PASS / Calendar 全 / plan 全 / eslint clean / tsc 自分のファイル差分 0
- **D6-2**: scoreCandidateBaseline.test.ts 25 cases PASS（既存 17 + 新規 8）
- **D6-2 退化チェック**: Calendar 322/322 PASS / plan 3532/3532 PASS / eslint clean / tsc baseline 1116 維持
- 累計新規 test: 25 cases
- tops/bottoms/shoes/outer のスコア完全不変を構造的に保証

---

## 残課題 / 別トラック（D6 外）
- **hat の context-aware weighting**: hotSunny / outdoorEvent を `scoreCandidate` に渡すパラメータ追加が必要 → 次回 design gate
- **bag/accessory 以外（tops/bottoms/shoes/outer）の scoring 拡張**: 現状の baseline test が全種類カバーしているため、 拡張時は同方式で安全に進められる
- **rotation/satisfaction cache 利用 case の baseline**: 最小依存原則で外したため未カバー。 必要なら別 design gate で追加

---

## GO / NO-GO
- **D6: CLOSE（CEO 承認・実装＋ docs 完了）**
- 次フェーズは CEO 判断（Calendar 系の他改善・Plan 系・別ユニット）
