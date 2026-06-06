# Second Self Map — L3-b-2 closeout（selected-only 持続シフト・pure・未配線）+ 配線判断材料

> 2026-06-06 / **L3-b-2 pure main 着地（main `846c3a2e`・未配線・mobility 233 test・tsc 0）**。MapTab 未配線＝production 不変・退行ゼロ。配線は CEO 判断待ち（実データ後 / 明示 GO まで保留）。
> 上位: `docs/second-self-map-l3b-mini-design.md`。前提: L3-a/L3-b-1 が main live（`0cc5217b`→`846c3a2e`）。

---

## 1. 何を解くか（と、なぜ危険か）
L3-a/L3-b-1 は **explicitCorrection**（仮説への明示的反抗）駆動。だが「仮説が出ていない時に黙って mode を変えた」silent な習慣変化は拾えない。L3-b-2 はこれを拾う。
**ただし最弱信号**: selected-only は「明示的に逆らった証拠」がない。雑にやると一時的な揺れ（旅行・季節・怪我）を regime-change と誤検出し、**正しい習慣まで勝手に弱める「勝手に忘れる地図」**になる。→ 最も厳しい発火条件 + 最も緩い relaxation + legKey 限定。

## 2. 実装（additive・L3-a/L3-b-1 非破壊）
| 要素 | 内容 |
|---|---|
| `computeSilentShiftRegimeChange` | **SELECTED のみ読む**（feedback 不使用）。recent K=4 が全一致で別 mode Y ∧ baseline(streak より前)が強い(total≥4 ∧ topShare≥0.6=not split) ∧ Y≠baseline topMode のみ発火。change-point=streak 開始日 |
| `computeLegOdRegimes`（抽出） | L3-b-1 の inline 計算を helper 化（挙動不変・**213 既存 test で検証**） |
| `computeFullRegimeFactorFn` | **leg > OD > silent**（強い信号優先・regimeFactor 1 つ・二重緩和なし）。silent は leg/OD regime を持たない legKey だけ |
| `buildL3b2`/`loadL3b2PooledBeliefMultiLevel` | full factor を L4-b に注入 |

config（GPT 確定）: K=4 / **λ_silent=0.8**（λ_leg=0.5 < λ_od=0.7 < λ_silent=0.8＝信号が弱いほど緩い relaxation）/ baseline total≥4 ∧ topShare≥0.6。

## 3. 安全弁（誤検出＝「忘れる地図」を防ぐ）
1. **SELECTED のみ**→ explicitCorrection/confirmation を二重使用しない・**stale feedback と無関係**（構造的）。
2. **recent K=4 全一致**（3/4 等の曖昧は不発火）+ **強 baseline 必須**（弱い/split は不発火）。
3. **λ_silent=0.8**（最も緩い・古い確信をほんの少し弱めるだけ・削除でない）。
4. **legKey 限定**（OD への selected-only 波及は危険ゆえ deferred＝安全側）。
5. **時間単独で発火しない**（recent が baseline と持続矛盾が trigger）・Date 不使用。
6. **退行ゼロ**: silent shift も leg/OD regime も無ければ恒等 → L3-b-1/L4-b 完全同一。

## 4. 検証（branch `631b927a`）
- mobility **233 test PASS**（silent shift 20 + 既存 213）・tsc footprint 0・**refactor で L3-b-1 の 32 test 不破壊**。
- 20: 1-3回不発火/4回発火/弱・split baseline 不発火/recent バラバラ不発火/correction・confirmation・stale 不使用/time decay なし/changePoint/λ_silent 境界/削除でない/L3-b-1 同一/legKey-local/READ のみ/fetch なし。
- **MapTab 未配線**（loadL3b のまま）・production 挙動変更ゼロ。

---

## 5. ★配線判断材料（CEO 判断）
**配線したら何が変わるか**: MapTab belief を `loadL3b2` に swap（1 行）。
- **即時**: silent shift 未蓄積 → **L3-b-1 と完全同一**（退行ゼロ）。
- **蓄積後**: ある legKey で「強い baseline → recent 4 連続で別 mode」が起きると、古い確信を ×0.8。explicitCorrection なしでも習慣変化に追従。

**配線の Pro / Con**:
| | 内容 |
|---|---|
| Pro | 適応能力が完成（明示訂正なしの習慣変化に追従）。退行ゼロ + λ_silent=0.8 + 強条件で即時リスク極小。L3-a/L3-b-1 と同じ注入経路で構造的に安全 |
| Con | **最弱信号**。K=4/λ_silent=0.8/baseline 閾値は**実データ未検証**（憶測値）。誤検出の最終防壁が「強 baseline + K=4」のみ。一時的シフト（季節・出張）を拾う可能性は残る |

**推奨（Claude）**: **当面 pure 保持を推奨**。理由：
1. silent は最もリスクの高い信号で、配線を急ぐ実利が薄い（correction 駆動の L3-a/L3-b-1 が既に適応を提供）。
2. K/λ_silent/baseline 閾値が実データ未検証。**まず L3-a/L3-b-1 の実 correction データで regime 機械の挙動を観測 → L3-c で silent params を実選択パターンに較正 → その後に配線**が安全。
3. 「勝手に忘れる地図」は世界観毀損リスク大。最弱信号は最後に・最も慎重に live 化すべき。
- ただし配線する場合も即時リスクは極小（退行ゼロ）。CEO が「適応完成を優先」と判断するなら、wire smoke（L3-b-1 同型 + silent 固有: 4 連続で発火/3 で不発火/legKey-local/退行ゼロ）→ 着地は可能。

## 6. 残
- **配線可否 = CEO 判断**（本材料に基づく）。配線するなら wire smoke + main 着地 + 配線 closeout。
- **L3-c**（K/λ_silent/baseline/streakN/λ_leg/λ_od の実データ較正）/ **L4-c**（κ較正）= データ蓄積後。
- **OD selected-only 波及**（L3-b-2 で deferred）= 必要性が出れば別途設計。
- push / PR / Vercel / deploy = 禁止（未実施）。

## 7. 参照
- code: `lib/plan/mobility/mobilitySelectiveForgetting.ts`（computeSilentShiftRegimeChange / computeFullRegimeFactorFn / computeLegOdRegimes）/ `mobilityRepertoireBelief.ts`（buildL3b2 / loadL3b2）
- test: `tests/unit/plan/mobility/mobilitySilentShift.test.ts`（20）
- L3-b 設計: `docs/second-self-map-l3b-mini-design.md` / L3-b-1: `docs/second-self-map-l3b1-closeout.md`
