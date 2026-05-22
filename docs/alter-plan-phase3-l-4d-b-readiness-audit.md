# Phase 3-L-4d-b Readiness Audit (= read-only、 audit only で停止)

**作成日**: 2026-05-22
**承認**: CEO + GPT 合議 (= 2026-05-22 L closeout overview freeze 後、 「次は L-4d-b readiness audit、 いきなり実装しない、 audit で価値・state 引き上げ・privacy / performance を確認」 指示)
**範囲**: CalendarTab / FlowTab への移動時間表示展開の **価値判断** + **3 option 比較** + **段階分割提案** + **CEO 補正 2 件の固定**

> 本 audit は **docs only**。 CEO 明示停止条件「CalendarTab / FlowTab UI 変更」 に該当する実装は **本 commit では行わない**。
> audit 結論 + CEO 別承認を経て、 別 phase で実装着手。

---

## 0. 補正 1 + 補正 2 の取り込み (= GPT 指摘の永続規約化)

### 0.1 補正 1: L overlay の augment / replacement の正確な分離

L closeout overview (= `49303a05`) の「K view を augment、 置換ではなく」 表現は **曖昧**。 本 audit 以降の永続規約として以下に **分割固定**:

| Layer | 不変規約 |
|---|---|
| **K DayGraph 本体 (= model)** | **mutate しない** (= L overlay は構造的に K model を破壊しない、 snapshotId / JSON / 配列 reference 比較で機械保証) |
| **K MovementTransitionView (= view layer)** | **改変しない** (= 「→ 移動」 固定文言は K-3a で確立、 L は読み取り only) |
| **MapTab DayGraphTimeline 表示 (= UI render output)** | **resolved transition のみ label / ariaLabel を override** (= L-4d で実装、 K-3c-iii className は完全維持) |

含意:
- model 層: **augment** (= overlay は K の output に対する読み取り + 新型 OverlaySegmentView 構築)
- view layer 層: **読み取り only** (= K の MovementTransitionView 自体は変更しない)
- UI render 層: **label/ariaLabel の display replacement** (= caller (= MapTab) が optional prop で override)

→ 「augment vs replacement」 の二項対立ではなく、 **layer 別に責務分離**したのが L-4d の真の貢献。

### 0.2 補正 2: L phase closeout の scope 明示

L closeout overview (= `49303a05`) は厳密には **「L-0 〜 L-4d MapTab-only までの completed range closeout」**。

未着手 / deferred の論点:
- ❌ CalendarTab / FlowTab への移動時間表示 (= 本 audit 対象)
- ❌ telemetry runtime sink (= L-4e、 CEO 後回し)
- ❌ Arrival Risk Memory (= CEO 永続禁止)
- ❌ mode 推定 (= L-5、 別 readiness audit)
- ❌ Routes API integration (= L-5+、 新 env / dependency)

本 audit 以降の docs は **「L-0 〜 L-4d completed range」** を「L phase closeout 1st range」 と呼ぶ規約とする。

---

## 1. Purpose

L-4d MapTab-only UI 接続が visual smoke PASS した後、 同 pattern を CalendarTab / FlowTab に展開する **可能性を判断する** ための readiness audit。

「展開する / しない / 部分展開する」 の 3 択を Aneurasync 思想 (= 観測 layer / 自己理解) + 技術的制約 (= privacy / performance / state 引き上げ) で評価する。

---

## 2. Aneurasync 思想からの価値検討 (= ゴールから逆算)

### 2.1 各 Tab の体験的意味

| Tab | 視点 | 「移動 約 N 分」 を見る意味 |
|---|---|---|
| **MapTab** (= selectedDate-centric、 1 日) | **「今日」 の覚悟** | 当日のスケジュール認識、 移動の予測 → L-4d で確立 |
| **CalendarTab** (= 月 grid + 選択日 detail) | **月の俯瞰 / 過去観測** | 「いつも移動が多い」 「先月どこに行った」 → Aneurasync 中心問いに **より近い** |
| **FlowTab** (= 7 日 week-centric) | **週単位の reflection** | 「先週はどこにいた」 「来週何があるか」 → 中間 |

