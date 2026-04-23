# W3-PR-10 Scope A — Canary 運用 + 観測設計メモ

**作成日**: 2026-04-24
**base**: `main` @ `94063943`（Scope A 着地後）
**目的**:
1. `ALTER_MORNING_TRANSPORT_V2` を preview / canary で **安全に試せる** 状態を作る
2. heuristic duration の品質を観測し、次に進むべき方向（D=Routes API / E=Path B 統合 / C=mode 推定）を判断できる材料を揃える

本メモは **設計のみ**。実装（コード変更）は未着手。コードに落とす際は C/D/E/F と競合しない形で最小変更に留める。

**CEO 承認 2026-04-24**: 次の 1 本を **A/B 実装（canary + 観測）** に確定。ただし以下 2 点ロック:
- **Lock 1**: preview を一律 `true` にしない。allowlist only で canary 対象を絞る
- **Lock 2**: `transport_v2_edit_regression` は `canonical_present: boolean` を必ず含めて canonical 経路と非 canonical 経路を分離して記録

**D1/D2/D3 CEO確定 2026-04-24**:
- D1: session_id は既存 `home_alter_judgment` 空間を再利用
- D2: preview override (`?__transport_v2=1`) は初回 canary PR から外す（allowlist only）
- D3: bin_distribution key は安定キーのみ（`le_0_2km_null` / `le_1km` / ... / `gt_30km` / `invalid_null` の 8 key）

本メモは Lock 1 / Lock 2 と D1/D2/D3、実装順絞り込み（O1〜O4 先 / O5〜O6 後）を反映済み。

---

## 0. 現状の flag 実態（前提）

- flag 定義: `lib/alter-morning/dialog/flags.ts` → `ALTER_MORNING_FLAGS.transportV2`
  - env key: `ALTER_MORNING_TRANSPORT_V2`（既定 `false`）
  - override API あり（test 用 `__setTransportV2OverrideForTest`）
- 読者は **2 箇所のみ**:
  - `lib/alter-morning/legacyAdapter.ts:423`（Path A / adaptPipelineToLegacy）
  - `app/api/stargazer/alter/selection/route.ts:200`（candidate 選択後 rebuild）
- **全ユーザー global ON/OFF**。user / percentage rollout の仕組みは未実装
- Path B (`processMorningMessage`) は flag と無関係に常時従来動作
- analytics 基盤: `supabase.from("stargazer_analytics").insert({ user_id, event, feature, metadata })` を fire-and-forget で使う既存パターンあり。PostHog は未接続

---

## 1. Canary 運用案

### 1-A. 環境（Lock 1 反映 — **D2 CEO確定 2026-04-24**）

| 環境 | 解決方式 | 既定 |
|:---|:---|:---|
| local / CI | global `false` 固定 | OFF（既存 test の byte-diff ゼロ前提を崩さない） |
| Vercel preview | **allowlist 専用** | OFF |
| production | **allowlist 専用** | OFF |
| default ON | 別判断（G1〜G6、§4-E） | — |

**理由**: preview を一律 `true` にすると意図しない確認セッションが観測データを濁らせ、canary の母集団が壊れる。「狙った対象を、狙った期間だけ」観測するため、preview でも allowlist のみを通す。

**D2 scope-out**: 当初案にあった explicit override (`?__transport_v2=1`) は初回 canary PR から外す（CEO 判断 2026-04-24）。理由: override は hidden state を増やし、観測母集団の純度を下げる。allowlist だけで Phase 1（CEO + 内部 3 名）〜 Phase 2（beta 20 名）は十分賄える。将来 override が必要になった時点で再検討。

### 1-A-1. 解決優先順位（実装契約）

```
test override (unit test only) > allowlist > global fallback
```

