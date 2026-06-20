# Day Rehearsal WPM-2 audit — recovery marker の根拠検証（実コード）

> 2026-06-06 / **audit 結論: 実装せず停止（gapMin は根拠が弱い）** / CEO 方針「gapMin/gap/raw feasibility のどれを根拠にするか実コード検証・弱いなら停止して報告」。
> 前提: WPM-1 詰まり marker live（main `1414bf38`）。Option D（status-only）配線。

---

## 0. 問い
recovery marker「ここは一息つけそう」を、**gapMin / DayGraph gap / raw feasibility** のどれを根拠に出すべきか。

## 1. 実コード検証
| 候補 | 実体 | Option D での可用性 | 根拠の質 |
|---|---|---|---|
| **raw feasibility（slack）** | `slack = available − travel`（= 真の free time）。`transitionRecovery` が依存（`dayRehearsal.ts:121`） | ❌ **null**（display 層が raw 分数を破棄・`buildRehearsalInputFromDisplay` で slackMin: null） | ✅ **sound**（真の余白） |
| **gapMin** | `max(0, next.startTime − prev.endTime)`（`dayRehearsal.ts:307`）= **event 間隔・移動時間を含む** | ✅ 可（event 時刻から） | ❌ **弱い**（free time の**上界**・travel 分を過大評価） |
| **DayGraph GapNode** | `durationMin`（≥ `DEFAULT_MIN_GAP_MINUTES`=30・event 間隔） | ✅ 可 | ❌ gapMin と同じ（移動込み） |
| bufferStatus "sufficient" | travel ≤ available（= 余白 ≥ 0） | ✅ 可 | ⚠️ **量を言わない**（slack が 1 分か 120 分か不明）→ 過大評価を解消できない |

## 2. 評価（なぜ gapMin が弱いか）
- 真の余白 = `slack = gapMin − travel`。**travel が Option D で不明**（transport 未公開）→ slack を算出できない。
- gapMin は free time の **上界**: 2h の gap が「1.9h 移動 + 0.1h 余白」かもしれない。→ gapMin で「一息つけそう」を出すと、**移動が大半の gap を誤って recovery 表示**（misleading）。
- "sufficient" を併用しても「travel ≤ gap」しか分からず、余白の**量**は不明 → 過大評価は残る。
- ★convergence（WPM-1）は **buffer 不足という観測**を根拠にできた（sound）。recovery は「余白が十分ある」という**量の主張**が必要で、量が無い Option D では sound にならない。

## 3. 結論
**recovery marker は実装せず停止。** gapMin/GapNode は available だが free time の上界で過大評価＝honest な「一息つけそう」の根拠として弱い。**sound な根拠（真の slack）は raw feasibility にのみ存在し、Option D で破棄されている。**

## 4. 道筋（recovery を sound に出すには）
- **Option A（raw feasibility 公開）が前提**: `runFeasibilityDisplayPipeline`(`feasibilityDisplayPipeline.ts:143`) が内部で `computeDayFeasibility`→`DayFeasibilityResult`(raw slack/shortfall) を**計算済だが破棄**。これを additive に公開（hook + pipeline の戻りに raw を足す）すれば、recovery は真の slack を使える。
  - 副次効果: convergence も分数（magnitude）を持て、精度↑。
- Option A 後の recovery: `transitionRecovery`（既存・slackMin 依存）がそのまま動く → recoveryWindows が埋まる → WPM-1 と同 pattern で「一息つけそう」marker を sound に出せる。
- ★Option A は以前 banner 段で defer 済（hook 改修を避けた）。recovery を出すなら今 Option A を解禁する判断が要る。

## 5. CEO 判断点
1. **recovery marker を出すために Option A（raw feasibility additive 公開）を解禁するか**。
   - 解禁する → WPM-2a（Option A: pipeline/hook の戻りに raw DayFeasibilityResult を additive 追加・既存 display 挙動不変）→ WPM-2b（recovery marker）。
   - 解禁しない → recovery は **保留**（gapMin では honest に出せない）。詰まり marker（WPM-1 live）で時間軸価値は既に出ている。
2. （参考）transport 統合（travel duration）でも slack 算出可能だが、transport は非決定的（provider 依存）で Option A より重い。→ Option A（feasibility raw）が最短・最 sound。

**推奨**: recovery は価値があるが、**honest さを優先し gapMin では出さない**。Option A（小さな additive hook 改修）を解禁してから recovery を sound に出すのが正道。Option A を今やるか、recovery を保留するかは CEO 判断。

## 6. 参照
- code: `lib/plan/dayRehearsal/dayRehearsal.ts`（gapMin:307 / transitionRecovery:115-）/ `lib/plan/feasibility/feasibilityDisplayPipeline.ts:143`（raw 計算→破棄）
- 前提: `docs/second-self-map-day-rehearsal-wpm1-closeout.md` / W-1 audit（Option D の displayMap shape）