### 2.2 「観測のみ」 思想との整合

| 表示対象 | 思想整合性 |
|---|---|
| **過去の移動** (= 「先月よく行った場所への移動 約 N 分」) | ✅ **高** — 「自分はこういう移動傾向だった」 への接続、 推奨ではなく観測 |
| **当日の移動** (= MapTab) | ✅ 中 — 既に L-4d で確立、 当日認識 |
| **未来の移動** (= 来週 / 来月) | ⚠️ **要注意** — 「準備しろ」 等の暗黙メッセージに近づく risk |

→ Calendar / Flow で **過去の移動を強表示、 未来の移動を弱表示 or 同表示** を検討する余地あり。 但し L-4d MapTab では未来の移動 (= selectedDate が今日 / 明日) も「移動 約 N 分」 で表示しており、 一貫性のため **全期間同じ表示** が現状方針。

### 2.3 革新的論点 (= 自律推論)

**論点 A: 「過去の移動を見て自分の傾向に気づく」 体験**

これは Aneurasync の中心問い「**この機能は、 ユーザーの第二の自己として必要か?**」 に対して:
- 過去の移動の集積 = 「自分はこういう移動 pattern を持っている」 の認識
- = 「自分って、 そういう人間だったのか」 体験への直接接続

→ Calendar の月 grid で「過去 N 日の移動傾向」 を出すのは Aneurasync 思想に **最も近い**。

但し:
- 月 grid 30 cell に「移動 約 N 分」 を出すのは UI 的に重い
- 各 cell の移動「合計」 を出すのは集計、 「観測」 から「推測」 に近づく risk

**論点 B: 「過去観測」 を成立させる別 path**

- 月 grid に「移動が多かった日」 dot を出す (= 詳細時間は出さない、 観測の存在のみ)
- 詳細時間は cell click → 選択日 detail (= MapTab 同様) で確認
- → これは「L-4d-b1」 の真の scope (= 選択日 detail のみに展開)

**論点 C: 全展開は本質的に不要**

「全 30 日 / 全 7 日 cell に移動時間を表示する」 必要性は思想的に薄い:
- ユーザーは 1 日を確認したいときに 1 日 detail を見る
- 月全体の俯瞰には「移動の有無」 だけで十分
- 詳細時間は「観測したい瞬間に観測する」 = 選択日 detail で OK

→ **L-4d-b は「選択日 detail のみ拡張」 で本質的価値を実現可能**。

---

## 3. 各 Tab の visibleAnchors scope (= read-only 調査結果)

| Tab | visibleAnchors の scope | 既存 geocode state | DayGraphTimeline の場所 |
|---|---|---|---|
| MapTab | selectedDate 1 日 (= `dayAnchors`) | ✅ `usePlanGeocode(dayAnchors)` | 選択日 detail (= K-3c-i) |
| CalendarTab | 月単位 + 選択日 (= 詳細構造未調査だが、 `usePlanGeocode` import なし) | ❌ なし | 選択日 detail (= K-3b) |
| FlowTab | 7 日 (= `dayAnchorsMap` = 7 day × anchorsForDay) | ❌ なし | 7 timeline (= K-3c-ii) |

**重要**:
- CalendarTab / FlowTab は **現状 geocode state を 0 持つ**
- 「移動時間表示」 を実現するためには geocode 結果が必要
- → 何らかの geocode 取得 path が必要

---

## 4. PlanClient state 引き上げの是非 — 3 option 比較

| Option | 概要 | リスク | コスト | 評価 |
|---|---|---|---|---|
| **A. PlanClient core に geocode state 引き上げ** | `usePlanGeocode` を PlanClient で 1 回呼び、 Context で配布 | **高** (= core 改変 / Context 影響範囲) | 中 | ❌ **CEO 停止条件直撃** |
| **B. Calendar / Flow が独自に `usePlanGeocode` 呼出** | 各 Tab で独立、 重複 fetch 許容 | 中 (= fetch 重複、 但し server dedupe 効く) | 低 (= 既存 hook 流用) | ✅ **検討価値あり** |
| **C. Calendar / Flow に表示しない** | 現状維持 (= K view fallback) | 0 | 0 | ✅ **安全側、 価値判断次第** |