- **test override**: `__setTransportV2OverrideForTest(value)` — 既存テスト用 hook。runtime では無効。allowlist より優先する理由は、既存の unit test が flag 操作する前提を崩さないため
- **allowlist**: env `ALTER_MORNING_TRANSPORT_V2_ALLOWLIST`（CSV of user_id）。primary source。追加 / 削除で canary 対象を操作
- **global fallback**: env `ALTER_MORNING_TRANSPORT_V2`（bool、既定 false）。**default ON 判断前は常に false に保つ**。判断後に true 切り替え

userId が渡されない場合: allowlist check をスキップして global fallback のみ参照（call site で userId 渡し忘れても fail-safe に OFF 方向へ落ちる）。UUID 比較は lower-case normalize（env 入力の大小文字ミスを吸収）。

### 1-A-2. log 側契約（分析可能性確保）

3 種の analytics event 全ての metadata に **`flag_source: "allowlist" | "global"`** を含める。canary 分析時に「なぜその session が ON だったか」を判別できないと母集団が濁る。

- `"allowlist"`: userId が env allowlist に含まれていた
- `"global"`: global bool が true（Phase 3 default ON 以降にのみ発生する想定）

production での ON 切り替えは allowlist に user_id を追加するだけで deploy は必要（Vercel env vars は deployment 単位で bind）。kill switch = allowlist から除去 → 再デプロイ or allowlist を空にして再デプロイ。緊急時は `ALTER_MORNING_TRANSPORT_V2` の global fallback 側を明示 false に上書きできる冗長口を残す。

### 1-B. 対象

Phase 1: **CEO + 内部協力者（最大 3 名）のみ**
- 現状 flag は global なので「内部者だけ」に絞るには **user allowlist を 1 つ入れる必要がある**
- 最小変更案（後述の実装フェーズで検討）:
  - `lib/alter-morning/dialog/flags.ts` の `transportV2` getter に `userId` 引数を渡し、`ALTER_MORNING_TRANSPORT_V2_ALLOWLIST` env（カンマ区切り user_id）にいるかだけ ON
  - env に user id が 0 個なら global OFF と等価。env list に追加 / 削除で canary 対象を操作
- この allowlist が入るまでは production は ON にしない（= 本 Phase の最初の実装タスク）

Phase 2: **beta invitee（最大 20 名想定、CEO 判断で招待）**
- Phase 1 で観測指標がグリーンなら対象拡大
- allowlist に追加するだけで済むので追加実装は不要

Phase 3: **default ON**
- 判断基準は §4 で後述

### 1-C. 観測期間

- **Phase 1**: 最低 **3 日 + 20 セッション**。どちらも満たすまで拡大しない
  - 「日数だけ / セッション数だけ」では両極端ケースを拾えないため AND 条件
- **Phase 2**: 最低 **7 日 + 100 セッション**。default ON 判断前の最終観測
- セッション = morning planner を開いて確定 or 離脱まで。flag ON 経路に入った分だけカウント

### 1-D. 即 OFF 条件（kill switch 発動）

以下のいずれか **1 つでも** 満たしたら env var を `false` に戻す。

| # | 条件 | 検知方法 |
|:---|:---|:---|
| K1 | flag ON 経路で tsc / runtime error が出て plan build が完全失敗 | Sentry / supabase error log |
| K2 | canonical segment が生成される場面で **travel 表示が全部消える** ケース > 10% | `transport_v2_plan_built` の `travel_render_rate` < 0.9 |
| K3 | heuristic duration が **明らかに不自然**（< 1 分 or > 120 分）の出現率 > 5% | `transport_v2_segments_built` の `sanity_violations` (S1/S2) |
| K4 | 編集 / reorder 後に travel が消える回帰が再発 | `transport_v2_regenerate` の `travel_count_delta < 0` 率 > 10% |
| K5 | CEO が実機で違和感を覚えた case 1 件以上（主観判断を排除しない） | CEO 報告 |

K5 を入れる理由: 数値に出ない違和感（例: 10分が自然だが 15分と出て 5分だけ浮く）は canary の要なのでヒトの目を明示的に組む。

