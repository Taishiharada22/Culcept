# Second Self Map — L3 mini design（selective forgetting・regime-change 緩和）

> 2026-06-05 / **設計のみ・実装 GO 待ち** / 前提: v0 + L1 + L4（partial-pooling）main 着地済（`44633d16`）。
> 上位: `docs/second-self-map-implementation-plan.md`（L3=selective forgetting）。

---

## 0. 目的（一言）
ユーザーの移動パターンが**変わった時だけ**、古い確信を少し弱めて新しいパターンを surface しやすくする。**素朴な time-decay は使わない**（時間が経っただけでは忘れない）。belief を消さず **precision を下げる**。

## 1. 核原則（CEO 指定・不可侵）
- ❌ 素朴な time decay（時間経過だけで忘れる）→ **禁止**。
- ✅ explicitCorrection が続くなど、**既存 belief と新しい選択が明確に矛盾した時だけ**緩める。
- ✅ 忘れる（削除）でなく **precision を下げる**（古い確信を少し弱める）。
- ✅ selectedModeStore / hypothesisFeedbackStore / mobilityObservationStore は**壊さない（READ のみ）**。
- ✅ L4 の partial-pooling と**矛盾しない**（L3 は L4 の下層で重みを調整）。
- ❌ Google API / DB / push / PR / GitHub。

## 2. なぜ素朴 time-decay でないか（research 整合）
preference-not-policy: 選好は安定。時間が経っただけで忘れるのは誤り（去年の電車習慣を「古いから」と弱めるのは過剰）。**変化の証拠（contradiction）がある時だけ**適応すべき。→ L3 は **change-point 検出駆動**（時間駆動でない）。

## 3. 検出（regime-change signal・pure）
**leg（L3-a）/ OD（L3-b）ごとに「最近の選択が確立 belief と明確に矛盾しているか」を検出。**
- 主信号: **explicitCorrection の連続**（hypothesisFeedback 由来）。直近 N 回連続で、確立 topMode X ≠ 一貫した別 mode Y への訂正 → 「X→Y の regime-change」。
- change-point = その streak の開始日。
- ★no streak（矛盾なし）→ regime-change なし → **緩和ゼロ（現状の挙動と完全同一）**。時間が古いだけでは発火しない。
- （L3-b 補強候補: 直近 K 観測の topMode ≠ 歴史 topMode、の持続シフト。correction だけでなく selected の沈黙的シフトも拾う）。

## 4. 緩和（precision relaxation・削除でない）
- change-point **より古い**観測の precision 重みを `× λ`（λ<1・例 0.5）。新 regime（post-change）は `×1`。
- 「少し弱める」= λ は中庸（0 でない＝消さない・1 でない＝弱める）。tunable（L4-c 同様データ後較正可）。
- 結果: 古い X-regime が down-weight され、新 Y が速く surface。belief は**消えない**（古い観測は残り、重みだけ低下）。

## 5. L4 との整合（L3 は L4 の下層）
- 現在の per-observation 重み = `precisionWeight(feedback, mode)`（selected1/confirmation1/correction2）。
- L3 は **`precisionWeight × regimeFactor(観測, change-point)`** に拡張。regimeFactor = pre-change なら λ / post-change なら 1 / regime-change なし なら 1。
- L4（buildOdBelief / buildWeightedModeBelief / global）は **L3 調整後の重み**を集計・pool。→ 完全に composable（L3 が重みを作り、L4 が pool）。
- ★no regime-change → regimeFactor 全 1 → L4/v0/L1 と完全同一（**退行ゼロ**・additive）。

## 6. pure 境界 / 既存非破壊
- **pure**: regime-change 検出（feedback streak 解析）/ regimeFactor 算出 / 重み拡張版の belief。
- **additive**: 既存 precisionWeight・buildWeightedModeBelief・buildOdBelief・buildPooledBelief* は温存。L3 は重み adapter を注入する新経路 or オプション引数（decision）。
- **READ のみ**: 3 store 不変。新 store なし。Date.now 不使用（change-point は観測日 = plan 日付から決定論）。

## 7. 段階
| phase | 内容 | 純度 |
|---|---|---|
| **L3-a** | legKey 単位・explicitCorrection streak で regime-change → pre-change 観測を ×λ。最小核。 | pure |
| **L3-b** | OD 単位 + correction 以外のシフト検出（持続的 topMode 変化）。 | pure |
| **L3-c** | λ / streak 長 N の較正（実データ後・L4-c と同方針）。 | pure |
| 配線 | 重み adapter を belief 経路に注入（production 反映） | wiring（別 GO） |

## 8. リスク / 独立論点
| 論点 | 方針 |
|---|---|
| 誤検出（一時的 1 回の訂正で緩めすぎ） | streak N≥2-3 を要求（単発訂正では発火しない）・λ 中庸 |
| 素朴 decay に滑らない | regimeFactor は change-point 駆動のみ・time 駆動ゼロ（§3） |
| L4 と二重緩和 | L3 は重みのみ・L4 は pool のみ・順序固定（L3→L4）で重複なし |
| change-point の信頼 | streak の一貫性（同一 Y への連続）を要求・false positive 防止 |
| stores 破壊 | READ のみ・pure・新 store なし |
| copy「いつもは」 | L3 は belief 重みのみ・copy は触らない（別 slice） |

## 9. CEO 判断点（L3 実装 GO 前）
1. 検出信号 = **explicitCorrection streak（N≥?）** で開始で良いか（topMode シフトは L3-b）。
2. streak 長 N（例 **2** or **3**）。
3. 緩和 λ（例 **0.5**・中庸）。較正は L3-c・データ後。
4. 適用レベル = **legKey（L3-a）先**・OD は L3-b。
5. 注入方法 = 重み adapter の新経路 or オプション引数（既存 precisionWeight 温存）。

## 10. 参照
- L4（下層を共有）: `docs/second-self-map-l4-closeout.md`
- precision 加重: `docs/second-self-map-v0f-mini-design.md`
- selective forgetting 出自: research#1（precision 緩和・時間 decay でない・regime-change trigger）
