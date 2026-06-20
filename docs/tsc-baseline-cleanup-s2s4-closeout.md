# tsc baseline cleanup — S2-S4 closeout（source 低リスク型ズレ）

> 2026-06-07 / **実装・main 着地完了**（CEO 承認） / 前提: S1 完了（1114→144）・監査 `tsc-baseline-cleanup-audit.md`。

---

## 0. 状態
- **ローカル main 着地済**（squash・main HEAD `be6f12f6`・親 `19e64b34`）。code branch `claude/tsc-s2s4-source`（HEAD `c47b12fd`）保持。
- push/PR/GitHub/Vercel/DB/Google **未接触**。**S2-S4 の低リスク型ズレのみ**（危険/仕様判断要は残置・S5/S6 未着手）。

## 1. 監査結果（S2-S4 source・read-only 分類）
「明確に型のみ・production 挙動不変」のものだけ修正。仕様/logic/挙動変更/ripple のものは HARD GATE に従い残置。

### ✅ 修正した（低リスク・外科的・6 errors）
| # | 箇所 | 修正 | 種別 |
|---|---|---|---|
| 1 | `CeoDashboardClient.tsx` SkillSummary interface | `autoCloseCount: number` 追加 | missing field（API/集計で既出） |
| 2 | `app/api/ceo/dashboard/route.ts` emptySkill literal | `autoCloseCount: 0` 追加 | missing field（空ケース既定値） |
| 3 | `ceo/notifications/page.tsx` setType | `useState<(typeof NOTIFICATION_TYPES)[number]["value"]>` | literal narrowing 解消（型注釈のみ） |
| 4 | `app/components/chat/hooks/useMemoryItems.ts` subscribe | param に `string` 注釈 | implicit any 解消（非 any） |
| 5 | `lib/alter-morning/types.ts` EndpointAnchor | `fixedStart?: string` additive | missing field（intentParser が既に代入済の runtime 形） |

### ⏸ 残置（HARD GATE 該当・修正せず）
| 箇所 | 理由 | 回し先 |
|---|---|---|
| `skillTelemetry.ts` isAutoClose | query が `summary` を select していないのに `r.summary` 参照＝**real bug**。修正（select に summary 追加）は autoClose 検出が動き出し**production 挙動変更** | 仕様判断（autoClose 検出を有効化するか）→ 別 GO |
| `generatePairInsight.ts` coreValues | `AlterGrowthSummary` 型に coreValues なし・loader も未設定＝**feature 半完成**（field が存在しない） | 仕様判断（coreValues を growth に持たせるか） |
| `llmPlanExtractor.ts` "work" 比較 | TS2367 no-overlap＝category union に "work" がない（stale or 誤り）＝logic | logic 判断 |
| `morningPipeline.ts` SynthesisSource | union 不一致（target field 型 vs SynthesisSource）＝comprehension 型に ripple の恐れ | 型調査要 |
| `journeyOriginPromotionTelemetry.ts` StargazerEvent | string vs StargazerEvent enum＝event 型付けが caller に ripple の恐れ | 型調査要 |
| `MorningMapView.tsx` google | global `Window.google` 重複宣言（別ファイルと構造同一・名目別）＝**構造的・複数ファイル** | 構造調査要 |
| `BaselineCollectionClient.tsx` OCCUPATION | `as const` heterogeneous tuple の型推論＝const 型注釈変更が occupation 型に ripple | 型調査要 |
| `tourState.ts` (×4) | `TourStates \| null` narrowing＝return 値の非 null 化 refactor（borderline） | 別 slice |
| `OriginPageClient.tsx` onStartExploration | welcome phase で必要かの**仕様判断** | 仕様判断 |
| `app/api/stargazer/alter/route.ts` (15) | **S5・core path**・perspectiveEngine 乖離・owning session 文脈要 | S5（明示対象外） |
| test 型エラー (107) | fixture/signature 陳腐化（`fail()` 含む） | S6（後回し） |

## 2. before / after（main 計測）
| 指標 | before(S1後) | after(S2-S4後) | 差 |
|---|---|---|---|
| 総 error TS | 144 | **138** | −6 |
| source errors | 37 | 31 | −6 |
| 累計（S0→S1→S2-S4） | 1114 | **138** | −976 |

## 3. production 挙動変更の有無
- **なし**。全 5 修正は型注釈/missing field/param 注釈のみ。runtime ロジック・値・分岐は不変。
  - autoCloseCount: 空ケースは元々 undefined→0 で `> 0` false（不変）。client は ?. + ?? 0（不変）。
  - notifications/useMemoryItems/EndpointAnchor: 型注釈のみ（runtime emit なし）。

## 4. 変更ファイル（5・型のみ・+7 −3）
- `app/(culcept)/ceo/CeoDashboardClient.tsx` / `app/api/ceo/dashboard/route.ts` / `app/(culcept)/ceo/notifications/page.tsx` / `app/components/chat/hooks/useMemoryItems.ts` / `lib/alter-morning/types.ts`

## 5. 検証
- tsc: 144→138（−6）・修正4クラスタ解消・新規エラー 0・OOM なし。
- relevant tests: alter-morning + plan = **463 files / 9474 PASS** + useMemoryItems = **47 PASS**（exit 0）。
- zero-loss: branch `c47b12fd` と byte 一致・scope外/temp/node_modules 混入 0。

## 6. 次の cleanup slice 推奨
- 残 138 = source 31（うち S5 stargazer/alter 15）+ test 107。
- 推奨順: **S6 の test fixture（runtime 影響なし・低リスク・最大ボリューム）を subsystem 別に小分割** → S5（stargazer/alter・core path・A1-5-x owning session 文脈確認を挟む）。残置した source 仕様判断系（skillTelemetry/coreValues/llmPlanExtractor 等）は各々の owning 機能の判断が要るため個別 GO。
- いずれも **CEO GO 待ち**（S2-S4 完了で停止）。