---

## 2. 観測項目設計

### 2-A. 生成面（segment / duration そのもの）

| 指標 | 定義 | healthy 範囲 |
|:---|:---|:---|
| **segment 生成率** | `len(transportSegments) / max(0, len(items that are not travel) - 1)` | 事前の両端 coords 保有率に依存、0.4〜1.0 を想定 |
| **heuristic duration 生成率** | segments のうち `estimatedDurationMin !== null` の割合 | ≥ 0.9（≤0.2km skip は想定内。それ以外が null なのは異常） |
| **null duration 率** | segments のうち `estimatedDurationMin === null` の割合 | ≤ 0.1（≤0.2km 近接 pair 比率と整合） |
| **段階 bin 分布** | `≤1km / ≤3km / ≤7km / ≤15km / ≤30km / >30km` のヒストグラム | 事前想定は未知なので baseline として収集 |

### 2-B. 表示面（display cache → UI）

| 指標 | 定義 | healthy 範囲 |
|:---|:---|:---|
| **travel 表示率** | 「number duration の segment」のうち UI に travel PlanItem として出た割合 | ≥ 0.99（null-skip は C3 の仕様通りなので ≤0.2km 除外）|
| **fake 0分 travel 発生率** | `durationMin === 0` の travel PlanItem 発生率 | **0**（Scope A で撤去済なので出たら regression） |
| **icon 不整合率** | `segment.mode` と PlanItem.travelTransport icon の不一致 | **0**（mapping 固定） |

### 2-C. 編集後の維持面（regression 観測）

| 指標 | 定義 | healthy 範囲 |
|:---|:---|:---|
| **reorder 後 travel 消失率** | reorder 操作前後で `travel count` が減った割合 | 0（canonical mode は Path B 再注入しない、Phase 3A invariant）|
| **place-change 後の travel 変化率** | place 変更前後で travel count が変わった割合 | 変化は想定内。base line 収集 |
| **edit 後の duration source 保持** | user override を入れていない場合 `durationSource` が `"heuristic"` のままか | ≥ 0.99 |

### 2-D. 明らかに不自然な duration の検出

自動検出ルール（heuristic 自体の sanity check）:
- **S1**: `durationMin < 1` → 論理矛盾（テーブル最小値 10）
- **S2**: `durationMin > 120` → テーブル上限 90 を超える値は出ないはず
- **S3**: テーブルのどの bin 値 (`null, 10, 15, 25, 40, 60, 90`) にも一致しない値 → テーブル外の値が混入した証拠
- **S4**: 両端 coords が同じなのに `durationMin !== null` → fake placeholder 復活の兆候

S1〜S4 のどれかが 1 件でも観測されたら即 Sentry 通知（実装の bug を示す）。

**ヒト判定**:
- CEO / 内部者が週次で 5 件ランダムサンプリングして「違和感スコア」を 3 段階で付ける（0 = 違和感なし / 1 = 微妙 / 2 = 明らかにおかしい）
- 2 が 1 件でも出たら segment log を精査し、Routes API (D) への優先度を上げる材料にする

---

## 3. ログ設計

既存の `stargazer_analytics` テーブル（supabase）を流用。`feature: "alter_morning_transport_v2"` で名前空間を切る。

### 3-A. 共通 metadata（全 3 イベント）

全イベントの metadata に必ず含める共通 field。**母集団特定 / 時系列分析 / 濁り検知** のために必須。

```ts
{
  schema_version: "2026-04-24",          // 将来の schema 進化に備える
  flag_source: "allowlist" | "global",   // なぜ ON だったか（§1-A-1、D2 で override は削除）
  session_id: string,                     // 既存 home_alter_judgment session_id 空間を再利用（D1 CEO確定）
  plan_date: string,                      // "YYYY-MM-DD"、対象 plan の日付
  caller: "legacy_adapter" | "selection_route" | "client_regenerate",
}
```

