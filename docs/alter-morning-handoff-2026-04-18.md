# Alter-Morning 引き継ぎ（2026-04-18 実機再検証 0 点再発）

**作成**: 2026-04-18 夕方（CEO 実機再検証で 0 点再発 → 新チャット引き継ぎ）
**読む順**: この 1 本だけ読めば新チャットで仕事を引き継げる構成。詳細は各ポインタへ。

---

## 0. TL;DR（30 秒）

- **北極星**: CEO 方針「LLM は意味を掴む。ロジックが計画を組む。LLM が納得できる形で伝える」
- **ここまで**: 4 週計画の W1〜W2-4 実装完了。今日さらに W2-CEO-Emergency として A+C+B（発話分解／Safety Gate Rule 4／距離 sanity）を実装、全ユニットテスト PASS
- **CEO 実機 2 回目**: **再び 0 点**。4 バグ観測
  1. Turn 1「朝からカフェで仕事」→「朝は二藍で仕事」（**LLM が地名を hallucinate**）
  2. Turn 2「朝はマックに変更して」→ 完全無視（**segmentId 解決失敗で黙殺**）
  3. Turn 2「移動手段は車」→ transport 値は set されるが **travel segment が生成されない**
  4. 「甲府周辺でランチ」→「甲府市」止まりで **店名リコメンドが一切出ない**
- **堂々巡りの本質**: 安全弁（Gate/Validator）ばかり磨いて、**そもそも LLM 出力をロジックが取りこぼしている構造穴** に手を付けていなかった
- **次セッションに委ねる**: 実機バグ 4 件の修正優先度を CEO に決めてもらい、実装 → 実機再検証のループに入る

---

## 1. 固定方針（絶対にブレない）

> **LLM は意味を掴む。ロジックが計画を組む。LLM が納得できる形で伝える。**
> 核感情: 納得感（順 = 納得感 → 満足感 → 期待感 → 幸福感）

### 層責務
| 層 | 担当 | やってよい | やってはいけない |
|---|---|---|---|
| 1 | LLM | 意味の構造化（誰/何/どこ/いつ/誰と） | 確定時刻・確定 place・travel duration を決める |
| 2 | Logic | Hard Constraint Solver | 「候補があれば採用」の曖昧解決 |
| 3 | Logic | Deep Context Injection | 深層データを切り離す |
| 4 | Logic | Soft Preference Scoring | 単一解の押し付け |
| 5 | LLM+template | Why 生成 | 飾り扱い |
| 6 | LLM+template | Alter Narration | 説明的になる |

**詳細**: `docs/alter-morning-planner-redesign.md`

---

## 2. 時系列（何をしてきたか）

### 2026-04-18 午前: 4 週計画策定
CEO 実機 0 点（1 回目）を受けて 4 週計画を固定。

- **Week 1**: 壊れを止める（Safety Gate + Travel Suppress + near の hard 距離制約化）
- **Week 2**: 構造再構築（anchor-first / origin 優先順位 / recommendation）+ Deep Context Injection
- **Week 3**: Soft Preference Scoring
- **Week 4**: Why 生成 + Alter Narration

### 2026-04-18 昼〜夕方: W1〜W2-4 実装完了
| 週 | 内容 | 状態 |
|---|---|---|
| W1 Step 6a | Safety Gate（`planReadinessGate.ts`）+ 率直保守メッセージ | ✅ commit `a9a791d7` |
| W1 Step 6b | near の hard 距離制約（1500m） | ✅ commit `a9a791d7` |
| W2-1 | anchor-first deterministic planner | ✅ commit `c373dcff` |
| W2-2 | start/end origin 優先順位（`resolveEndpoint`） | ✅ commit `ad8e2ee7` |
| W2-3 | RecommendationIntent を generic_place から分離 | ✅ commit `70d9a680` |
| W2-4 | recommendation pre-classifier + Turn1/Turn2+ 同一意味論 | ✅ commit `86cf07bd` |

### 2026-04-18 夕方: W2-CEO-Emergency（未コミット）
CEO 実機 2 回目前に前倒しで追加実装（A+C+B）。

