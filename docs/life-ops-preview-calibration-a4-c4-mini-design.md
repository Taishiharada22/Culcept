# Life Ops — A-4-c4 Preview Calibration Mini-Design（観測発見②①③の修正・pure/fixture 限定）

> 2026-06-10 / CEO・GPT 指示「Moment 発火観測手段 + easy/push 差別化を pure/fixture 限定で修正。placement cap の意味変更が要るなら理由を明確に」。
> **禁止**: 実データ源/DB/通知/R4 本線/PlanClient/UI card 本線/save・apply・confirm・notify 導線/外部 API/production/push/PR/merge。

---

## 0. 根因分析（前提を疑った結果・②が本丸）

観測②「easy と push が完全同一」の根因は**二重**:

1. **cap の意味の混同**: `placeLifeOpsCandidatesForDay` の `maxPlacements=3` が「**1 日に勧める数（presentation）**」のつもりで「**候補 pool の上限**」として働き、urgency 下位の push lane（美容院）を **placement 段階で殺していた**。tier は**選択肢（alternatives）**なので、pool を tier 分配の前に削ると tier の個性が消える。
2. **compose が unplaced を見ない**: compose は `window!=null` の placement しか per-tier 着席させない。だが **tier 別 flexible 容量こそが正**（raw 窓容量は仮置き）。raw で座れなかった候補も tier によっては座れる/少なくとも「この案では入りきらない」として**tier の差分情報**になる。

## 1. 修正設計

### ① cap 分離（pool ≠ presentation）
- `DEFAULT_MAX_PLACEMENTS` を **pool 安全弁（実質非拘束・∞）** に再定義。**1 日の自然な上限は (a) 窓の物理容量 (b) tier 別 flexible 容量 (c) briefing 代表 ≤3** が既に三重に担保しており、pool 段階の人工 cap は不要だった。
- `maxPlacements` param は安全弁として残す（test/将来の異常系用）。**presentation 上限は briefing（highlights ≤3）と tier 容量に属する**ことを doc 化。

### ② compose の full-pool per-tier 着席
- compose は **全 placement（window 有無を問わず）** を lane 包含で tier ごとに評価。
  - 着席順 = **global urgency**（placement から `lifeOpsUrgencyRank` を export し re-sort・deadline が常に先＝消えない）。
  - window あり → 既存どおり（placed 窓優先 → 他窓 refit）。window なし → 全 knownWindows から着席試行（`seated_in_tier` 理由コード）。
  - 着席不能 → **その tier の overflow**（lane-eligible ∧ 容量不足＝「この案では入りきらない」）。
- **alsoAvailable の引退**: 全候補は最低 push tier の eligible になるため「どの tier にも載らない候補」は構造的に存在しなくなる → `alsoAvailable` は **常に []**（field は互換のため残置・doc 明記）。「ほかにも◯件」の情報は **tier 別 overflow line に移住**＝CEO 案「overflow を push 案の差分表示に使う」そのもの。
- 効果（観測 fixture で検証）: protect/easy/push の **fitting 件数が tier ごとに変わり**、push には「美容院＝この案では入りきらない」が**見える**（窓が広い実日なら着席して fitting 差になる）。focus_work/recovery は引き続き**奪わない**・deadline は**3 案全部に着席**。

### ③ Moment 発火の決定論ケース（fixture 増強・logic 不変）
- 重複制御（代表 exclude）と focus 沈黙は**仕様として正しい**ので変えない。発火が見えなかったのは「recommended tier の fitting ≦ 代表数(3)」だったから。
- **fixture に期限 2 件を追加**（license_renewal=+20 日/lead30・passport_renewal=+50 日/lead60・いずれも在宅 30 分）→ recommended(protect) の fitting が 4 件になり、**代表 3 件 exclude 後の 4 件目（食料品の買い物）が午後窓で window_open 発火**する。＝「朝は上位 3 件を伝え、昼に次の 1 件をそっと出す」という**意図した UX そのもの**が観測可能になる。
- 通知なし・R4 非接続・focus 中沈黙は test 維持。

### ④ refit 理由の説明素材（検討のみ・表示本線なし）
- 素材は**既にある**: `placementReason` の `refit_in_tier`（窓移動）+ 新 `seated_in_tier`（pool 段階未着席→tier で着席）。
- presenter 用 mapping（**将来 slice**・今回は実装しない）: `refit_in_tier`→「（この案では朝の枠が埋まっているため、午後の空きに回しています）」/ `seated_in_tier`→「（この案の空きに合わせて入れています）」。

## 2. 完了条件との対応
1 Moment 発火が観測で見える=③ / 2 focus・recovery 沈黙維持=test 固定 / 3 Morning 代表の Moment 非重複=exclude 維持+4 件目発火 / 4 easy≠push=②（件数差+push overflow） / 5 deadline 3 案不滅=urgency 先頭着席+test / 6 push 候補が cap で早期消滅しない=①+test / 7 refit 説明素材=④ / 8 tests・tsc / 9 no real data・write・notification・production。

## 3. 変更ファイル
placement（cap 再定義+`lifeOpsUrgencyRank` export）/ compose（full-pool 着席・alsoAvailable 空化）/ preview-compute（fixture+2 期限）/ 各 tests 更新+新 lock / dogfood-log（record 2=再観測）。R2 本体・R4・briefing/moment logic 本体は**不変**。

---

## 4. ★実データ read-only 前の必須 gate（cap 再設計・CEO 指示 2026-06-10）

`DEFAULT_MAX_PLACEMENTS=∞` は **fixture/preview 限定の許容**。実データでは候補が 10〜100 件に膨らみうるため、**実データ源 read-only に進む前に以下 5 層 cap を分離して再設計すること（必須 gate）**:

| cap | 層 | 目的 |
|---|---|---|
| raw input cap | collector 入力 | 観測行の異常量から防御（reader 側 limit と併用） |
| candidate pool cap | collector 出力/placement 入力 | 判断材料の上限（urgency 上位 N 保持・下位は count のみ） |
| tier fitting cap | compose per-tier | 1 案に勧める数の上限（容量とは別の体験上限） |
| representative display cap | briefing/moment | 見せる量（既存 ≤3 を維持） |
| overflow summary cap | briefing/moment | 「入りきらない◯件」の列挙上限（count 縮約） |

→ この再設計が完了するまで**実データ源 read-only gate は開かない**。