**D1 CEO確定 2026-04-24**: `session_id` は既存 `home_alter_judgment` の session_id 空間を再利用。実装上は `LegacyAdapterInput.sessionId` / `selection/route.ts` body の `morningSession` 経由で取得できる既存識別子をそのまま payload に詰める。新規発行はしない。

### 3-B. イベント 3 種

#### Event 1: `transport_v2_segments_built`

**emit 位置**: `buildPlanAndSegmentsFromEvents` の **呼び出し側**（legacyAdapter / selection route）が result を受けた直後。純粋関数の中には side effect を入れない。

**固有 metadata**:
```ts
{
  event_count: number,                    // events[] length
  eligible_pair_count: number,            // 両端 coords 揃った pair 数
  segment_count: number,                  // 生成された segment 数
  duration_non_null_count: number,        // number duration が入った segment 数
  duration_null_count: number,            // null segment 数（≤0.2km 等）
  bin_distribution: {                     // 段階テーブル bin 別カウント（D3 CEO確定 2026-04-24）
    le_0_2km_null: number,                  // ≤ 0.2km（heuristic 意図 null）
    le_1km: number,                         // 0.2km < d ≤ 1km（10min）
    le_3km: number,                         // 1km < d ≤ 3km（15min）
    le_7km: number,                         // 3km < d ≤ 7km（25min）
    le_15km: number,                        // 7km < d ≤ 15km（40min）
    le_30km: number,                        // 15km < d ≤ 30km（60min）
    gt_30km: number,                        // 30km <（90min）
    invalid_null: number,                   // 座標不正で null（fail-safe）
  },
  // bin key 設計: 番号 prefix を付けない（将来段階テーブルを tune した時に番号が意味変化しないため）。
  // 順序や bin ↔ duration マッピングは分析 SQL 側で CASE WHEN 再構築する。
  // 全 8 key を必ず emit（count 0 でも key を出す）— 分析 SQL での COALESCE を不要にするため。
  mode: "walk" | "car" | "public_transit" | "bicycle" | "taxi" | "unknown",
  sanity_violations: ("S1" | "S2" | "S3" | "S4")[],  // 通常は空配列、O5 なしでも事後集計可
}
```

**sanity_violations の重要性**: O5（Sentry 即時通知）を後回しにしても、この field に残せば **G3（S1〜S4 = 0）を SQL 事後集計で判定可能**。最小 canary の成立条件として必要なデータは O2 の payload で揃える。

#### Event 2: `transport_v2_display_rendered`

**emit 位置**: `interleaveTravelItems` で display 用 items[] が決まった直後（legacyAdapter / selection route の両方）。

**固有 metadata**:
```ts
{
  segment_count: number,
  travel_rendered_count: number,          // entry 生成された travel 数
  skipped_null_count: number,             // null-skip で落とした数
  fake_zero_travel_count: number,         // 0 分 travel 発生数（常に 0 のはず = regression canary）
}
```

#### Event 3: `transport_v2_edit_regression` — **Lock 2 適用**

**emit 位置**: client 側 `regenerateTravelForPlan` の後（canonical mode / non-canonical mode 両方）。Phase 3A で landing 済みの regenerate に log 追加。

**固有 metadata**:
```ts
{
  // Lock 2: canonical 経路 / 非 canonical 経路を必ず分離して記録。
  // boolean で明示することで「旧経路由来の fallback と新 canonical 経路」を混同しない。
  canonical_present: boolean,              // prev.transportSegments !== undefined と同値
  transport_segments_count: number,        // canonical_present=true のときの segments.length、false なら 0
  travel_items_before: number,             // 編集前の kind="travel" 数
  travel_items_after: number,              // 編集後の kind="travel" 数
  edit_trigger: "reorder" | "duration_edit" | "time_edit" | "place_change",
  // 計算済み derived field（分析時の SQL を楽にする目的で冗長保持）
  travel_items_delta: number,              // = after - before
}
```