| スレッド | 内容 | ファイル | テスト |
|---|---|---|---|
| **A** | 複合発話の句分解 + 相対アンカー（「その近く」）解決 + place 生文拒否 validator | `lib/alter-morning/utteranceDecomposer.ts` (新) / `llmDeltaParser.ts` / `llmPlanExtractor.ts` | ✅ 19/19 新規 + 既存全 PASS |
| **C** | Safety Gate Rule 4 = `place_not_resolved`（explicit place + !resolvedLat で plan_presented をブロック） | `lib/alter-morning/planReadinessGate.ts` | ✅ 16/16 PASS |
| **B** | explicit place が prevAnchor から 30km 超なら confidence=low（Rule 2 で弾く） | `lib/alter-morning/placeResolver.ts` | ✅ 61/61 PASS |
| **D** | Prompt 再設計 | — | **反証の結果、保留**（実機再検証後） |

**スイート全体**: `tests/unit/alter-morning` 846/847 PASS（残 1 は既知 `intentParser.test.ts` outfit clarify copy、Phase C-4 WIP、範囲外）

---

## 3. CEO 実機 2 回目 0 点（2026-04-18 夕方）

### 実機シナリオ
- **Turn 1**: 「明日だけど、朝からカフェで仕事しながらする予定。お昼はなつねと甲府周辺でランチの予定。18時から三子さんと会食の予定。」
- **Turn 2**: 「朝はマックに変更して。移動手段は車」

### 実機結果（破綻）
```
仕事 09:00 二藍 2時間               ← ❌ カフェ消失・二藍 hallucinate・マック反映されず
ランチ 11:00 甲府市（なつね）1時間   ← ❌ 店名リコメンド無し
散歩 12:05 15分（提案）
会食 18:00 甲府市（三子さん）45分   ← ❌ 店名リコメンド無し
カフェで一息 18:50 25分（提案）
```
移動セグメント 0 個（transport=車 反映されず）

---

## 4. 4 バグの根本診断（build agent 3 並列で特定済み）

### Bug 1: Turn 1 「カフェ → 二藍」hallucinate
| 層 | 場所 | 問題 |
|---|---|---|
| validator | `llmPlanExtractor.ts:623-648 normalizeSegment` | **LLM 出力の place に対し「userMessage に出現するか」照合が無い**。`normalizeLLMOutput(raw)` に userMessage が渡っていない |
| prompt | `llmPlanExtractor.ts:42-119 SYSTEM_PROMPT` | 「place は発話中の語のみ使用」制約が **欠落** |
| 関連 | `utteranceDecomposer.ts:134-144 isPlaceNewValueAcceptable` | 形態ゲート（長さ・文末マーカー）のみで **出処ゲートが無い**。2 文字「二藍」は trivially pass |

- baseline 住所は prompt に **流入していない**（grep 確認済み）
- hallucinate は LLM の **world knowledge 由来**（temperature 0.1 でも固有名詞は起きる）

### Bug 2: Turn 2「朝はマックに変更して」完全無視
| 場所 | 問題 |
|---|---|
| `llmDeltaParser.ts:499-513 resolveSegmentIdFromHint` | `timeHintMap["朝"]="morning"` で `seg.timeHint==="morning"` を探すが、**Turn 1 のセグメントは startTime="09:00" 付きで timeHint 未設定** → 解決 miss |
| 同 `:529-551` | activity 完全一致「朝」/ place 一致「朝」も全て miss → **segmentId=null** |
| `llmDeltaParser.ts:577-584 applyDelta` | `if (change.segmentId)` が false のとき、replace/set は **グローバル分岐にも落ちない**（transport/endTime/targetDate/departureTime/goOut のみ処理）→ **完全黙殺** |

### Bug 3: transport=車 が travel segment 生成に接続されない
| 場所 | 問題 |
|---|---|
| `TRANSPORT_EXPLICIT_RE` (`deltaClassifier.ts:78-79`) | 「移動手段は車」→ `{field:"transport", newValue:"car"}` は正しく生成される |
| `applyDelta:587` | `newTransport = "car"` は正しく set される |
| **別系統** | applyDelta 内で travel segment は生成されない。**描画時に `travelTimeEngine` / `planningEngine` の再走が起動していない**（delta 後の plan rebuild トリガが抜けている疑い）|