### 4.1 Option A の deep dive (= 不採用理由)

PlanClient core への geocode state 引き上げは:
- React Context wrapping が必要 (= PlanClient 全体 re-render)
- 既存 PlanClient state shape の変更 (= 既存 test / caller 影響)
- 全 Tab で「同 anchor の geocode を 1 回 fetch」 は efficient だが、 各 Tab の visibleAnchors scope が異なる (= union を取る複雑性)
- privacy: 「全 anchor 一括 resolve」 になりがち (= MapTab の lazy resolve 思想を破壊)

→ **CEO 停止条件「PlanClient core geocode state 化」 直撃**。 **不採用**。

### 4.2 Option B の deep dive (= 推奨候補)

Calendar / Flow が独自 `usePlanGeocode` を呼ぶ:
- 既存 hook (= Phase 2-C で確立) をそのまま流用
- 各 Tab の visibleAnchors を独立 fetch
- 重複: MapTab + Calendar で同 anchor を 2 回 fetch する可能性
  - 但し server dedupe (= 既存 endpoint 内 cache) で実質 1 fetch
  - rate limit (= per-user 100/hour) は問題なし
- 各 Tab で独立 state (= Tab 切替えで stale fetch は cancelled flag で防御済)

→ **L-4d-b の最も clean な実装 path**。 但し:
- 各 Tab UI への hook 呼出 + prop 渡しは **「CalendarTab / FlowTab UI 変更」** に該当
- CEO 停止条件 → **本 audit では実装しない**

### 4.3 Option C (= 現状維持) の deep dive

Calendar / Flow に移動時間を出さない:
- 価値: K view fallback (= 「→ 移動」 固定) のまま、 視覚的に静か
- 不便: MapTab と Calendar/Flow で同 transition の表示が違う (= 視覚不一致)
- Aneurasync 思想: 「観測のみ」 を最も忠実に守る (= 過剰拡張しない)

→ **「展開しない」 が思想に最も近い** という反直感的結論もあり得る。

---

## 5. active geocode call / cost / rate limit

### 5.1 既存 endpoint の制約

`/api/plan/anchors/geocode` (= Phase 2-C):
- per-user **100 calls / hour** rate limit
- batch 単位 (= 1 fetch で複数 anchor を resolve)
- server side dedupe + cache

### 5.2 各 Tab を独立 fetch にする場合の cost

| シナリオ | fetch 回数 (= per-tab visit) |
|---|---|
| MapTab (= 既存) | 1 (= dayAnchors batch) |
| CalendarTab (= 選択日 detail のみ展開) | 1 (= 当日 anchors batch) |
| FlowTab (= 選択日 detail のみ展開) | 1 (= today batch) |
| 全 Tab visit (= 順次) | 3 (= 各 Tab で 1) |

server dedupe があるため、 同 anchor は再 fetch されない (= 同 fetchKey)。 実 cost は **3 fetch** (= 各 Tab の dep が変わったときのみ)。

### 5.3 「全 cell 展開」 シナリオの cost (= 警告)

| シナリオ | fetch 規模 |
|---|---|
| Flow 7 日全件 (= 各 day の dayAnchors を resolve) | 7 batch (= worst case 7 × N anchor) |
| Calendar 月 grid 30 日全件 | 30 batch (= worst case 30 × N anchor) |

→ **rate limit 100/hour に近づく可能性あり**。 これは L-4d-b1 では避けるべき (= 選択日 detail のみに絞る)。

---

## 6. privacy / performance / loading state リスク

### 6.1 Privacy

| 観点 | リスク |
|---|---|
| 既存 endpoint の privacy 規約 | 維持 (= sensitive blocking / ownership check / audit log policy) |
| 送信回数増 | 各 Tab で 1 fetch 増、 全体で +2 fetch (= 既存 1 → 3) |
| 新規 PII path | **0** (= bridge / pipeline は既に sanitize 済) |
| privacy policy 更新 | **不要** (= 既存 endpoint の利用回数増のみ、 新規 path なし) |