**Lock 2 の分析意図**:
- 「canonical 経路で travel が消えた」= G4 regression（要即 OFF）
- 「非 canonical 経路で travel が消えた」= 旧経路の fallback による 既知挙動（regression ではない）
- `canonical_present` を payload で明示分離しないと、ダッシュボード SQL で `WHERE canonical_present = true AND travel_items_delta < 0` が書けず、混在ノイズで判断を誤る

### 3-C. タイミング設計

- **fire-and-forget**: 既存 pattern 通り。plan build / UI render を待たせない
- **sampling なし**: canary Phase 1 は volume が小さいので full log
- **PII**: payload に text / place_ref / 座標は入れない。数値と enum のみ（`session_id` も anonymous な内部識別子に限定）
- **version tag**: `metadata.schema_version: "2026-04-24"` を全イベントに付与（§3-A 共通 metadata の一部）
- **log volume 警戒**: canary 規模なら問題なし。default ON で急増する場合に備え、Phase 3（default ON 前）で sampling or aggregation を再検討する

---

## 4. 判断分岐

canary 観測結果を受けて、次の 1 本を **どの条件で** 決めるか。

### 4-A. D（Routes API 本接続）に進むべき条件

**観測サイン**:
- 2-D のヒト判定で「違和感スコア 2」が **週 3 件以上**（= heuristic の粗さが実害）
- 段階 bin 分布が極端に偏り、片側の bin で duration が systematically 過小 / 過大
- ≤ 3km 圏で **明らかに車想定なのに 10〜15 分で収まる** ケースが反復（歩き想定のテーブルに引き戻されている感触）

**判断**: heuristic の粗さが UX 上の障害になっている → Routes API で実測に置き換える価値が高い

### 4-B. E（Path B 統合）に進むべき条件

**観測サイン**:
- canary で canonical edge が「Path A 経路では綺麗に出るが、Path B を通る既存セッションと混在するユーザーで」segment 有無がブレる
- `processMorningMessage` を経由するセッションで travel 表示が不整合（= 二重化の実害）
- `transport_v2_edit_regression` の non_canonical mode の頻度が canonical mode と同程度以上（= まだ Path B を通る割合が多い）

**判断**: 二重化の解消が観測可能な不一致を生んでいる → Path B を canonical に寄せる統合

### 4-C. C（mode 推定）に進むべき条件

**観測サイン**:
- `mode: "unknown"` の segment が **全体の 60% 超**（= mainTransport が設定されないシナリオが多数派）
- ヒト判定で違和感が出るケースの多くが「本当は車 / 電車なのに徒歩前提の表に合わせてしまっている」パターン
- D（Routes API）に進む前提だとしても、mode が決まらないと Routes API の query に渡す `travelMode` が確定しない

**判断**: 下流（D）に進むために mode を先に決める必要がある

### 4-D. A/B の次反復（観測拡充）で止まる条件

**観測サイン**:
- Phase 1 指標が全て healthy、かつ違和感スコア 2 が 0 件
- ただし Phase 2 の volume 100 セッションに達していない

**判断**: 対象拡大（allowlist を増やす）だけを行い、実装には進まない

### 4-E. Default ON 判断の条件

以下の **すべて** を満たしたら default ON 判断が可能:

| # | 条件 |
|:---|:---|
| G1 | Phase 2 で 7 日 + 100 セッションを通過 |
| G2 | 即 OFF 条件 K1〜K5 のいずれも観測期間中に発動していない |
| G3 | heuristic duration sanity violation (S1〜S4) が 0 件 |
| G4 | 編集後 travel 消失が canonical mode で 0 件（Phase 3A invariant が live で成立） |
| G5 | 違和感スコア 2 が Phase 2 期間中 5 件以下（粗さ許容範囲内） |
| G6 | CEO が「実機で違和感を覚えない」と明示的に判定 |