### Bug 4: near-anchor 推薦不発（「甲府市」止まり）
| 場所 | 問題 |
|---|---|
| `llmPlanExtractor.ts:96-106` prompt | placeSearchHint 生成の指示が **疑問文限定**（「ないかな」「ある？」）。**宣言文「甲府周辺でランチ」は非カバー** |
| `applyDeclarativeNearAnchorHints` (`llmPlanExtractor.ts:565-620`) | place 内に「近く/付近/周辺/近辺」残存 + `tail` が PLACE_CATEGORY 一致の場合のみ昇格。**「甲府」単独 + 「ランチ」activity 別居の組合せは効かない** |
| 結果 | `place="甲府"` が plain 生地名で `resolvedPlaceName="甲府市"` になり、`resolveNearAnchorPlaces` が **発火しない** |
| 副症状 | 18:50「カフェで一息」は `gapFillEngine.ts:304,340,379,407,427,457,477` のハードコード filler。本来の会食 near-anchor が立たないせいで填詰めに見える |

---

## 5. 共通パターン（CEO が感じている「堂々巡り」の正体）

**ロジック側（受け取り側）の穴が累積している**。
LLM の意味理解が正しくても、ロジックが取りこぼしている。

- Bug 1 → validator の穴（**出処ゲート欠落**）
- Bug 2 → segmentId 解決の穴（**時間帯逆引き欠落**）
- Bug 3 → rebuild トリガの穴（**delta 後の再構築が起動しない**）
- Bug 4 → prompt + 昇格ロジックの穴（**宣言文経路が無い**）

今までの A+C+B・W1 Safety Gate・W2-1〜4 構造再構築は **すべて「壊れた値を拒否／破綻を止める」方向**。
実機で必要なのは **「LLM 出力を取りこぼさず活かす」方向**。同じ「固定方針」を見ていたが、穴の場所を間違えていた。

---

## 6. 修正優先度提案（次セッションへの引き継ぎ）

| 順 | Bug | 体験影響 | 実装リスク | 概要 |
|---|---|---|---|---|
| **1** | Bug 4 | **最大** | 小 | prompt に宣言文対応を追加 + `applyDeclarativeNearAnchorHints` を「広域地名 + PLACE_CATEGORY activity」組合せに拡張 |
| **2** | Bug 1 | 大 | 小 | `normalizeLLMOutput(raw, userMessage)` で place の userMessage 照合。未出現＆未知語なら null に戻し `missingFields: segmentPlace` |
| **3** | Bug 2 | 大 | 中 | `resolveSegmentIdFromHint` に **時間帯逆引き** 追加（startTime / timeConstraint から「朝/昼/午後」マッチ） |
| **4** | Bug 3 | 中 | 中-大 | delta 適用後の rebuild トリガ調査 → transport 変更時に `buildDayPlanAsync` 再走 |

**CEO 判断待ち（本セッション時点）**:
1. この順序で進めるか / 並列で進めるか
2. A+C+B はコミット保留 or 修正と一緒にコミット
3. D（Prompt 全面再設計）は保留継続でよいか

---

## 7. 未コミット変更の状態

```bash
git status # main より 81 commit ahead、未 push
```

### A+C+B の新規/修正ファイル（未コミット）
```
新規:
  lib/alter-morning/utteranceDecomposer.ts
  tests/unit/alter-morning/utteranceDecomposer.test.ts

修正:
  lib/alter-morning/llmDeltaParser.ts        # detectDeltaForClause + relative anchor
  lib/alter-morning/llmPlanExtractor.ts      # Turn 1 place validator
  lib/alter-morning/planReadinessGate.ts     # Rule 4
  lib/alter-morning/placeResolver.ts         # 30km sanity
  tests/unit/alter-morning/placeResolver.test.ts
  tests/unit/alter-morning/planReadinessGate.test.ts
```

### それ以外の未コミット変更（今回スコープ外）
`git status` で約 50 ファイルが modified/untracked。これらは別の作業（Calendar、my-style、Stargazer weather 等）の WIP。State Safety Rule 違反だが、今回セッションでは触っていない。新チャットで扱う場合は **必ず個別 add**（`git add -A` 禁止）。

