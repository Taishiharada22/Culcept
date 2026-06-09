# Phase A closeout — 本人モデル & 診断の深化（LOCAL）

> 2026-06-09 / Build Unit / CEO 指示。Phase A（A0〜A4）+ 追加 PRG 軸（Movement Tolerance / Energy Rhythm / PRG Readiness）が
> **local/dogfood 段階**に到達したため、ここで一度 closeout する。
> 全 dogfood flag は gate `flag ∧ NODE_ENV!=="production"` で **production hard block**（dev/dogfood のみ ON）。

---

## 1. Phase A 各 slice の最終状態

### A0 理由捕捉 / correction-via-explanation — ★**v0 完了 / 鏡は後**
- 完了: 推奨と違う選択時の 1-tap reason 捕捉（tired/scenery/cheap/hurry/mood/other・hypothesisFeedbackStore）・reason insight pure 層（A0-1）・reflection UI（A0-2）・Movement Tolerance での tired corroboration 利用。
- 未完（後続）: M5 鏡レベルの自己発見レポート・Alter/Stargazer 深い統合・長期 correction memory の本番接続。
- → **魂の入口は起動済み。完成形の鏡は Phase D。**

### A1 あなたのペース — ★**local 完了寄り / 実データ較正待ち**
- 完了: time-budget tendency・personal pace ratio・manual log UI・GPS auto capture 安全版・opt-in 導線・activation readiness・shadow report・dogfood observation log・per-group gating/rollback/kill switch 土台・canary readiness。
- 未完: broad activation・production・DB/cross-device・実データ較正・本番 Day Rehearsal 反映。flag（PERSONAL_PACE/GPS_CAPTURE/PACE_SHADOW）は **OFF 維持**。
- → **local ではかなり完成。実運用・較正は実データ依存。**

### A2 文脈条件付け — ★**dogfood 中**
- 完了: context modifier（belief 非汚染・決定時のみ）・day-level/leg-level weather・snow/storm/heat/cold 精密化・weatherKind capture・weather reaction readiness engine・本人 density baseline・dogfood 有効化（CONTEXT_MODIFIER=true）。
- 未完: personal weather overlay の live 反映（実データ蓄積後）・production 露出・閾値較正。

### A3 What-if 深化 — ★**pure + reason-only UI dogfood**
- 完了: slice 1 qualitative magnitude 語彙（偽数値ゼロ）・slice 2 inverse what-if（typed scenario・独立 day-level coherence gate ≥2・「守る意味の説明」）・slice 3 candidate comparison（手堅い/現状/積極的の診断レンズ・contrast gate・最適案/断定なし）・reason-only UI（DayOutlookBanner 最大 2 行・CEO smoke PASS・dogfood 有効化 INVERSE/SCENARIO_COMPARISON=true）。
- ★不変: Day Rehearsal 本流/scoring/marker/repair candidate 生成には **不反映**（純粋 read・copy のみ）。
- 未完: Day Rehearsal soft connection（次設計）・本流反映（CEO stop gate）。

### A4 Place Affinity — ★**reason-only dogfood / ranking はデータ待ち**
- 完了: revealed preference（P2）・conditional（P3）・general+personal combiner（P4・bounded nudge≥0）・reason-only UI（P5/5.1/5.2 weather/timeband/weekday）・shadow ranking 検証（P5.3）・shadow 観測（P6-0）・ranking 実反映 code（P6-1）・safety journal・dogfood 有効化（reason=true・**ranking=false 維持**）。
- 未完: ranking 本格 ON（safety journal stable_safe 後・CEO）・実データ蓄積後 tuning・production。

## 2. 計画外で完了した PRG 軸（全て dogfood 中）
- **Movement Tolerance（移動耐性）**: mode-effort の条件別 skew（implicit）+ A0 tired corroboration（explicit・global・HONESTY=条件 join しない）+ reason-only UI（MobilityLegCard 1 行）。dogfood ON。Day Rehearsal 反映は未実施。
- **Energy Rhythm（活動リズム）**: timeband presence（均等 baseline 比・「活動の記録」止まり・朝型/夜型 trait 禁止）+ reason-only UI（MT 優先 AT MOST 1 行）。dogfood ON。
- **PRG Readiness Console**: 横断 evaluator（5 状態: dormant/accumulating/dogfooding/needs_attention/activation_candidate・stability 証拠なしに activation 候補と呼ばない）+ /ceo operator console（read-only・status のみ）。dogfood ON。

## 3. Phase B/C/D の状態
- **Phase B（cross-day/早期警告）**: ★**データ蓄積 or DB read 承認まで HOLD**。Recovery Pattern audit で確定（過去日 density は非永続=Supabase 要・lag-1 は連続観測日ペア 0=speculative）。Social Battery/Past Regret も同様の stop gate。
- **Phase C（production/Reality apply/DB）**: ★**GitHub / production / Reality apply 復帰まで HELD**（計画通り）。
- **Phase D / M5 鏡**: ★**A/B/C と長期データ後**。素材は増えた（reason capture/pace/context/weather/place/tolerance/rhythm）が、Stargazer 合流・長期記憶・レポート生成・Alter 言語化・production DB が未。

## 4. 現在の全 flag（dev-only / production hard block）
| flag | 値 |
|---|---|
| A2 CONTEXT_MODIFIER | **true**（dogfood） |
| PLACE_AFFINITY reason / ranking | **true** / false |
| MOVEMENT_TOLERANCE reason | **true** |
| ENERGY_RHYTHM reason | **true** |
| PRG_READINESS_CONSOLE | **true** |
| A3 INVERSE / SCENARIO_COMPARISON | **true** / **true**（dogfood） |
| PERSONAL_PACE / GPS_CAPTURE / PACE_SHADOW | false / false / false |

## 5. 一言まとめ
```txt
Phase A の PRG 土台は完成。A0/A1/A2/A3/A4 + Movement Tolerance + Energy Rhythm + PRG Readiness が
local/dogfood 段階に入った。以後の前進は (a) dogfood 実データ蓄積、(b) CEO の gate 解除
（DB read / production / Reality apply / 本流反映）、(c) Phase D 鏡の再設計、のいずれかに依存する。
```

## 次
次設計（mini-design のみ・実装しない）: A3 Day Rehearsal soft connection / Phase B readiness gate / Dogfood operation plan → `docs/phase-a-next-designs.md`。