→ **privacy 監査 PASS 想定**。 但し CEO 視点で「rate limit 接近」 は監視対象。

### 6.2 Performance

| 観点 | リスク |
|---|---|
| 各 Tab で hook 呼出 | 軽い (= 既存 MapTab と同) |
| Tab 切替え時の再 fetch | useEffect dep で抑制 (= fetchKey 同一なら no re-fetch) |
| 初回 Tab visit の loading | MapTab と同 pattern (= 「→ 移動」 fallback で穏やか) |
| Flow 7 day × 各 timeline | 7 timeline render は K-3c-ii で性能担保済 (= memo + stable refs) |

### 6.3 Loading state

| 観点 | 挙動 |
|---|---|
| 初回 visit | K view fallback (= 「→ 移動」)、 pipeline 解決後に「移動 約 N 分」 に切替 |
| Tab 切替え | 同 visibleAnchors なら no re-fetch、 stale なし |
| geocode 失敗 | fail-safe で K view fallback 維持 (= L-4c-pure の挙動) |

---

## 7. MapTab-only との差分 (= 構造比較)

| 観点 | MapTab (= L-4d 完了) | Calendar / Flow (= L-4d-b 想定) |
|---|---|---|
| visibleAnchors | dayAnchors (= 1 日) | 各 Tab の選択日 anchors |
| usePlanGeocode | 持つ | **新規追加が必要** |
| useMapTabMovementDisplay | 呼ぶ | **共通化 or 流用** |
| DayGraphTimeline prop | `movementDisplayByTransitionIndex` 渡し済 | **追加が必要** |
| K-3c-iii 階調 | 維持 | 維持 (= 既存 component 不変条件) |

差分 = 各 Tab に **「hook 呼出 + prop 渡し」 を 2 行追加**。

但し:
- hook 名「`useMapTabMovementDisplay`」 が MapTab 固有名 → **rename or 新 hook**
- 既存 L-4d freeze 維持のため、 hook rename は不可
- → **既存 hook をそのまま流用** が clean (= 名前は MapTab 固有だが logic 汎用)

---

## 8. 段階分割提案 (= L-4d-b1 / L-4d-b2 / L-4d-b3)

自律推論で「全展開」 ではなく **3 段階分割**を提案:

### 8.1 L-4d-b1: **Flow / Calendar の選択日 detail にのみ拡張**

scope:
- FlowTab の各 day timeline (= 7 timeline) のうち、 **今日 1 timeline** のみ拡張
- CalendarTab の **選択日 detail timeline** のみ拡張
- 月 grid / 週 grid 全件は対象外

実装:
- 各 Tab で `usePlanGeocode(todayAnchors or selectedDayAnchors)` 呼出
- `useMapTabMovementDisplay` (= 既存 L-4d) をそのまま流用
- DayGraphTimeline に prop 渡し

リスク評価:
- privacy: 既存 endpoint 利用、 新規 PII path 0
- performance: 各 Tab で 1 batch fetch、 rate limit 余裕
- UI: K-3c-iii 階調維持 (= L-4d MapTab と同 pattern)
- 但し: **CEO 停止条件「CalendarTab / FlowTab UI 変更」 に該当 → 実装には CEO 別承認必要**

**価値**: 中-高 (= 各 Tab で「今日 / 選択日」 の移動時間が見える)、 思想整合

### 8.2 L-4d-b2: Flow の 7 day 全件への拡張

scope:
- FlowTab の 7 day 全件で移動時間表示

実装増分 (= L-4d-b1 から):
- `usePlanGeocode` を 7 day union で呼ぶ (= dayAnchorsMap の全 union を visibleAnchors として渡す)
- 各 day timeline に対応する MovementDisplayView を attach

リスク:
- fetch 規模 7 倍 (= 7 batch)
- performance: 7 timeline render は既に K-3c-ii で担保
- 但し: 7 day 全件は initial visit cost 大
- rate limit: per-user 100/hour に近づく可能性 (= 7 × N anchor)