G1〜G5 は機械判定、G6 は CEO 判断。

---

## 5. 結論: 次の 1 本

### **A/B 実装（canary 運用 + 観測ログ基盤）**

理由（3 点）:

1. **D / E / C のどれに進むべきか、今は材料がない**。heuristic が実データでどう振る舞うかを観測しない限り、D（Routes API で置き換える価値があるか）/ E（Path B 統合の必要性が強いか）/ C（mode 推定を先に入れるべきか）は **全部推測になる**。推測で D に着手して Routes API のコストと複雑性を抱えたあとに「実は heuristic で十分だった」となるリスクを取らない

2. **A/B 自体の実装コストが最小**。必要なのは:
   - user allowlist flag（env 1 つ + `transportV2` getter に userId 引数を足す、< 20 行）
   - 3 種類の analytics emit（既存 `stargazer_analytics` pattern 流用、各 call-site に 5〜10 行 × 3 箇所）
   - sanity violation の Sentry 通知（既存 Sentry SDK に alert 送るだけ）

   コード変更面積は Scope A より小さく、domain truth / display cache / canonical edge の構造には一切触らない

3. **CEO 判断のための「事実ベース」を整える段階**。§4 の判断分岐は、観測ログが揃わない限り発動できない。A/B を入れることで、次の C/D/E の優先度判断を **主観ではなく分布と頻度で** 決められるようになる

### 5-A. 実装順（CEO 確定 2026-04-24）

**先（最小 canary 成立条件、1 PR で landing 目標）**:
```
O1: allowlist flag（user_id 引数化 + env list、preview override は D2 で scope-out）
O2: transport_v2_segments_built log（sanity_violations field 含む）
O3: transport_v2_display_rendered log
O4: transport_v2_edit_regression log（Lock 2 の canonical_present 分離）
```

**次点（最小 canary 成立後に追加、別 PR 可）**:
```
O5: S1〜S4 sanity violation の自動通知（即応通知のみ。データ自体は O2 の payload に残る）
O6: 週次観測ダッシュボードの SQL クエリ（scripts/ 以下）
```

**絞り込みの根拠**:
- O1〜O4 で canary の成立条件（allowlist ON / ログ収集 / 編集 regression 観測）が全て揃う
- O5 は「気づきの即応性」だけの問題で、データは O2 の `sanity_violations` field に既に残る。事後 SQL で G3 判定可能なので、最小 canary には含まれない
- O6 も分析クエリの便利さだけで、生データは O1〜O4 で揃う。手動 SQL で代替可能

各タスクは single-file 変更〜2-file 変更に近く、C/D/E の実装面と干渉しない。

### 5-B. 実装着手前に潰すゲート（pre-implementation）— **実査済 2026-04-24**

ゲート結果: **✅ PASS（4 項目すべて確認済、propagation 爆発なし）**

| # | 項目 | 調査結果 | 必要な変更 |
|:---|:---|:---|:---|
| G-1 | `legacyAdapter.ts:423` への userId | 呼び出し元 `app/api/stargazer/alter/route.ts:1824` で `userId` 既にスコープ内（`createLLMComprehensionProvider({ userId })` に使用） | `LegacyAdapterInput` に optional `userId?: string` を 1 field 追加 + caller で代入（**single-hop**） |
| G-2 | `selection/route.ts:200` への userId | `checkStargazerTier("alter")` が `TierCheckResult.userId` を既に返却（L99）。現コードは guard のみで `userId` を捨てている | `const { userId } = tierCheck;` を guard 直後に 1 行追加（**no propagation**） |
| G-3 | client 側 O4 の userId 取得 | `/api/stargazer/analytics` POST は server 側で `supabase.auth.getUser()` により userId を自動付与（既存 my-style pattern と同じ）。`lib/stargazer/trackClient.ts` が canonical tracker | client 側 prop propagation 不要。**`MorningPlan` / `AskHero` / `AneurasyncHome` の prop は一切変更しない** |
| G-4 | edit_trigger の実網羅 | `MorningPlanCard.tsx` 実コードで `regenerateTravel` を呼ぶ handler は 5 件 = `handleDurationChange` / `handleStartTimeChange` / `handleMoveUp` / `handleMoveDown` / `handleSelectCandidate` | §3 Event 3 の enum は 4 値に訂正済（`reorder \| duration_edit \| time_edit \| place_change`）。`handleMoveUp/Down` は `reorder` に統合 |

