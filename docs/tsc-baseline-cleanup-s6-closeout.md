# tsc baseline cleanup — S6 closeout（test fixture・batch 1）

> 2026-06-07 / **実装・main 着地完了**（CEO 承認） / 前提: S1(1114→144)・S2-S4(144→138)・監査 `tsc-baseline-cleanup-audit.md`。

---

## 0. 状態
- **ローカル main 着地済**（squash・main HEAD `6138d99a`・親 `9f70563e`）。code branch `claude/tsc-s6-test`（HEAD `3c7ac215`）保持。
- push/PR/GitHub/Vercel/DB/Google **未接触**。**test fixture の明確安全 cluster のみ**（production source 不接触・cast 不使用・期待値不変）。残りは別原因/リスクで残置。

## 1. 監査結果（test 107件・read-only 分類）
| cluster | 件数 | 判定 | 処理 |
|---|---|---|---|
| extractExplicitPlace `entry` 余剰 | 17 | ✅ dead field（ActivitySpanLike は {span,index}・関数は entry を読まない） | **修正（除去）** |
| originAnchorExtractor label/source | 19 | ✅ union narrowing 不足（型のみ・assertion 不変） | **修正（type-guard helper）** |
| travelTimeEngine `fail` | 1 | ✅ jest global（vitest に無し） | **修正（throw に）** |
| anchor `as Record`→Record (4 files) | 10 | ⏸ TS 推奨は `as unknown as Record` だが **cast 多数**＝CEO「大量キャスト停止」に鑑み defer | 残置 |
| postSelectionFlow `null`→string | 13 | ⏸ prod 型が string／test が null＝**prod 型変更 or 意味変更リスク** | 残置（仕様判断） |
| urgentLayerDismiss mock + Mock型 | 12 | ⏸ reason 欠落(1・安全)＋Mock→fn cast(多数)＝混在・file 全解消できず | 残置 |
| stargazer (conversationQualityAudit 5 / voiRefutation 1 / perspectiveEngine 1) | 7 | ⏸ **S5 隣接・core path** | 残置（S5） |
| misc 長尾（phaseC/ceoScenario/planHistory/placeResolver 等） | ~28 | ⏸ 個別原因・要調査 | 残置 |

## 2. 修正（37件・test-only・同一原因 batch）
1. **`extractExplicitPlace.test.ts` (17)**: mock 3rd arg の `entry: {...} as any` を除去 → `{ span, index }`（ActivitySpanLike に一致）。関数は entry 不参照のため**挙動不変**。
2. **`journey/originAnchorExtractor.test.ts` (19)**: `JourneyAnchorState`（discriminated union: known_exact / known_label_only / unknown）の `label`/`source` を **type-guard helper `labelOf()`**（`"label" in r` 判定・cast 不使用・期待外なら throw）で narrow。assertion（label==="東京駅" 等）は不変。
3. **`travelTimeEngine.test.ts` (1)**: `fail("...")`（jest global・vitest に無し）→ `throw new Error("...")`。

## 3. production 挙動変更の有無
- **なし**。test ファイルのみ・production source 不接触。entry 除去/narrowing/fail 置換のいずれも runtime test の検証内容（assertion）を変えない。

## 4. 変更ファイル（3・全て test）
- `tests/unit/alter-morning/extractExplicitPlace.test.ts` / `…/journey/originAnchorExtractor.test.ts` / `…/travelTimeEngine.test.ts`

## 5. 検証
- tsc: **138→101（−37）**・test 107→70・**source 31 不変（増加なし）**・修正3ファイル解消・OOM なし。
- relevant vitest: alter-morning **199 files / 4501 tests PASS**（exit 0）。
- zero-loss: branch `3c7ac215` と byte 一致・scope外/temp/node_modules 混入 0・変更は test 3 ファイルのみ。

## 6. 累計
| | 件数 |
|---|---|
| S0（出発） | 1114 |
| S1 後 | 144 |
| S2-S4 後 | 138 |
| **S6 batch1 後** | **101** |
| 累計削減 | **−1013（91%）** |

## 7. 残 101 = source 31（S5 stargazer/alter 15 + 残置 source 16）+ test 70
## 8. 次の cleanup slice 推奨
- **S6 batch 2**（misc 長尾の個別原因を小分割・各 file 単位で安全なら）/ anchor cast(10) は CEO が cast 許容なら一括 / postSelectionFlow・urgentLayerDismiss は仕様/Mock 判断。
- **S5 stargazer/alter↔perspectiveEngine**（core path・A1-5-x owning session 文脈確認）。
- 残置 source（skillTelemetry/coreValues 等）は各 owning 機能の仕様判断。
- いずれも **CEO GO 待ち**（S6 batch1 完了で停止）。