**価値**: 中 (= 週単位の reflection、 但し 7 cell に時間表示は読みづらい)

### 8.3 L-4d-b3: Calendar 月 grid 全件への拡張

scope:
- CalendarTab の 30 day grid 全件に移動時間表示 or 「移動あり」 dot

実装増分:
- 30 day batch fetch (= rate limit 直撃)
- 月 grid cell 上に移動表示の UI 設計が必要 (= 既存 cell 構造改変)

リスク:
- **rate limit 直撃**: 30 day × N anchor は per-user 100/hour に抵触可能性
- UI 設計: cell 内に「移動 約 N 分」 は読みづらい → 「dot」 等の簡略化必要
- 既存 cell 構造改変必要

**価値**: 低-中 (= 月 grid に詳細時間は思想的に過剰、 dot 程度で十分)

### 8.4 段階分割の論理

| Phase | 着手判断 | 前提 |
|---|---|---|
| L-4d-b1 | CEO 別承認後 | 本 audit + CEO smoke 受領 |
| L-4d-b2 | L-4d-b1 visual smoke PASS 後 | L-4d-b1 着地 + rate limit 観測 |
| L-4d-b3 | L-4d-b2 visual smoke PASS 後 + cell UI 別設計 | L-4d-b2 着地 + cell UI 設計案 |

各 step で stop / smoke / 次判断。 K phase で確立した「整理 → 判断 → 実装」 pattern。

---

## 9. 革新的アイデア (= 自律推論で導出、 GPT 案を超える)

### 9.1 革新 1: 「visibleAnchors の Tab 別最小化」

各 Tab で「現在画面に表示している anchors のみ」 を resolve する pattern。

| Tab | 最小 visibleAnchors |
|---|---|
| MapTab | selectedDate dayAnchors |
| CalendarTab | 選択日 dayAnchors (= MapTab と同) |
| FlowTab | 今日 todayAnchors (= 「過去 3 日 + 今日 + 未来 3 日」 のうち今日のみ) |

→ 各 Tab で 1 batch fetch、 union 不要、 server dedupe 効く。

### 9.2 革新 2: 「観測 layer は『見たい瞬間』 のみ resolve」 思想

「全 cell に常時表示」 ではなく、 **「見たい瞬間に観測」** 思想を強化:
- 月 grid 全 cell → 「移動あり」 dot (= 観測の存在のみ表示)
- 詳細時間は cell click → 選択日 detail で確認 (= L-4d-b1 が支える)
- 「観測したい瞬間に観測する」 = Aneurasync 思想に整合

### 9.3 革新 3: 「Tab 横断 dedupe layer の最小実装」

各 Tab が独立 `usePlanGeocode` を呼ぶが、 server side dedupe + browser cache (= HTTP cache 又は React Query 等) で実質 1 fetch:
- 新規 hook / Context 不要
- 既存 endpoint + 既存 hook の dedupe で十分
- → **L-4d-b1 は new infrastructure 不要、 既存資産流用のみ**

### 9.4 革新 4: 「過去観測 dedicated path」 の検討 (= L-5+ 候補)

L-4d-b の本質的価値は「過去観測」。 これを最大化するには:
- 過去 30 日の anchor を**読み取り only に集計** (= 「先月どこに行った」 ledger)
- これは telemetry sink (= L-4e) + 観測集計 layer (= L-5+) の領域
- **L-4d-b 範囲外、 別 phase**

→ L-4d-b は **「現在 / 今日」 中心の表示**に留め、 過去観測 dedicated layer は別 phase で設計。

---

## 10. low-risk 連続実装範囲の判定

### 10.1 連続実装 NO (= 全 option)

L-4d-b の本質は **「CalendarTab / FlowTab に表示する」**。 これは CEO 停止条件「CalendarTab / FlowTab UI 変更」 に該当。

| 候補実装 | 評価 |
|---|---|
| pure helper の作成 (= 例: useFlowTabMovementDisplay) | ❌ UI 変更を伴うため停止条件抵触 |
| design doc / test-only | ✅ 連続 GO 可能だが、 実装 hook を作っても UI 接続せず止めるのは中途半端 |

