# Second Self Map — L3-b mini design（OD 単位 regime-change + 持続シフト検出）

> 2026-06-05 / **設計のみ・実装 GO 待ち** / 前提: L3-a（legKey 単位・correction streak）実装済（branch `claude/second-self-map-l3a`・`5171d703`・174 mobility test）。
> 上位: `docs/second-self-map-l3-mini-design.md`（L3 全体）。

---

## 0. 目的
L3-a の **legKey 単位・explicitCorrection streak** を拡張：
1. **OD 単位 regime-change** — 場所のパターン変化を、その OD の全 leg に波及。
2. **correction 以外の持続シフト検出** — 仮説が出ていない時の silent な mode 変化も拾う。

## 1. L3-a の限界（L3-b が直す点）
- L3-a は legKey 単位 → 同じ OD の別 leg（新 anchor 実体）に regime-change が波及しない。
- L3-a は correction のみ → 仮説が surface していない時に user が黙って mode を変えた（selected のシフト）を検出できない。

## 2. (A) OD 単位 regime-change
- legKey でなく **odKey** で correction を集約（OD の全 leg の corrections を統合）。直近 streakN が同一 Y → OD-level regime-change。
- change-point = OD streak の開始日。regimeFactorFn は **(day, legKey) で、その legKey の odKey に OD-regime があれば** day<cp で λ。
- ★sensitive/redacted leg の correction は OD 集約に使わない（L1-a/L4 と一貫）。
- L3-a（legKey）と L3-b（OD）の合成: leg 固有 regime 優先 → 無ければ OD regime（decision）。

## 3. (B) 持続シフト検出（correction 以外）
- selectedStore の直近 K 観測の topMode が歴史 topMode と**持続的に異なる**（K 連続）→ silent regime-change。
- correction（明示的反抗）より弱い信号なので、**K を大きめ**（例 3-4）+ λ を correction より控えめ（例 0.7）にする（decision）。
- ★依然 time 駆動でない（「直近 K が歴史と矛盾」が trigger・時間経過単独でない）。

## 4. L3-a / L4 との整合
- 実装は L3-a と同じ注入経路（`regimeFactorFn`）。computeRegimeFactorFn を OD 集約 + 持続シフトに拡張するだけ。builder（L4-b path）は不変（L3-a で parameterize 済）。
- ★no regime（correction なし ∧ 持続シフトなし）→ 恒等 → L4-b 完全同一（退行ゼロ）。
- 順序固定 L3→L4・二重緩和なし。

## 5. pure 境界 / 既存非破壊
- **pure**: OD 集約 detector / 持続シフト detector / 統合 computeRegimeFactorFn。
- **additive**: L3-a の detectRegimeChange/computeRegimeFactorFn は温存 or 内部統合（decision）。builder parameterize は L3-a 済（再利用）。
- **READ のみ**・新 store なし・Date.now 不使用・削除しない・copy 触らない・未配線。

## 6. 段階
| phase | 内容 | 純度 |
|---|---|---|
| **L3-b-1** | OD 単位 regime-change（odKey 集約） | pure |
| **L3-b-2** | 持続シフト検出（selected の K 連続矛盾） | pure |
| **L3-c** | streakN / λ / K の較正（実データ後・L4-c 同方針） | pure |
| 配線 | L3-aware belief を MapTab に（production 反映） | wiring（別 GO） |

## 7. リスク / 独立論点
| 論点 | 方針 |
|---|---|
| L3-a と L3-b の二重緩和 | regimeFactorFn は 1 つ（leg 優先→OD fallback・1 回だけ ×λ） |
| 持続シフトの誤検出 | K 大きめ + λ 控えめ・correction より弱く扱う |
| OD 集約と sensitive | redacted leg の correction は OD 集約に使わない |
| 素朴 decay に滑る | 全 detector が「矛盾/シフト」trigger・time 単独ゼロ |
| 既存 L3-a/L4 を壊す | computeRegimeFactorFn 拡張のみ・builder 不変 |

## 8. CEO 判断点（L3-b 実装 GO 前）
1. OD 集約 regime-change（L3-b-1）から始めるか。持続シフト（L3-b-2）は後か。
2. L3-a（leg）と L3-b（OD）の合成 = leg 優先 + OD fallback で良いか。
3. 持続シフトの K（例 3-4）と λ（例 0.7・correction より弱く）。
4. computeRegimeFactorFn は L3-a を内部統合か、別関数 additive か。

## 9. 参照
- L3-a: `lib/plan/mobility/mobilitySelectiveForgetting.ts`（detectRegimeChange / computeRegimeFactorFn）
- L3 全体: `docs/second-self-map-l3-mini-design.md` / L4: `docs/second-self-map-l4-closeout.md`
