# D6: scoreCandidate への bag/accessory 限定 weighting — design / risk audit（2026-06-01）

**承認**: CEO 設計確認済（D5 完了報告時に提出）+ M1-3 後に正式 design gate commit

D3 以降 scoreCandidate を不可触で進めてきた supplemental tuning を、 限定的に scoring 軸へ進出させる高リスクフェーズの設計記録。 D6-1 baseline test + D6-2 実装 + D6 close docs の 4 commit で完了予定。

> ⚠️ **触らない領域**（D6 共通）:
> D1 helper / ensureThreeProposals / diffScore / buildCombo / outfitEngineAdapter /
> useCalendarOutfit / OutfitCollage / UI / My-Style persistence / cutout / quota cleanup /
> weather route / 既存 item 再処理 / server purge / IndexedDB 削除 / localStorage 削除 /
> Supabase / DB / migration / server-sync / external API / package / push / deploy / production canary

---

## D6 のゴール
`scoreCandidate` に bag/accessory 用の **最小限の weight** を追加し、 pickBest の精度を上げる。 D3 で不可触だった scoring 軸への限定進出。

---

## 現在の scoreCandidate 構造（read-only 監査）

`app/(culcept)/calendar/_lib/outfitEngine.ts` の scoreCandidate（base 50）:

| 加減点 | 既存対象 | bag/accessory での挙動 |
|---|---|---|
| season `+10/-15` | 全 item | `if (item.season)` で gated → 未設定なら無変化 ✓ |
| thickness `+10/+3` | 全 item | gated ✓ |
| formality `+15/+5/-10` | 全 item | gated ✓ |
| recentlyWornIds `-20` | 全 item | id 一致なら適用 ✓ |
| qualityScore `+...` | 全 item | `if (item.qualityScore)` で gated ✓（NaN なし） |
| moodShift `+5` | 全 item（formality 必要） | gated ✓ |
| persona boost `×2` | 全 item | `if (persona && completeness > 0)` ✓ |
| satisfaction boost | 全 item | satisfactionProfile 必要 ✓ |
| rejection 反映 | 全 item | cache 必要 ✓ |
| abPreference | 全 item | 無条件加点 |
| rotation/seasonal | 全 item | cache 必要 ✓ |

**結論**: 既存 scoreCandidate は **全 item 共通**。 bag/accessory も既存 `if (item.X)` ガードで NaN/過剰加減点なし（D2-0 audit 済）。

---

## D6 で入れる bag/accessory 限定 weight 案（D6-2 実装範囲）

scoreCandidate の `return score` 直前に、 `item.categoryMain === "bag" | "accessory"` で gated な分岐を追加。 各 **+3 程度の控えめな加点**（既存 season +10 / formality +15 より明確に小さい）。

### bag
- `subcategory.endsWith("backpack")` + `requiredFormality === "casual"` → +3
- `subcategory.endsWith("tote" | "shoulder" | "crossbody")` + `requiredFormality === "smart" | "dress"` → +3

### accessory
- `subcategory.endsWith("scarf")` + `recThickness === "thick"`（既存 cold day 代理） → +3
- `subcategory.endsWith("jewelry")` + `requiredFormality === "dress"` → +3
- `subcategory.endsWith("belt")` + `requiredFormality === "casual" | "smart"` → +3
- `subcategory.endsWith("hat")` → **D6 では省略**（hotSunny / outdoor context が scoreCandidate のシグネチャから取れない。 hat は D4 で eligibility tier 済なのでここでの加点は次回 design gate で扱う）

---

## 既存スコアへの影響評価

- tops/bottoms/shoes/outer item は **全く加減点されない**（条件全て `categoryMain === "bag" | "accessory"` で gated）
- 既存 sync score の計算は item 集合のみに依存。 bag/accessory の pickBest 結果が変わっても、 tops/bottoms/shoes 単独の sync score は不変
- Calendar 全テスト退化 0 が必須条件

## bag/accessory 限定 weight の安全性

| 項目 | 評価 |
|---|---|
| NaN 発生 | なし（既存 `if (item.X)` パターン踏襲） |
| 既存挙動への副作用 | なし（gated by categoryMain） |
| 過剰加算 | 最大 +3 × 1 件 → 既存 ±15 と比べて控えめ |
| pickBest top-3 ランダム選択への影響 | scored top-3 の中で bag/accessory 優先が出る程度（劇的変化なし） |
| 属性未設定 case | subcategory 未設定 / categoryMain 未設定 / 不明値 → 加減点なし（中性扱い） |

---

## D6-1 baseline score test の必須要件

D6-2 着手前に **必ず**作成する:

1. 既知 wardrobe item（tops/bottoms/shoes/outer 各種類・属性パターン）で scoreCandidate を呼び、 具体的な数値を固定
2. season/thickness/formality の代表組み合わせをカバー
3. recentlyWornIds 未使用 / persona null / satisfactionProfile null / cache null（最小依存）
4. D6-2 後も同じ数値を assert（**tops/bottoms/shoes/outer のスコア完全不変**を構造的保証）
5. bag/accessory 既存スコアも記録（D6-2 後に「条件下で +3 されている」ことを assert する基準にする）

---

## D6 commit 分割

| | commit | スコープ |
|---|---|---|
| **D6-0** | 本ドキュメント + decision-log | docs-only |
| **D6-1** | baseline score test + 必要なら scoreCandidate export | test + 最小 export |
| **D6-2** | scoreCandidate に bag/accessory 限定 weight 追加 | engine 本体・最小修正 |
| **D6-close** | docs close + decision-log | docs-only |

---

## STOP 条件
- D6-1 baseline score test が作れない（関数の依存が深すぎる場合）
- D6-2 で tops/bottoms/shoes/outer の score が変わる
- Calendar test が退化
- plan test が退化
- scoreCandidate の大改修が必要になる
- bag/accessory 未設定 item で NaN/過剰減点が出る

---

## GO / NO-GO
- **D6-0 design gate: GO（CEO 承認・docs commit へ）**
- D6-1 着手は D6-0 commit 後（baseline test なしの D6-2 実装は禁止）