### 10.2 結論

**本 audit は docs only で停止**。 CEO 別承認を経て L-4d-b1 (= 最小 scope) を別 phase / 別 branch で着手。

---

## 11. 停止条件 (= 本 audit + 今後の規約)

❌ PlanClient core geocode state 化 (= 永続禁止、 Option A 不採用)
❌ CalendarTab / FlowTab UI 変更 (= 本 audit では touch しない、 L-4d-b1 別承認必要)
❌ 新規 geocode endpoint 呼出 / fetch / network
❌ DB / env / package / dependency 変更
❌ localStorage / sessionStorage
❌ runtime telemetry sink
❌ Arrival Risk Memory
❌ warning / recommendation / optimization 文言
❌ mode 表示 / distance 表示
❌ frozen branches への commit
❌ fetch / push / gh
❌ reset / restore / stash / branch delete

---

## 12. CEO 判断ポイント

| Q | 内容 | 自律推奨 |
|---|---|---|
| Q1 | 補正 1 (= K view augment 表現精緻化) を永続規約として採用するか | **YES** |
| Q2 | 補正 2 (= L closeout overview の scope 明示) を採用するか | **YES** |
| Q3 | L-4d-b 全範囲 (= b1/b2/b3) を「不要」 と判断して L-5 へ pivot するか | 検討余地あり |
| Q4 | L-4d-b1 (= Flow today / Calendar selected day のみ) を承認するか | **YES (= 段階的、 最小 scope)** |
| Q5 | L-4d-b2 / L-4d-b3 は別 readiness audit 経由 | **YES** |
| Q6 | L-4d-b1 着手前に visual smoke 必須 | **YES** |

### 12.1 自律的価値判断 — 反直感的提案

「全展開しない / 選択日 detail のみ」 は実は **Aneurasync 思想に最も近い**:
- 月 grid 全 cell の移動時間表示は「観測」 から「集計表示」 に近づく
- 集計は L-5+ (= 別 phase) で別 dedicated path
- **L-4d-b1 のみ着地で「Mobility Truth Layer の UI 接続」 は完成**

つまり、 L-4d-b2 / L-4d-b3 は **「価値低い + cost 高い」** = 着手しない選択肢も妥当。

---

## 13. 関連 docs

- `docs/alter-plan-phase3-l-4d-closeout-audit.md`
- `docs/alter-plan-phase3-l-next-implementation-comparison.md`
- `docs/alter-plan-phase3-l-closeout-overview.md` (= L 全体 1 doc 整理)
- `docs/alter-plan-phase3-l-transport-design.md` v0.2 (= L 全体設計)
- 各 sub-phase audit doc

---

## 14. 着地状態 + freeze 確定

本 commit 着地と同時に `docs/plan-phase3-l-4d-b-readiness-audit` を **frozen 扱い** (= 32 frozen branches 計、 以後 commit 禁止)。

---

## 15. 思想 transmission

1. **「展開しない」 も正しい答え** — 過剰拡張は Aneurasync 思想に反する
2. **「観測したい瞬間に観測」** — 全 cell 常時表示より、 click → detail
3. **augment vs replacement の layer 分離** — model / view layer / UI render の 3 層で責務分離
4. **CEO 停止条件は audit 中も遵守** — UI 変更は別承認必要
5. **段階分割は安全策、 価値最大化策** — 各 step で smoke / 次判断

---

## 16. 結語 — L-4d-b の本質

L-4d-b の本質は **「Calendar / Flow に展開するか / しないか」 の価値判断**。 技術的には Option B で実装可能だが、 思想的に「全展開」 は不要かもしれない。

**自律推奨**:
- L-4d-b1 (= 最小 scope、 選択日 detail) を CEO 別承認後に着手
- L-4d-b2 / L-4d-b3 は **着手しない**選択肢を保留 (= 別 audit で価値再評価)
- 月 grid / 週 grid 全件展開は L-5+ の集計 layer で別 dedicated path

**本 audit はここまで**。 CEO 判断 (= Q1-Q6) を待つ。