**追加発覚した実装点（O2/O3/O4 で必須）**:

1. **Event type 3 箇所追加必要**:
   - `lib/stargazer/trackClient.ts` L6-14 の `StargazerEvent` union（client-side 送信可能イベント）
   - `lib/stargazer/analytics.ts` L11-38 の `StargazerEvent` union（server-side 型制約）
   - `app/api/stargazer/analytics/route.ts` L16-44 の `VALID_EVENTS` Set（POST whitelist）

   追加する 3 イベント: `transport_v2_segments_built` / `transport_v2_display_rendered` / `transport_v2_edit_regression`

2. **Emit route の分離**:
   - **O2 / O3（server-side）**: `legacyAdapter.ts` / `selection/route.ts` から `trackStargazerEvent({ userId, event, feature: "alter_morning", metadata })` を fire-and-forget 直接呼び出し（`void` prefix、await しない）
   - **O4（client-side）**: `MorningPlanCard.tsx` の 5 handler から `trackClient.ts` の新関数 `trackTransportV2EditRegression(payload)` を呼ぶ → 内部で `send("transport_v2_edit_regression", "alter_morning", payload)` → `/api/stargazer/analytics` POST で userId 自動付与

3. **feature 値**: 全 3 イベントで `feature: "alter_morning"` 固定（集計 SQL で WHERE filter しやすくする目的）

**結論**: G-1〜G-4 すべて PASS。O1-O4 実装時の touch 範囲は想定通り小さい（prop propagation 爆発なし）。CEO GO 後、そのまま着手可能。

### 5-C. CEO 判断項目（実装着手前に決めるべき 3 点）— **確定 2026-04-24**

| # | 判断項目 | CEO 確定 |
|:---|:---|:---|
| D1 | `session_id` の取り方 | 既存 `home_alter_judgment` の session_id 空間を再利用。実装は `LegacyAdapterInput.sessionId` / `morningSession` 経由で取得可能な識別子を payload に詰めるだけ |
| D2 | preview override の UX | **初回 canary PR から外す**。allowlist only で進める。override は hidden state を増やし観測を濁すため |
| D3 | bin_distribution の key 命名 | 安定キーのみ使用。順序は SQL 側で再構築。 `le_0_2km_null` / `le_1km` / `le_3km` / `le_7km` / `le_15km` / `le_30km` / `gt_30km` / `invalid_null` の 8 key |

---

## 6. この段階で凍結するもの

- Scope A コード自体（`durationHeuristic.ts` / `buildTransportSegments` / `synthesizeTravelItems`）は触らない
- C/D/E/F の実装は A/B の観測結果が出るまで着手しない
- 段階テーブルの tune は CEO 判断のみ（週次観測で明らかな偏りが出れば CEO に提案）
- **preview override (`?__transport_v2=1`) は初回 canary PR では実装しない**（D2 CEO確定 2026-04-24）。必要になった時点で別 PR で追加

---

**次 step**:
1. 本メモ（Lock 1 / Lock 2 / §5-B gate 結果反映済）の最終確認 → CEO GO
2. ~~Pre-implementation gate（§5-B）: userId propagation 実体調査~~ → **実査済 PASS**
3. CEO 判断項目 D1〜D3（§5-C）の確定
4. O1〜O4 を 1 PR で landing → merge 後に O5 / O6 を別 PR で追加検討