---

## 8. 新チャット開始時の最小ブート手順

```bash
# 1. このドキュメントを読む
cat docs/alter-morning-handoff-2026-04-18.md

# 2. 4 週計画の詳細を読む
cat docs/alter-morning-planner-redesign.md

# 3. 現状のテスト状態を確認
npx vitest run tests/unit/alter-morning 2>&1 | tail -20
# → 846/847 PASS が出れば A+C+B が生きている状態

# 4. 現在 CEO 判断待ち事項（本ドキュメント §6）を CEO に提示して承認取得

# 5. 承認後、優先度順に修正着手
#    - Bug 4: llmPlanExtractor.ts :96-106 / :565-620
#    - Bug 1: llmPlanExtractor.ts :623-648 (normalizeSegment に userMessage を通す)
#    - Bug 2: llmDeltaParser.ts :499-513 (resolveSegmentIdFromHint 拡張)
#    - Bug 3: morningProtocol.ts / buildDayPlanAsync の呼び出し経路調査
```

### 新チャットへの明示的申し送り

1. **症状 → 原因 → 修正 の順で進む**。安全弁先行はもう一度やらない
2. **実機再検証をマイルストンに置く**。各 Bug 修正後、CEO にユニットテスト結果ではなく **実機で見た挙動** を報告する
3. **A+C+B はロールバックしない**。壊れた値を拒否する層として後の修正と整合する
4. **D（Prompt 全面再設計）は誘惑だが保留**。Bug 1-4 を塞いでも 0 点が続いたら着手
5. **「堂々巡り」の分析を忘れない**: ロジック側の穴 = Bug 1-4 は全て「受け取り側」の問題。LLM を責める前に、受け取り側のログを実機で確認する

---

## 9. 参照ポインタ

### コード
- `lib/alter-morning/llmPlanExtractor.ts` — Turn 1 抽出（Bug 1, 4 の主戦場）
- `lib/alter-morning/llmDeltaParser.ts` — Turn 2+ delta（Bug 2 の主戦場）
- `lib/alter-morning/morningProtocol.ts` — API エントリ（Bug 3 の主戦場）
- `lib/alter-morning/placeResolver.ts` — near-anchor 検索（Bug 4 の接続先）
- `lib/alter-morning/planReadinessGate.ts` — Safety Gate（A+C+B の C）
- `lib/alter-morning/utteranceDecomposer.ts` — 複合発話分解（A+C+B の A、新規）

### ドキュメント
- `docs/alter-morning-planner-redesign.md` — 4 週計画の原典
- `docs/decision-log.md` — 意思決定ログ
- `docs/weekly-priorities.md` — 週次優先事項
- 本ドキュメント（`docs/alter-morning-handoff-2026-04-18.md`）

### 直近の関連コミット
```
86cf07bd feat(alter-morning): W2-4 recommendation pre-classifier + Turn1/Turn2+ 同一意味論
70d9a680 feat(alter-morning): W2-3 — RecommendationIntent を generic_place から分離
ad8e2ee7 feat(alter-morning): W2-2 start/end origin 優先順位修正 — resolveEndpoint
c373dcff feat(alter-morning): W2-1 anchor-first deterministic planner
a9a791d7 fix(alter-morning): Week 1 Step 6a+6b — 壊れた確定プランを出さない
3a9fb26f docs(alter-morning): planner 再設計 4週計画を固定（CEO 承認 2026-04-18）
```

---

## 10. 率直な自己反省（CEO 宛）

- 「壊れたプランを出さない」安全弁（A+C+B）を先に実装したのは **順序の誤り** だった
- CEO が実機で欲しかったのは「ちゃんと動くプラン」であって「壊れたら止まるプラン」ではない
- ユニットテスト PASS を成果として報告したが、**実機で触ったらすぐ壊れる**ことを想定していなかった
- 「反証を加えて進める」原則は守ったが、反証の対象が **安全弁の追加効果** だった。本来は **症状の根本原因** に反証を当てるべきだった

**次セッションへの提案**: 最初のターンで CEO と「どの Bug から着手するか」「実機再検証の判定基準は何か」を合意してから、コード に触る。
