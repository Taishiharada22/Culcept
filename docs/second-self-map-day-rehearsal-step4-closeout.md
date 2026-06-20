# Day Rehearsal — step 4 closeout（pure simulation layer・未配線・branch）

> 2026-06-06 / **pure simulation layer main 着地（main `f1e87f39`・pure `2cf09824` を squash・新規ファイル・未配線・20 test・tsc footprint 0）**。UI/PlanClient/MapTab/DB 非接触＝production 不変。配線は別 GO。
> GO: CEO/GPT step 4「pure simulation layer まで・UI/production は別 GO」→ main 着地 GO。mini design: `docs/second-self-map-day-rehearsal-mini-design.md` / 配線: `docs/second-self-map-day-rehearsal-wiring-mini-design.md`。

---

## 1. 何を作ったか（新規ファイルのみ・既存非改変）
| ファイル | 内容 |
|---|---|
| `lib/plan/dayRehearsal/dayRehearsalTypes.ts` | `Estimate`(level+score+**evidence**)・`Evidence`(basis/known/unknown/inferred)・`RehearsalInput`/`DayRehearsal`・`DayRehearsalConfig`(固定値) |
| `lib/plan/dayRehearsal/dayRehearsal.ts` | `rehearseDay` engine（前方積分 + 6 計算）+ `buildRehearsalInput` adapter（既存 building blocks の join） |
| `tests/unit/plan/dayRehearsal/dayRehearsal.test.ts` | engine 16 + adapter 4 = **20 test** |

## 2. 6 計算（すべて仮説 estimate + evidence trace）
| # | 計算 | 方法 | 根拠 |
|---|---|---|---|
| 1 | **成立 (viability)** | 時間(feasibility insufficient) + 状態(peak strain) → holds/tight/breaks/**unknown** | feasibility(観測) + strain(仮説) |
| 2 | **friction** | 移動時間 + mode 負荷 + shortfall | transport + feasibility |
| 3 | **buffer** | feasibility slack を**そのまま**（観測・推定でない） | computeDayFeasibility |
| 4 | **strain** | 前方積分 `F += event + travel − recovery`（clamp≥0） | duration/時間帯/密度（仮説） |
| 5 | **recovery** | gap の余白から（sufficient slack のみ） | feasibility slack |
| 6 | **convergence**（"risk"） | buffer_short ∧ strain_high ∧ friction_high の**重なり**（確率/警告でない） | observed + inferred 区別 |

## 3. 核原則の達成（CEO/GPT 補正）
- ✅ **断定しない**: strain/recovery/friction/convergence は**仮説 estimate**。score は内部・相対（表示しない）・level が観測トーン出力。`fatigue` を事実扱いしない。
- ✅ **evidence trace**: 各推定が `{basis, known, unknown, inferred}` を携える。**unknown/missing/inferred を区別**。
- ✅ **「risk」≠ Arrival Risk**: convergence は確率でなく「何が重なったか」の factors。feasibility 層の「リスク表記禁止」と整合。
- ✅ **unknown は unknown**: travel duration null は捏造せず unknown 計上（coverage.travelUnknown）。全 unknown → viability unknown（過剰主張しない）。
- ✅ **最適化でない**: 予定を動かさない・修正案/auto-reschedule なし・TSP なし。forward 走査して観測を返すのみ。
- ✅ **pure**: READ のみ・Date 不使用（"HH:MM"→分）・決定論・degrade（energy/feasibility/transport 欠落でも動く）。

## 4. 既存 building blocks の使い方（実検証済・main 846c3a2e）
- `buildDayGraph`→DayGraph（nodes 時系列・density・dayMood）/ `computeDayFeasibility`→slack(buffer) / `TransportSegment`→mode/duration。
- adapter が join: events=nodes(kind=event) 順・transition i を `transition_${i}` で feasibility・event id で transport に join・gap は時刻差。
- mobility belief / InnerWeather は optional 拡張（MVP は transport mode + energyLevel・無くても degrade）。

## 5. 検証（branch `2cf09824`）
- **20 test PASS**: 空日→unknown / 単一 event / 余白十分→holds / 不足→convergence buffer_short / unknown travel→evidence.unknown / 多 event 累積単調 / recovery で strain 戻る / 不足+高 strain+高 friction→breaks / evidence known/unknown/inferred / degrade / energy 低→level↑ / 決定論 / Date 不使用 / 全 unknown→unknown / holds / convergence=factors。adapter: join/gap/欠落 unknown/assumed。
- **tsc footprint 0**（dayRehearsal 実ファイル・total 1114=baseline）・**新規ファイルのみ（既存非改変=production 不変）**。

## 6. 残（CEO 判断 / 別 GO）
- ✅ **main 着地済**（`f1e87f39`・新規ファイル・未配線・production 不変）。
- ✅ **配線 mini design 済**: `docs/second-self-map-day-rehearsal-wiring-mini-design.md`（どこに/粒度/仮説トーン copy/PlanClient 接続・判断点 4）。
- **配線実装**（rehearseDay を Plan view に・仮説トーン copy・生数字なし・表示のみ）= 別 GO（CEO 判断待ち）。
- **belief/InnerWeather 統合拡張**（mode 予測 fallback・base energy 精緻化）= 別 slice。
- **較正**（config の係数・threshold）= `calibration-backlog.md`（実データ後）。
- **Reality Control OS 消費**（Repair/Optimize が rehearsal を読む）= 後段。
- push / PR / Vercel / deploy = 禁止（未実施）。

## 7. 参照
- code: `lib/plan/dayRehearsal/`（dayRehearsalTypes / dayRehearsal）/ test: `tests/unit/plan/dayRehearsal/`
- mini design: `docs/second-self-map-day-rehearsal-mini-design.md` / 較正: `docs/second-self-map-calibration-backlog.md`
