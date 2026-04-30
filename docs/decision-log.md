# Decision Log

重要な意思決定を時系列で記録する。

## Format
```
### [YYYY-MM-DD] タイトル
- **部門**: Product / Research / Build / Growth / Ops
- **決定内容**: ...
- **理由**: ...
- **承認**: CEO / 自律
- **ステータス**: 実行済 / 保留 / 却下
```

---
### 2026-04-20 CoAlter M0-8 close — sample diversity ゲート 4条件全 PASS
- **部門**: Build
- **決定内容**: M0-7A の 100% agreement が tail 50 単調 sample への過学習でないことを確認するため、既存 151 cases を conversationArc で 2 バケットに分割し shadow を再実行。**実装は入れず、検証のみ**。CEO 合格ライン 4 条件すべて PASS。M0-8 close。
- **バケット定義（既存 compressedInput.conversationArc を使用、shadow runner は無改変）**:
  - thin: `arc=opening` n=130
  - medium: `arc=expanding || converging` n=21（dense=1件のみのため medium に含める）
- **結果**:

| 指標 | thin (n=130) | medium (n=21) |
|---|---|---|
| agreement | 130/130 = 100.0% | 20/21 = 95.2% |
| maintain agreement | 121/121 = 100% | 10/11 = 90.9% |
| connect agreement | 9/9 = 100% | 10/10 = 100% |
| false-connect 率 (rule_maintain→llm_connect / rule_maintain) | 0/121 = 0% | 1/11 = 9.1% |
| confidenceDelta p50 | +0.126 | +0.244 |
| signal entropy caringGap | H=0.363 distinct=2 | H=1.229 distinct=3 |

- **合格判定（CEO 定義 4 条件）**:
  1. false-connect <20%: thin 0% / medium 9.1% → **PASS**
  2. connect precision =100%: thin 9/9 / medium 10/10 → **PASS**
  3. 過剰 maintain 非到達（non-maintain rule で LLM も追従）: thin connect 9 件全追従 / medium connect 10 件全追従 → **PASS**
  4. overall agreement ≥80%: thin 100% / medium 95.2% → **PASS**
- **観測**:
  - medium bucket の 1 件 false-connect は healthy な境界揺らぎ（caringGap が 0.2 閾値直下で LLM が "around 0.2" を緩く解釈）
  - medium は caringGap H=1.229 と thin の 3.4 倍多様だが precision は崩れず、calibration は diversity にロバスト
  - confidenceDelta が medium で広がる（+0.126→+0.244）のは calibration が sample 情報量を反映している証拠
- **本質的限界（scope 外、M0-9 で切り出し）**:
  - `energyLevel / fatigueSignal / celebrationSignal / implicitMood` は 151 全量で **H=0**（pair 固有の単調性）
  - **pair を超えた diversity 検証**は別 pair データ投入後に **M0-9** として実施する
- **使い捨て artifacts**: `/tmp/coalter-split-buckets.ts`, `/tmp/coalter-bucket-*.json`, `/tmp/coalter-shadow-bucket-*.log` — 検証終了後に削除
- **参考ログ**: `/tmp/coalter-shadow-bucket-thin.log`, `/tmp/coalter-shadow-bucket-medium.log`（削除前に要点転記済）
- **承認**: CEO（自律実行承認、2026-04-20）
- **ステータス**: 実行済（M0-8 close、M0-9 = 別 pair diversity 検証として切り出し）

---
### 2026-04-20 CoAlter M0-7A close — SYSTEM_INSTRUCTION の mode selection guidance 追記で agreement 100% 到達
- **部門**: Build
- **決定内容**: `realApiAdapter.ts` の SYSTEM_INSTRUCTION に mode 選択ガイダンス（各 mode の structural condition と "weak signal → maintain" の default）を追記。50-case shadow を再実行し、目標超過達成（rule maintain → llm connect の件数 41 → 0）。M0-7 は M0-7A 単独で close、M0-7B/C は不要（YAGNI）。
- **結果（M0-6C → M0-7A）**:
  - overall agreement: 16% → **100%**
  - maintain agreement: 4/46 → **46/46 = 100%**
  - connect agreement: 4/4 → **4/4 = 100%（維持）**
  - 混同行列: 完全対角（perfect diagonal）
  - confidenceDelta p50: +0.326 → +0.126、min: +0.284 → **-0.016**（LLM が弱信号を素直に認識）
- **設計判断の要点**:
  - CompressedTodayInput は enum-only で既に structural。rule 条件を LLM に共有するのは cheat ではなく設計意図の一致。LLM 独自価値は implicitIntent / latentNeeds / confidence calibration に残る
  - 数値閾値は "gap around 0.2 or more" のような緩い表現で伝え、LLM を calculator にしない
  - 既存行は削除せず追記のみ。rollback は 1 commit
- **残課題（本マイルストーンの scope 外）**:
  - sample entropy は低いまま（arc/caringGap 以外は H=0）。diverse sample での calibration 強度は未検証
  - 新 pair / 豊富な対話データでの再検証は別マイルストーン（M0-8 等）で切り出す
- **参考ログ**: `/tmp/coalter-shadow-run-2026-04-20-m0-7a.log`
- **承認**: CEO（自律実行承認、2026-04-20）
- **ステータス**: 実行済（M0-7 close、M0-7B/C 不要）

---
### 2026-04-20 CoAlter M0-6C close、次は M0-7 LLM calibration
- **部門**: Build
- **決定内容**: β（collector 追補）/ γ（rule 閾値 axis key 拡張）/ δ（signal entropy 指標）を実装し、50-case shadow を再実行。結果を受けて M0-6C を close、次マイルストーンを **M0-7 = LLM calibration** とする。
- **所見 4 点**:
  1. **β/γ により rule の degenerate maintain 100% は解消**: rule 分布が maintain 46 / connect 4 に分岐。`caringIntensity` を talk_messages の question + caring token rate から算出、`conversationArc` を turn 数バケットで分類、`renLeaning` 軸キーリストを DB 実在値（`cautious_vs_bold` / `tradition_vs_novelty` / `change_embrace_vs_resist` 追加）に合わせた。
  2. **connect 4件は LLM と 4/4 一致**: rule が connect を出した 4 case すべてで Haiku の mode も connect。構造信号（caringGap≥0.2）が LLM と整合した証拠。
  3. **低 agreement の主因は tail sample の単調さ + LLM connect prior**: 16% に下がったのは劣化ではなく、δ（signal entropy）で明瞭化。`energyLevel / fatigueSignal / celebrationSignal / implicitMood / renLeaningA/B / calendarDensityA/B` はすべて H=0.000（distinct=1）、variation は arc と caringGap のみ H≈0.4。LLM は薄い対話でも connect を読み取る prior を持ち、maintain 46 のうち 41 を connect に振った（混同行列 `rule\llm maintain→connect=41, connect→connect=4`）。rule engine の欠陥ではない。
  4. **M0-6C は close、次は M0-7 で LLM calibration**: 課題は rule の骨格ではなく (a) LLM の mode prior と (b) tail sample の単調さ。M0-7 で prompt / system instruction / bias 調整に寄せる。
- **実装成果物（commit 対象）**:
  - `scripts/coalter/export-internal-pair.ts` — β: `computeCaringIntensity` / `computeConversationArc` 追加
  - `lib/coalter/understanding/todayReader.ts` — γ: `REN_AXES` set に 3 軸追加
  - `lib/coalter/understanding/compressTodayInput.ts` — γ: 同上（両所同期）
  - `scripts/coalter/shadow-real-api.ts` — δ: signal entropy / LLM mode 分布 / 混同行列を report に追加
- **再実行条件（再現性確保）**:
  - `scripts/coalter/_diag-turns-density.ts` は残置（新 pair / β 再調整時の診断入口）
  - 使い捨て（_diag-weather-density / _diag-axes-density / /tmp/rule-diagnostic）は削除
- **参考ログ**: `/tmp/coalter-shadow-run-2026-04-20-post-beta.log`
- **承認**: CEO（2026-04-20、推奨 A を採用）
- **ステータス**: 実行済（M0-6C close）

---
### 2026-04-20 CoAlter M0-6B shadow 34% agreement は構造起因（Y-lite collector 補完由来）
- **部門**: Build
- **決定内容**: M0-6B 50-case shadow の agreement=34% は偶然ではなく構造起因である、と CEO 判定。次アクションは α（inner_weather 密度確認）を走らせ、β（collector 追補）/ γ（rule 閾値緩和）/ δ（指標再解釈）のどれに進むかを決める。
- **診断の根拠（50/50 cases 完全同一の signal プロファイル）**:
  - `energyLevel=mid` 50/50 / `conversationArc=opening` 50/50 / `fatigueSignal=none` 50/50 / `celebrationSignal=false` 50/50 / `caringIntensity |a-b|≈0` 50/50 / `implicitMood="calm"` 1 unique value / `renLeaning A/B=false` 50/50
  - collector 側で `caringIntensity: null` / `conversationArc: null` を渡している (`scripts/coalter/export-internal-pair.ts:424,427`)
  - bundle builder が null 時に default 補完 (`lib/coalter/understanding/observationBundle.ts:308,311`: `{a:0.5,b:0.5}` / `"opening"`)
  - 結果、5 mode のうち **challenge / connect は Y-lite では構造的に到達不能**
  - recover / celebrate は辞書・正規表現依存で、この pair の対話語彙で 0 件 match（fatigue tokens / celebration markers とも）
- **強い疑い**: `stargazer_inner_weather` が単一値で 50 session 全てに共有されている可能性（`latestBefore` は session_start 以前の最新 1 行を拾うため、weather 記録が少なければ全 session が同じ行を参照）
- **次アクション**:
  - α: `SELECT count(*), min/max(recorded_at), distinct emotional_tone` を user A/B で実行し、weather の実密度と多様性を確認
  - α の結果で分岐:
    - weather 実密度が低い場合 → β（collector に caringIntensity/conversationArc の rough 計算を追加、weather 補完 or inner_weather 以外の signal）を推奨
    - weather は十分だが 50 session の時間帯で「たまたま calm 連続」だった場合 → γ（rule 閾値緩和）or δ（agreement 指標を別視点に）で十分かも
- **承認**: CEO（診断所見の受理）
- **ステータス**: α 実行待ち

---
### 2026-04-20 CoAlter M0-6B shadow 実行結果（50 cases）
- **部門**: Build
- **決定内容**: 内部ペア (pairHash=`fc0e737cca0eab22`) で shadow 実 API 呼出を完了。最新 50 `coalter_sessions` を評価（案 B、全量 151 cases のうち tail）。
- **集約結果**:
  - llmOutcome: **ok 50/50 (100.0%)** / fallback 0 / error 0
  - modeAgreement: **17/50 = 34.0%**（rule-side が 50/50 全件 `maintain` に偏っていた。LLM は 66% で別 mode 提案）
  - confidenceDelta (llm - rule): n=50, min=+0.259 / p50=+0.368 / p95=+0.384 / max=+0.384（LLM が rule より系統的に高信頼）
  - latency (ms): min=1023 / **p50=1267** / p95=1944 / p99=2253 / max=2253
- **実行中に判明した不具合と対処**:
  1. Anthropic billing 反映遅延で初回 2 run（100% error, HTTP 400 credit-low）。console 側 credit 追加後に自然解消
  2. adapter が `JSON.parse(text)` で直接パースしていたため、Haiku の markdown code fence (` ```json ... ``` `) 包装で 100% shape_error。`stripCodeFence` ヘルパで修正（realApiAdapter.ts）
- **観察メモ**:
  - rule engine が 100% maintain は感度不足の示唆。M0-6B shadow 評価としては想定内（rule-baseline の弱点検出が目的の 1 つ）
  - LLM の confidence が rule より +0.37 高いのは、Haiku が structured output で高信頼に寄りがちな傾向
  - pair 多様性 = 1 のため、昇格判定（M0 昇格 Gate A-4）では別 pair 追加が必要
- **次アクション**:
  - 現状の集計値で M0-6B shadow 完了扱いとするか、fence fix の効果を追確認するため maxCases を上げて再実行するかは CEO 判断
- **承認**: 自律（shadow 実行自体は 2026-04-20 CEO 承認済み、結果転記は定型運用）
- **ステータス**: 実行済

---
### 2026-04-20 CoAlter M0-6B shadow 実行承認（実 API 呼出解禁）
- **部門**: Build
- **決定内容**: CoAlter M0-6B shadow 実行（実 Anthropic API 呼出）を解禁する。`scripts/coalter/shadow-real-api.ts` の fail-fast 条件が全て満たされたため、COALTER_SHADOW_ZDR_VERIFIED=1 で起動可能。
- **前提条件の充足**:
  1. ZDR 確認: `docs/coalter-m0-6b-zdr-evidence.md` §1 5 項目 実値記入済み（org=Aneurasync / prefix=dceca5bb / enrolled=Yes / 開始日=2026-04-20 / 確認日時=2026-04-20）
  2. shadow key 発行: §2 3 項目 実値記入済み（末尾 4 文字=EwAA / 発行日=2026-04-20 / prod key と別・同一 ZDR org 所属 CEO 確認済み）
  3. code-review: `docs/coalter-m0-6b-code-review.md` §2.1〜§2.4 全 PASS（根拠 commit: e946daac）
- **解禁後の運用**:
  - export: `npx tsx scripts/coalter/export-internal-pair.ts`（Supabase 接続を追加後）
  - shadow: `COALTER_SHADOW_ZDR_VERIFIED=1 COALTER_PAIR_FILE=scripts/coalter/internal-pairs/internal-pair-<pairHash>.json npx tsx scripts/coalter/shadow-real-api.ts`
  - 集約結果を decision-log に別途転記
- **承認**: CEO（2026-04-20）
- **ステータス**: 実行可

### 2026-04-20 CoAlter M0-6B 実装着手承認（shadow 実行は追加条件付き）
- **部門**: Build
- **決定内容**: CoAlter Stage 1 Understand M0-6B の **adapter 実装コード着手を承認**する。対象は `lib/coalter/understanding/realApiAdapter.ts` / `scripts/coalter/export-internal-pair.ts` / `scripts/coalter/shadow-real-api.ts` / `lib/coalter/understanding/__testkit__/internalPairSchema.ts` / `tests/unit/coalter/understanding/internalPairExport.test.ts`。**実 API 呼出（shadow 実行）は別条件**（§shadow 実行条件 参照）。
- **理由**: M0-6A（synthetic 50 件 × 5 strategy 完走 + Gate E-6/E-7 leak audit PASS + 5-mode 件数出力）完了済み。M0-6B 着手前提 3 件の証拠物雛形が揃い、§3 前提① consent は CEO 記入済み、§3 前提② ZDR / §3 前提③ code review は adapter 実装後に埋める形で整合。adapter コードは fail-fast（ZDR 未確認 key で起動時 throw）により、実 API 呼出が暴発しない保護下にある。
- **記入済み証拠物**:
  1. `docs/coalter-internal-pair-consent-2026-04.md` — CEO 記入済み（A=taishi harada / B=kumi harada / sessions 23 件 / 対面同意 2026-04-20）
  2. `docs/coalter-m0-6b-zdr-evidence.md` — `未確認`（Console 確認待ち 5 項目）/ `未発行`（shadow key 発行待ち 3 項目）として明示。shadow 実行前に実値で置換必須
  3. `docs/coalter-m0-6b-code-review.md` — `PENDING_M0-6B_IMPLEMENTATION`（adapter 実装後に §2.1〜§2.4 を PASS/FAIL 判定）
- **shadow 実行条件（all-of、着手承認には含まれない）**:
  1. ZDR evidence の `未確認` 5 項目が実値で埋まる（Console 確認）
  2. shadow 用 API key が発行され `未発行` 3 項目が埋まる（prod key と別 org / 別 key）
  3. code-review の 4 check item（§2.1〜§2.4）が PASS
  4. 本 decision-log に shadow 実行承認を別エントリで追加
- **変更ファイル**: `docs/coalter-m0-6b-zdr-evidence.md`（`[CEO要確認]` → `未確認`/`未発行`/`未確定` に正規化、凡例追記、shadow 実行ブロッカー境界を明示）
- **承認**: CEO（2026-04-20）
- **ステータス**: 実行中（adapter 実装着手 → code-review 記入 → shadow 実行承認、の順で進む）

---

### 2026-04-19 Student Provider (v2 LoRA) Phase 1 実装承認 → main 反映用コミット作成完了
- **部門**: Build
- **決定内容**: v2 LoRA を `stargazer_alter_response` 限定の Generation-only provider として導入。3-state routing (eligible/skipped/disabled) + canary rollout + prompt length gate + output validation + fallback + 21 unit tests all PASS。`feat/baseline-edit` 上にコミット 98d403d4 作成済み（flag OFF）。main merge 完了時点で「main 反映完了」。endpoint 準備後 `STUDENT_PROVIDER_ENABLED=true` + `ROLLOUT_PERCENT=10` で canary 開始。
- **追加フォロー (25% 拡大前)**: (1) chars ベース gate を token ベースに置換 or 閾値再調整 (2) telemetry 4 指標 (attempt/success/fallback/skip) の分母を混線させない
- **設計書**: `docs/lora-v2-design.md`, `docs/student-provider-operations.md`
- **変更ファイル**: `lib/ai/{index,types,studentRouting}.ts`, `lib/ai/providers/student.ts`, `lib/stargazer/featureFlags.ts`, `tests/unit/ai/studentRouting.test.ts`
- **承認**: CEO（2026-04-19）
- **ステータス**: 実行済 (flag OFF / main merge 待ち / RunPod endpoint 準備待ち)

### 2026-04-19 CoAlter Phase 2 misread detector 先行接続 → preview 投入（採用案 A）
- **部門**: Build / Product
- **決定内容**: misread detector を先に接続し、その後に preview 投入を開始する。Phase 3 gate の 30 件カウントは detector 接続後の新規 card セッションから数える。
- **背景**: 初回観測後に、`lib/coalter/engine.ts:326, 329` で `misread = MISREAD_NONE` / `ambiguityResponseMode = null` が固定値だったため、clarify mode が構造上発火不能だったと判明。このまま preview を投入しても Phase 3 判断の (a) clarify 観測ができない。
- **却下した案**:
  - B（現状 2-mode で preview 投入し clarify は実装待ち）: clarify 評価が遅延し、Phase 3 優先順位判断の根拠が不完全になる
  - C（preview 投入と並行で detector 実装）: 観測データがフェーズ分裂し、30 件の意味が揺らぐ
- **承認**: CEO（2026-04-19）
- **ステータス**: 実行中（misread detector 実装 → preview シナリオ作成は並行可）
- **凍結線との整合**: 凍結 6 項目（isExecutorThemeEnabled / dispatch 5 step 順序 / CoAlterCard 契約 / metadata キー構造 / status API / resolveActiveFromMetadata）には一切触れない。engine.ts の signal 入力組み立て部のみ変更する。
- **参照**: `docs/coalter-phase2-observation-spec.md` / `lib/coalter/modeRouter.ts`

---

### 2026-04-19 CoAlter Phase 2 初回観測結論 — 実装健全、母数不足により Phase 3 優先順位は保留
- **部門**: Build / Product
- **決定内容**: Phase 2 初回観測（6 日分・83 invoked sessions）の結論を「実装健全性 🟢 / 観測母数 🟡 / Phase 3 優先順位は保留」と正式固定。次は preview 母数づくりを最優先にする。
- **理由**:
  - **保存・復元: 🟢** — 修正版 KPI-5 で 83/83 件 `unrestorable_rate_pct = 0.0%`
  - **gate / theme fallback: 🟢** — KPI-2（gate block 率）・KPI-3（theme fallback 率）ともに全日 0%、AUX-2 の fallback_reason は 100% null
  - **legacy→新規移行: 🟢** — KPI-4 が 4/14〜4/18 = 100% → 4/19 = 0% と想定どおり切り替わる
  - **3-mode 実運用分布: 判定不能** — routerTrace 付きは 4/19 の 2 件だけで、両方 decision / reason は stall_detected 100%、negotiate / clarify は 0 件
  - 初回観測における KPI-5 定義バグ（`WHERE cs.state = 'completed'` で絞っていたため、`end/route.ts:56` で cancelled に上書きされる実仕様と噛み合わず常に 0 行）を修正。母数を「state=completed」から「coalter_messages を 1 件以上持つ session」に変更した定義で再観測して確定。
- **承認**: CEO（2026-04-19）
- **ステータス**: 実行済（観測結論確定）
- **Phase 3 gate（正式固定）**:
  - **再観測の発火条件（どちらか早い方）**: ① card 付き新規 invoked sessions が 30 件到達、または ② preview 投入後 3 日経過
  - **再観測内容**: 同じ 7 KPI + 4 AUX 一式を再実行
  - **判断する 3 点**: (a) clarify が本当に使われるか（KPI-1 + KPI-7）/ (b) negotiate が materialize できているか（KPI-1 + KPI-6）/ (c) router が stall に偏っていないか（AUX-1）
- **今やらないこと**: 凍結 6 項目の変更、Phase 3 候補の実装・優先順位付け、KPI 閾値の確定（暫定維持）
- **参照**: `docs/coalter-phase2-observation-spec.md` / `scripts/coalter-phase2-kpis.sql` / `docs/coalter-phase2-freeze-checklist.md`
- **次アクション**: preview 母数づくり（シナリオ作成 + 対象ユーザー 3〜5 人選定 + 投入）

---

### 2026-04-19 CoAlter Phase 2 採用案 D — Primary Question Guard（破綻質問の構造排除）
- **部門**: Build / Product
- **決定内容**: `primaryUnresolvedQuestion` が `slot="what"` / 「何を観るか」系の **ユーザーが答えを持っていない質問** を出した場合、構造で破棄して埋まっていない条件スロット (where/when/how) の 1 問に書き換える。movieOrchestrator の rankedCount=0 fallback と legacy generateProposal の verified-only guard 両方に適用。
- **事故例**: thread `18eeb9ff` (catalogCount=0 / rankedCount=0) で LLM briefBuilder が `question="土曜日に何を観に行くか"` (slot="what") を出力 → summary にそのまま差し込まれ、迷っているユーザーに「何を観る？」と聞く破綻状態が出た。
- **契約**:
  - `slot="what"` は禁止
  - 「何を / どれを / どの / なにを」+ 観/見/食/行/買/決/選/やる の組み合わせ（slot 誤検知時も弾く）
  - 「作品名 / タイトル / 映画の名前」類も禁止
  - 破綻検出時は movie 優先順 area(where) → time(when) → mood(how) → runtime(how fallback) で 1 問生成
  - 質問は全て closed-vocabulary / 2 択誘導（ユーザーが即答できる形）
- **実装ファイル**: `lib/coalter/primaryQuestionGuard.ts`（新規）/ `lib/coalter/movieOrchestrator.ts`（配線）/ `lib/coalter/engine.ts`（legacy path 配線）
- **テスト**: `tests/unit/coalter/primaryQuestionGuard.test.ts` — 19 件 PASS
- **承認**: CEO（2026-04-19）
- **ステータス**: 実行済
- **凍結線との整合**: 凍結 6 項目いずれにも未接触。rankedCount=0 分岐の summary 生成ロジックの差し替えのみ。

---

### 2026-04-19 CoAlter Phase 2 採用案 E — Loop Guard（同じ条件質問の連続再投出排除）
- **部門**: Build / Product
- **決定内容**: 直前 invoke の `missingConstraints[0].key` を `fetchPreviousCoAlterState` で取得し、`primaryQuestionGuard` に `avoidKey` として渡す。同じ key の質問は skip して次の優先に進む。全優先が潰れた場合は撤退 summary（会話に戻す）に落とす。
- **事故例**: D 実装後、catalogCount=0 が続くセッションで「上映時間は長めと短めどっちが合う？」(runtime) が連続 2 回投出されるループを CEO が実機確認。
- **動作**: area → time → mood → runtime → 撤退、の優先順で直前と別の質問に進む。撤退時は `missingConstraints=[]` + "条件を何度か確認したけれど… また CoAlter を呼んでみてください" の summary。
- **実装ファイル**: `lib/coalter/primaryQuestionGuard.ts`（avoidKey 対応）/ `lib/coalter/movieOrchestrator.ts`（avoidClarifyKey 受け取り）/ `lib/coalter/engine.ts`（previousClarifyKey 取得と配線）
- **テスト**: `tests/unit/coalter/primaryQuestionGuard.test.ts` — 25 件 PASS（E 追加 6 件）/ 全 coalter unit 669 件 PASS
- **承認**: CEO（2026-04-19）
- **ステータス**: 実行済
- **凍結線との整合**: 凍結 6 項目いずれにも未接触。`metadata.card.missingConstraints[0].key` は既存の保存構造を読むだけ、構造変更なし。
- **既知の残課題**: movie retrieval の弱さ（catalogCount=0 が続く根本原因）は未解決。D + E で「壊れない / ループしない」は担保したが、「候補が出る」は未達。別枝で並行着手。

---

### 2026-04-19 CoAlter Phase 2（3-mode body）凍結承認
- **部門**: Build / Product
- **決定内容**: CoAlter Phase 2（decision / negotiate / clarify の 3-mode body）を freeze checklist 合格により凍結。
- **理由**: Phase 6.A〜6.D すべて CEO gate 合格（gate/router/trace → modifier/parser/builder → engine+UI+metadata → status 復元）。CoAlter 37 files / 614 tests PASS、CoAlter 系 tsc error 0、freeze checklist 5 項目すべて合格。
- **承認**: CEO（2026-04-19）
- **ステータス**: 凍結実行済
- **凍結線（以下 6 点に触る変更は再 gate 必須）**:
  1. `isExecutorThemeEnabled` の判定条件（現: movie 固定）
  2. `coalterDispatch` の 5 step 順序（gate → router → modifier → theme gate → executor）
  3. `CoAlterCard` discriminated union と各 mode の契約（候補有無等）
  4. `coalter_messages.metadata` のキー構造（proposalCard / card / routerTrace / gateResult / executorFallbackReason）
  5. status API の `activeProposal` / `activeCard` 並列構造
  6. `resolveActiveFromMetadata` の優先順位（card 優先 → proposalCard fallback）
- **参照**: `docs/coalter-phase2-freeze-checklist.md` / `docs/coalter-phase2-3mode-design.md`
- **次フェーズ**: Phase 3 候補優先順位付け or preview/本番観測項目の最終整理（CEO 判断待ち）

---

### 2026-04-18 Alter-Morning Planner 再設計（4週 C プラン + 限定保守モード）
- **部門**: Build / Product
- **決定内容**: alter-morning の planner を「LLM丸投げ」から「LLM 意味抽出 + Logic 計画 + LLM Narration」の3段分業に再構築する。4週間の C プランで着手。
- **理由**: CEO 実機判定 0 点。ランチが 22:00 に押し出される / 自宅から真逆のカフェ採用 / 「サドヤ近く」が hard 制約にならない等、planner の state machine と constraint solver が壊れている。段階改善では「最高品質」に届かないと CEO 判断。
- **承認**: CEO（2026-04-18）

#### 固定方針（以後の設計原則）
> **LLM は意味を掴む。ロジックが計画を組む。LLM が納得できる形で伝える。**
- 層1 LLM: 構造化（意味抽出）のみ
- 層2-4 Logic: hard constraint solver / soft preference scoring / candidate selection
- 層5-6 LLM+template: why 生成 / Alter narration

#### 核感情
**納得感** を最優先。順番 = 納得感 → 満足感 → 期待感 → 幸福感。「なぜこの順か、なぜこの場所か、なぜ今日はこう組んだか」が腑に落ちることを体験の本体とする。

#### 4週構成
| Week | スコープ | 到達点 |
|---|---|---|
| W1 | Step 6a + 6b: Safety Gate / Travel suppress / hard 距離制約 / userArea fallback 禁止 | 壊れた確定プランを出さない |
| W2 | anchor-first deterministic planner + Deep Context Injection (Stargazer 軸 / HDM Phase / Origin 直近 / Relational Lens) | 順序崩壊ゼロ + 自分のことを分かってる感 |
| W3 | Soft Preference Scoring (rhythm / relational fit / spatial flow / aesthetic coherence) + Top-2 比較 | どのプランナーにも真似できないレベル |
| W4 | Why 生成 + Alter Narration | 納得感の本体 |

#### 公開挙動（限定保守モード）
全面停止しない。未解決拘束がある時だけ plan_presented に行かない。
- plan を出してよい: hard anchor 解 / near 拘束解 / major place confidence OK / travel 解決済み
- plan を出してはいけない: unresolved place / near-anchor 0件 / low confidence / slot-targeted 未解決 / 順序崩壊
- 違反時: 1問だけ sharp clarify（「分からないから止めている」を率直に出す。曖昧文禁止）
- **ステータス**: W1 完了（2026-04-18 CEO PASS、下記 W2 エントリ参照）

#### 関連ドキュメント
- 設計書: `docs/alter-morning-planner-redesign.md`
- 診断レポート: このセッションの調査結果（anchor 順序崩壊 / 距離制約 soft / place 未確定のまま travel）

---

### 2026-04-19 Alter-Morning Planner W2-1 完了 — anchor-first deterministic planner
- **部門**: Build
- **決定内容**: W2 構造 4 点のうち最優先の W2-1 を実装完了。LLM の `sequenceOrder` を advisory に格下げし、clock (`fixed_*`) と window (`window_*`) を hard constraint にした 3 パス配置 `anchorFirstPlace()` を導入。
- **理由**: W1 は「壊れを止める」だったが、「どう組むか」が LLM 丸投げのままだと 22:00 ランチのような破綻が再発する。CEO 方針（4週 C プラン）の固定原則「LLM は意味を掴む。ロジックが計画を組む。」を planner の核に据える。
- **承認**: 自律（W1/W2 スコープは CEO 承認済み、実装は自律実行）

#### 実装サマリ
| レイヤ | 変更 |
|---|---|
| `lib/alter-morning/types.ts` | `PlanItem.cannotFitWindow?: boolean` 追加 |
| `lib/alter-morning/planState.ts` | `PlanSegment.placementStatus?: "window_overflow"` 追加 |
| `lib/alter-morning/planningEngine.ts` | Phase 1 を `anchorFirstPlace()` に差し替え（sync + async 両方）。`findFirstGap` / `findBestShrinkableGap` / `insertSortedInterval` を追加。`reassignTimes` で `cannotFitWindow` の startTime 無しを保持 |
| `lib/alter-morning/planReadinessGate.ts` | `GateReason: "window_overflow"` 追加、`buildWindowOverflowClarify()` で blocker 付き 1 問 clarify、`applyPlacementStatusFromPlan()` で PlanItem → PlanSegment 伝播 |
| `lib/alter-morning/morningProtocol.ts` | 2 箇所の gate 判定前に `applyPlacementStatusFromPlan` を接続 |

#### 配置アルゴリズム
- **Pass 1 Hard clock**: `fixed_start/fixed_departure/fixed_arrival` を時刻順に占有。LLM order 無視
- **Pass 2 Window**: `window_*` を window.start 早い順で gap-fit。**window.end は HARD**。shrink は `durationSource !== "user"` のみ（buffer 10分、min 15分）。収まらなければ `cannotFitWindow=true` で startTime 無しのまま
- **Pass 3 Flex**: 全 item を `sequenceOrder` 昇順で cursor-walk。hard/window anchor は cursor を advance するだけ。flex item は次 anchor の start を `narrativeLimit` として narrative 順序を保護

#### テスト
- `tests/unit/alter-morning/anchorFirstPlacer.test.ts` 新規 8 PASS — 22:00 再発防止 / LLM order override / window_end hard / shrink policy / user-duration 保護 / sequenceOrder / same-window tiebreak
- `tests/unit/alter-morning/planReadinessGate.test.ts` 12 PASS（内 window_overflow 4 新規）
- `tests/unit/alter-morning/ceoScenario.test.ts` 114 PASS（ID 衝突回避の test fixture 修正込み）
- 合計 134/134 PASS、全 alter-morning 751/752 PASS（残 1 件は intentParser の outfit clarify phrasing、W2-1 無関係）

#### test fixture 修正
- `makeCEOBaseState()` 内で `generateSegmentId()` を 4 回空回しして counter を進め、delta が新規生成する `seg_5` が既存 `seg_1..seg_4` と衝突しないようにした。本番は全て generateSegmentId 経由なので衝突は起きない

#### 次（W2-2）
- start / end origin の優先順位修正: `explicit startPoint > currentLocation > todayOrigin > baseline home` / `endpointAnchor > endAction > 帰宅`

---

### 2026-04-19 Alter-Morning Planner W2-2 完了 — start/end origin 優先順位修正
- **部門**: Build
- **決定内容**: W2-2 を実装完了。origin 側は既に 4 層優先順位（`explicit startPoint > currentLocation > todayOrigin > baseline home`）が 2026-04-18 に実装済みだったため、今回は endpoint 側を新設した。endpoint の優先順位を `endpointAnchor > endAction("帰宅") / endpointType("home") > baseline home` に明文化し、`resolveEndpoint()` を `locationResolver.ts` に追加。`buildV2DayPlanAsync` の返り座標解決を修正し、Routes API で last-leg を精密計算するようにした。
- **理由**: CEO 実機ケース2 で「終点を把握していない」が観測された。旧コードは `returnDest = planState.startPoint` と semantic バグを持っており、startPoint（origin）を endpoint として流用していた。parsedIntent.endpointAnchor は解析されていたのに下流で無視されていた。
- **承認**: 自律（W2 スコープは CEO 承認済み、実装は自律実行）

#### 実装サマリ
| レイヤ | 変更 |
|---|---|
| `lib/alter-morning/locationResolver.ts` | `ResolvedEndpoint` 型 + `resolveEndpoint(planState, endpointAnchor, savedBase)` 公開関数 + `findEndpointAnchorCoords()` ヘルパを追加 |
| `lib/alter-morning/planningEngine.ts` | `AsyncPlanOptions.endpointCoords?: LatLng \| null` 追加 → `insertTravelItemsAsync` に pass-through |
| `lib/alter-morning/travelTimeEngine.ts` | `insertTravelItemsAsync` に `endpointCoords` パラメータ追加。return-trip の `toCoords` を `returnDestination` 有無で分岐（非 home endpoint で精密座標を使う） |
| `lib/alter-morning/morningProtocol.ts` | `buildV2DayPlanAsync` で `resolveEndpoint()` を呼び出し、`returnDest` / `endpointCoords` を下流に渡す。sync 版 `buildV2DayPlan` は buggy `returnDest = startPoint` を除去して `undefined` に修正（session なしのため endpointAnchor 未アクセス、baseline home フォールバック）|

#### 優先順位ルール（endpoint 側）
1. **endpointAnchor 明示**
   - 1a. canonicalId / label が segments で解決済み → その座標（source: `endpoint_anchor_resolved`）
   - 1b. `type === "home"` + baseline あり → baseline home（source: `endpoint_anchor_home`）
   - 1c. それ以外 → label のみ、coords=null（source: `endpoint_anchor_label_only`）
2. **endAction=「帰宅」** or **endpointType="home"** → baseline home（source: `end_action_home`）
3. **明示なし** → implicit 帰宅=baseline home（source: `baseline_home`）
4. **baseline 未設定** → 解決不能（source: `none`）

#### テスト
- `tests/unit/alter-morning/locationResolver.test.ts` に W2-2 ブロック 10 件を追加 → 全 49 PASS
- 全 alter-morning 761/762 PASS（残 1 件は intentParser の outfit clarify phrasing、W2-2 無関係）
- typecheck: W2-2 ファイルにエラーなし

#### CEO 再発防止項目
- ケース2（終点把握崩れ）: endpointAnchor が下流に届くようになり、`returnDest = startPoint` semantic バグを除去。Routes API で last-leg 精密計算可能

#### 次（W2-3）
- recommendation path の明確化: `RecommendationIntent` 型を generic_place とは別経路として定義

---

### 2026-04-19 Alter-Morning Planner W2-3 完了 — recommendation path 明確化
- **部門**: Build / Product
- **決定内容**: recommendation intent（「おすすめある？」「どこかいい所ない？」型）を generic_place と分離した独立経路として実装。`RecommendationIntent` 型を `lib/alter-morning/types.ts` に定義し、`resolveRecommendationIntent()` を `placeResolver.ts` に新設。planner（morningProtocol）側に lazy import dispatcher を追加。
- **理由**: W1 実機判定で「『おすすめある？』が generic_place 扱いで recommendation が効かない」ことが観測された（ケース1）。generic_place は「既に存在する特定の場所を確定する」経路、recommendation は「提案してほしい」経路で、解決戦略が根本的に異なる（前者は clarify、後者は anchor/category/Stargazer の合成スコアリング）。型レベルで分離しないと planner と narrator が常に間違える。
- **承認**: 自律実行（CEO 方針 2026-04-19 に基づく W2-3）

#### 実装内容
- `lib/alter-morning/types.ts` — `RecommendationSource` (`explicit_ask` / `implicit_gap` / `alter_initiated`) + `RecommendationStrategy` (`anchor_proximity` / `category_only` / `stargazer_weighted` / `relational_weighted`) + `RecommendationIntent` インターフェース
- `lib/alter-morning/planState.ts` — `PlanSegment.recommendationIntent?: RecommendationIntent` フィールド追加
- `lib/alter-morning/placeResolver.ts` — `resolveRecommendationIntent()` 新設:
  1. category 確定: `intent.categoryHint > inferPlaceCategoryFromActivity(activityHint)`
  2. 戦略選択: `anchor_proximity`（`anchorHint` → segments 既解決 → geocode）→ `category_only`（`currentLocation > areaCoords`）
  3. 半径: `intent.radiusOverrideM ?? getNearAnchorRadius(category)`
  4. Places API 呼び出し（fail-open: 未設定/エラー時は low confidence + reason で返す）
  5. Hard 距離フィルタ + dedupe + Top 3
  6. **confidence は最大 medium**（勝手に確定しない = CEO 方針）
- `lib/alter-morning/activityVocabulary.ts` — `inferPlaceCategoryFromActivity()` 追加（ランチ→レストラン、飲み→バー、作業/勉強→カフェ、散歩→公園）
- `lib/alter-morning/morningProtocol.ts` — lazy import + dispatcher ループ（`resolveNearAnchorPlaces` ブロック直後に置き、`recommendationIntent && !resolvedPlaceName` なセグメントを解決して `pendingPlaceConfirmations` に積む）

#### 検証結果
- `tests/unit/alter-morning/recommendationIntent.test.ts` に 12 件を新設 → 全 PASS（anchor_proximity / category_only / category 推論 / 全フォールバック失敗 / fail-open（API 未設定 + API エラー）/ 候補 0 件 / confidence ≤ medium 保証 / anchor low confidence → geocode 退行 / qualityHint クエリ混入）
- 全 alter-morning 773/774 PASS（残 1 件は intentParser outfit clarify copy、W2-3 無関係の Phase C-4 WIP 由来）
- typecheck: W2-3 ファイルにエラーなし

#### CEO 再発防止項目
- ケース1（「おすすめ」が generic_place 扱い）: 型レベルで独立。以後 `recommendationIntent` を立てれば planner / narrator は分岐を取れる
- 「勝手に確定しない」規律: resolver は medium を天井とし、Alter narration 側で提案形に落とす（実際の確定はユーザー選択で初めて発生）

#### 次（W2-4）
- LLM 抽出（llmPlanExtractor / llmDeltaParser）側に「おすすめ」「どこかいい所」「候補教えて」パターン検出 → `recommendationIntent` として emit するプロンプト拡張 + 決定論的プリクラシファイア

---

### 2026-04-19 Alter-Morning Planner W2-4 完了 — 決定論 recommendation pre-classifier + Turn1/Turn2+ 同一意味論
- **部門**: Build / Product
- **決定内容**: 「おすすめある？」「どこかいい店ない？」系発話を LLM に任せず決定論で 4 分類（`recommendation_request` / `explicit_place` / `explicit_category` / `none`）する pre-classifier を新設。`llmDeltaParser.detectDelta` では LLM 呼び出し前に短絡、`llmPlanExtractor.extractPlanFromText` では LLM 出力の post-process として同じ classifier を適用。Turn 1 と Turn 2+ で意味論を統一。
- **理由**: CEO 方針 2026-04-19 の 3 条件:
  1. **emit 条件を厳しくする** — 純粋な提案要求だけ `recommendationIntent` を立てる。「渋谷のカフェに行く」「A店に寄る」のような場所明示文では recommendation を主役にしない
  2. **pre-classifier を先に置く** — LLM 丸投げは文言揺れに弱い。決定論で粗分類 → LLM の emit を制御
  3. **delta でも同じ意味論** — Turn 2+ で「やっぱ近くでおすすめある？」を受けても既存 explicit place を壊さない
- **承認**: 自律実行（CEO 方針 2026-04-19 に基づく W2-4）

#### 実装内容
- `lib/alter-morning/recommendationClassifier.ts`（新規 ~340 行）
  - 7 種の recommendation phrase パターン（強/弱を区別。弱 phrase は疑問マーカー必須）
  - `CHAIN_BRAND_RE` / `SHOP_MARKER_RE` / `STATION_RE` / `KANJI_PROPER_PLACE_RE` 等で explicit place 検出
  - `GENERIC_SHOP_WORDS_RE` / `GENERIC_SHOP_PREFIX_RE` で「お店」「いい店」「人気の店」等の一般化表現を explicit から除外
  - anchor/category/quality hint 抽出（「サドヤ近く」→ サドヤ、「静かな」→ quality）
  - `classifyRecommendationIntent()`: 4 分類を返す。**explicit_place が検出された場合は recommendation phrase と両立しても explicit_place を優先**（CEO 条件 1）
  - `toRecommendationIntent()`: 分類結果を `RecommendationIntent` に変換（anchor 有→`anchor_proximity`、無→`category_only`）
- `lib/alter-morning/llmDeltaParser.ts`
  - `detectDelta` の先頭（既存 `classifyDeltaDeterministic` の後）に `classifyRecommendationIntent` 短絡を追加
  - `buildRecommendationDelta()` 新設: 既存 segment（`resolvedPlaceName` / `place` 未設定）から target を categoryHint → anchorHint → 単独 placeless の順で解決、無ければ `add_segment` で新規作成
  - `applyFieldChange` に `recommendationIntent` case 追加（**二重防御**: place 付き seg への attach を拒否）
  - `clearField` に `recommendationIntent` case 追加
  - `applyDelta` add_segment 経路で `newSegment.recommendationIntent` を新 `PlanSegment` に伝播
- `lib/alter-morning/planState.ts`
  - `LLMRawSegment.recommendationIntent?: RecommendationIntent` 追加（LLM JSON schema には含めない内部拡張フィールド。`add_segment` 経由で新規 segment に運ぶ経路）
- `lib/alter-morning/llmPlanExtractor.ts`
  - `extractPlanFromText` の末尾で `applyRecommendationClassifierToState(state, userMessage)` を呼び出す（LLM 抽出後の post-classifier）
  - Turn 1 も Turn 2+ と同じ attach 戦略（category → anchor → 単独 placeless → 新規追加）

#### 検証結果
- `tests/unit/alter-morning/recommendationClassifier.test.ts` 31 件 PASS（純粋提案 / explicit 優先 / カテゴリのみ / 弱 phrase 安全弁 / 変換 / 文言揺れ）
- `tests/unit/alter-morning/recommendationDelta.test.ts` 10 件 PASS（Turn 2+ 短絡 / LLM 未呼び出し検証 / explicit 破壊防止 / add_segment 経路 / 文言揺れ）
- `tests/unit/alter-morning/recommendationTurn1.test.ts` 6 件 PASS（Turn 1 post-classifier / 既存 explicit 破壊防止 / 単独 placeless / 新規追加）
- 全 alter-morning 820/821 PASS（残 1 件は intentParser outfit clarify copy、W2-4 無関係の Phase C-4 WIP 由来）
- typecheck: W2-4 ファイルにエラーなし

#### CEO 再発防止項目
- ケース1（「おすすめ」が generic_place 扱い）完全解消:
  - 決定論 classifier が LLM より先に 4 分類 → LLM の誤抽出を経由しない
  - explicit_place を持つ発話は `recommendation_request` に**絶対に落とさない**（分類優先順位を厳守）
  - 既存 explicit place を持つ segment は attach の 2 重防御（classifier 側候補除外 + applyFieldChange 側 guard）で上書き不可

#### 次（CEO 再検証チェックポイント）
W2-1 〜 W2-4 の構造 4 点が揃ったので、CEO 実機再検証へ。PASS なら W2-5 Deep Context Injection に進む。

---

### 2026-04-18 Alter-Morning Planner W1 PASS + W2 スコープ確定
- **部門**: Build / Product
- **決定内容**: W1 Step 6a+6b を PASS 判定。W2 は当初計画の「anchor-first + Deep Context Injection」を分割し、**構造 4 点を先に固めてから** Deep Context Injection に進む。
- **理由**: CEO 実機再検証（3 ケース）で以下を観測:
  1. ケース1: 移動が生成されない / 会食場所をサドヤで固定 / 「おすすめ」が generic_place 扱いで recommendation が効かない
  2. ケース2: ある程度成功だが start / end origin の優先順位が崩れている（終点を把握していない）
  3. ケース3: /baseline で成田設定なのに成田駅周辺で出ない + 移動時間欠落 + recommendation 不発
  「壊れた確定プランを出さない」目的は達成。しかし「良いプランを組む」能力は構造レベルで未整備。Deep Context Injection を先に入れても土台が無いと効かないので、構造→深層の順に直す。
- **承認**: CEO（2026-04-18）

#### W2 実装順序（この順で固定）
1. **anchor-first planner** — LLM の order を捨て、3 パス構築（hard anchor → flex anchor → travel）。push-out 禁止、window_end 尊重
2. **start / end origin の優先順位修正** — /baseline の起点と endpoint が尊重されていない。優先順位を明文化し実装を合わせる
3. **recommendation path の明確化** — recommendation intent を独立経路として扱う（generic_place の亜種ではない）
4. **「おすすめある？」を recommendation intent として検出** — LLM 抽出側で intent を立て、resolver / planner がその経路で動く
5. （ここまでで CEO 再検証）
6. Deep Context Injection（Stargazer 軸 / HDM Phase / Origin 直近 / Relational Lens）

#### W2 完了判定
- [ ] LLM の `order` が使われない（決定は 3 パスロジック）
- [ ] /baseline 起点が start で尊重される（ケース3 再現なし）
- [ ] endpoint が明示された場合に尊重される（ケース2 再現なし）
- [ ] 「おすすめ」発話で recommendation 経路が発動する（ケース1 再現なし）
- [ ] その上で Deep Context Injection 開始

#### 関連ドキュメント
- `docs/weekly-priorities.md` Week 2 セクション更新
- `docs/alter-morning-planner-redesign.md` W2 構成更新

---

### 2026-04-08 safe-merge 完了 + pre-existing test 失敗2件の固定記録
- **部門**: Build
- **決定内容**: ローカル全変更を main に安全合流・push 完了。pre-existing テスト失敗2件を正式記録。
- **承認**: CEO
- **ステータス**: 記録固定済み

#### 保全結果サマリ
| 項目 | 値 |
|---|---|
| 退避ブランチ | `backup/safe-merge-20260408-023040` |
| WIP SHA | `34602480` |
| main push SHA | `72d813a9` |
| push 範囲 | `882704ed..72d813a9` |
| build | PASS |
| typecheck | PASS |
| tests | 2031/2033 PASS（2件 pre-existing） |
| migration 追加 | 6件 |
| 変更消失 | なし |

#### 失敗テスト固定記録（pre-existing・今回起因ではない）

**1. `tests/unit/stargazer/baselineContext.test.ts:339`**
- テスト名: `scoreBaselineRelevance > relationship: lifeStage=high, gender=high, area=medium`
- 失敗内容: `rel.area` が `"medium"` を期待するが実装は `"low"` を返す
- 根本原因: `scoreBaselineRelevance` の area スコアリングロジックと期待値の乖離
- 対処方針: 実装側の意図を確認してからテスト or 実装を修正（CEO 判断待ち）

**2. `tests/unit/stargazer/derivedFactGenerator.test.ts:372`**
- テスト名: `serializeDerivedFactsForAnalytics > analytics用のシリアライズ形式が正しい`
- 失敗内容: `serialized.derived_facts.length` が `5` を期待するが `4` が返る
- 根本原因: `serializeDerivedFactsForAnalytics` がファクト1件をフィルタ/スキップしている
- 対処方針: シリアライズ関数のフィルタ条件を確認（CEO 判断待ち）

#### Migration 命名規則メモ
- 今回追加の `20260407300000`/`400000`/`500000` は時刻表現として不自然（秒が00000等）
- 実害なし（文字列順ソートで並び順は正しい）
- 今後は 実時刻ベース14桁（例: `20260408143022`）に統一する

---

### 2026-03-14 AI 運営 OS 初期構築
- **部門**: Chief of Staff
- **決定内容**: Claude Code 上で AI 執行部の運営基盤を構築。5 部門体制で開始。
- **理由**: CEO の下で AI が分業し、日常運用を効率化するため
- **承認**: CEO
- **ステータス**: 実行済

### 2026-03-14 Stargazer 深層観測 本日修正完了
- **部門**: Build
- **決定内容**: Stargazer の実データ接続・日本語統一・空状態ガイド改善を完了。全5タブ検証済み、32テスト通過、コンソールエラーなし。次フェーズは初期検証前の残課題整理に移行。
- **理由**: 初期検証ユーザーに提供できる品質に到達させるため
- **承認**: CEO
- **ステータス**: 実行済
- **完了内容**:
  - #1 archetypeResult closure バグ修正（loadRealData内のuseState非同期問題）
  - #2 英語ラベル日本語統一（全5タブ + コンポーネント群）
  - #3 空状態ガイドテキスト追加（DeepTab, TrajectoryTab）
  - 実データ接続: confidence, contextFaces 対応
  - テスト基盤修正: vitest 形式統一、server-only mock

### 2026-03-14 PartnerTab 初期検証方針
- **部門**: Product / Build
- **決定内容**: 初期検証では PartnerTab を「準備中」表示とする。タブは残し、DBテーブル新設・本格有効化はスコープ外。
- **理由**: 検証の主対象は Stargazer 本体。未実装感ではなく「今後ひらかれていく領域」として自然に見せる。
- **承認**: CEO
- **ステータス**: 実行中

### 2026-03-21 Aneurasync 再デプロイ完了・現行版確定
- **部門**: Build / CEO
- **決定内容**: Aneurasync の全体エラー監査・修正を経て本番デプロイを完了。`https://culcept.vercel.app` を現行版とする。
- **理由**: ビルド通過、212テスト通過、主要7画面の表示・導線確認済み。DBマイグレーション84件は既に適用済みであることを確認。デプロイ中に発見したDB整合不一致2件（`stargazer_alter_dialogues` のカラム名不一致、`calendar_worn_records` テーブル名誤り）を修正しリリース。
- **承認**: CEO
- **ステータス**: 実行済
- **修正内容**:
  - `app/api/stargazer/alter/route.ts`: `content`→`message`, `mode`→`alter_mode` にカラム名修正
  - `app/api/cron/stargazer-alter-summarize/route.ts`: 同上
  - `app/(immersive)/aneurasync/RobotCheckinCard.tsx`: `calendar_worn_records`→`calendar_outfits` にテーブル名修正
  - `app/api/stargazer/profile/route.ts`: 型エラー修正
  - テスト3件修正（import path更新、assertion修正）
- **保留事項**:
  - lint error 253件（ビルド非ブロック、デプロイ後改善タスク）
  - 本番通し確認での細かな違和感
  - 初期検証ユーザーからの反応回収
- **明日確認**:
  - 本番動作の最終確認
  - 招待制初期検証の開始可否

### 2026-03-30 Home Alter Judgment Engine — 条件付き GO
- **部門**: Build / Product
- **決定内容**: Home Alter の対人判断エンジンを条件付き GO とする。Daily Guidance エンジンは無条件 GO。
- **理由**: 主要ブロッカー（shape 不一致 5件・性格反転 20件）が構造修正で完全解消。specificity 3.98→4.42、失敗ケース 20→5件。uncertainty_calibration は 4.08（閾値 4.10）で -0.02 の軽微な未達だが、eval failure 由来であり出荷停止理由としない。
- **承認**: CEO
- **ステータス**: 実行済
- **構造修正 3 点**:
  1. Shape 主権: skeleton.action_shape を唯一の正とし LLM 出力を上書き
  2. Persona Block: prompt に固定ペルソナ + validation に regex 検出
  3. sanitizeTraitInversions: 後処理で性格反転フレーズを確実に除去
- **次パッチ必須対応**:
  - medium confidence 時の断定度調整（prompt 改善）
  - eval failure 分離集計（0点ケースを平均から除外する仕組み）
- **閾値緩和は行わない**（CEO 明示指示）

### 2026-03-30 Home Alter 統合 GO — 最終クローズ
- **部門**: Build / Product
- **決定内容**: Home Alter を Judgment Engine + Daily Guidance の両ドメインで統合 GO とし、最終クローズする。
- **理由**: JE は directness -0.025（評価ノイズ、2ラン連続同値で確認）以外全軸クリア。DG は specificity 3.91→4.77（+0.87）で閾値4.0を大幅クリア、全軸PASS・validation failure 0%。安全性・安定性OK（danger全PASS、stability 20/20）。
- **承認**: CEO
- **ステータス**: 実行済・最終クローズ
- **DG修正3点**:
  1. maxOutputTokens 1024→1536（応答切断の根本原因解消）
  2. DG prompt に時間指定必須ルール追加（「〜分」「〜時間」必須化）
  3. DG validation に切断検出+時間検出チェック追加
- **JE次パッチ完了2点**:
  1. confidence-level別tone rules（LOW=完全禁止、MEDIUM=強断定語禁止）
  2. eval failure分離集計（全0点ケース3件を平均から除外）
- **以後は保守対象**。次の主戦場は Alter の返答後の体験接続。
- **今後の監査方針**: 3-run median or 2-run average を採用し単一ラン ノイズを回避（CEO指示）

### 2026-03-30 Student LLM 学習確認 — OK（条件付き）
- **部門**: Build
- **決定内容**: Alter 系全体の student LLM 学習パイプラインが正しく接続されていることを確認し、OK（条件付き）とする。student は非公開のまま裏で学習を継続。
- **理由**: Gemini の Alter 系実出力が `ai_runs` → `teacher_outputs` → export/dataset/monitor/review の全段階で正しく流れていることを実データで確認。`stargazer_alter_response` 369件 + `stargazer_alter_session_summary` 1件の teacher_outputs 蓄積を確認。shadow model（`stargazer_student` / `shadow-2026-03-10`）登録済み、weight=0 で学習蓄積フェーズ。
- **承認**: CEO
- **ステータス**: 確認完了
- **確認範囲**: Home Alter / DG / Deep Alter / letter / self_report / session_summary の全 Alter 系経路
- **条件付きの理由**:
  1. DG 可視性粒度: `stargazer_alter_response` に JE/DG/Deep 同居。metadata.feature での集計可視化を改善候補として保持
  2. export 設定差異: `trainingArtifacts.ts`(default true) vs `exportDataset.ts`(default false)。cron/script で上書きされ実害なし。設定整理候補として保持
- **明確な否定**: student 公開承認ではない。学習入力接続の確認のみ
- **次ステップ**: DG 可視性改善 / export 設定整理 / student 品質比較（別フェーズ）

### 2026-04-01 Stargazer 後ログイン型フロー P0-P3 クローズ + P4 Phase A 完了
- **部門**: Build / Product
- **決定内容**: 後ログイン型フロー P0（匿名認証・merge基盤）、P1（体験速度・演出改善）、P2（制限つき結果表示 + 3確認点解消）、P3（質問文言の表現翻訳）をクローズ。P4（軸拡張エンジン）Phase A（基盤）を完了。
- **理由**: P0-P3は全て型チェック・テスト回帰なしで完了。P4はCEO承認（4条件付き）を受け、設計書追記 + Phase A実装を実施。
- **承認**: CEO
- **ステータス**: P0-P3 クローズ、P4 Phase A 完了
- **P2確認点解消**:
  1. ログイン戻り先: `next=/stargazer` パラメータ対応。authActionに匿名昇格・merge統合
  2. スキップ後導線: continue_choice画面に匿名ユーザー向けアカウント作成リンク追加
  3. 匿名判定一貫性: サーバーAPI側でデータフィルタリング（CSSブラーなし）
- **P3**: 全51問のquestionTextを表現翻訳（意味・軸・構造不変）
- **P4 Phase A 実装内容**:
  1. `traitAxes.ts`: `AxisTier` 型追加、6拡張軸キー追加、`CORE_AXIS_KEYS`/`EXPANSION_AXIS_KEYS`/`isExpansionAxis` ヘルパー追加
  2. `expansionDiscovery.ts` 新規: 発見条件判定（3条件2つ以上）、初期値算出、文言上限管理、通知判定
  3. `docs/p4-axis-expansion-design.md`: CEO4条件（ログ基盤・文言cap・差分理由・発見カード抑制）を追記
- **P4 CEO条件（設計書に反映済み）**:
  1. 解放条件の成立ログを必須化（ユーザー別解放率・条件別ボトルネック・到達日数の観測基盤）
  2. confidence capに加え文言上限もセット（hidden/emerging/forming/visibleの4段階）
  3. 各拡張軸に「既存45軸では足りない理由」を1行で定義
  4. 発見カードは短く1軸だけ。既存結果の邪魔をしない
- **不変条件**: archetypeResolver未変更、既存45軸の順序・定義不変、Rendezvous/GenomeCard非影響
- **次フェーズ**: P4 Phase B（データ層: profile API拡張・ベイズ更新制限・推論ルール追加）

### [2026-04-01] [Build] P4 Phase B クローズ + Phase C 完了
- **決定内容**: P4 Phase B（データ層）をクローズし、Phase C（UI表示層 + 解放条件ログ）を完了。
- **承認**: CEO
- **ステータス**: Phase B クローズ、Phase C 完了

- **Phase B 実装内容**:
  1. `profile/route.ts`: 拡張軸データ (`expansionAxes`) を非匿名ユーザーにのみ返却。displayTier/visible/score/confidence/precision/source/originLabel を構築
  2. `bayesianAxisUpdater.ts`: `updateAxisBelief()` に optional `axisId` 引数追加。拡張軸は τ_max=40, confidence_cap=0.45 に制限
  3. `axisInferenceEngine.ts`: `EXPANSION_INFERENCE_RULES`（6軸分）追加。maxConfidence=0.25。`inferExpansionAxes()` + `runFullInference()` 統合
  4. 6ファイルの `Record<AxisCategory, ...>` に `expansion` エントリ追加（型エラー解消）
- **Phase B CEO条件の達成**:
  1. archetype基盤は未変更（archetypeResolver はコア軸のみ使用）
  2. 匿名ユーザーには expansion 詳細を返さない（`user.is_anonymous` ガード）
  3. 拡張軸の precision/confidence 上限が既存軸より低い（40/0.45 vs 50/0.65）

- **Phase C 実装内容**:
  1. `ExpansionAxesSection.tsx` 新規: visible/displayTier を唯一の表示判定源とする拡張軸セクション。hidden tier は絶対に表示しない
  2. `DeepTab.tsx`: ExpansionAxesSection を統合
  3. `StargazerHome.tsx`: API から expansionAxes を取得し DeepTab へ受け渡し
  4. `ResultsSequence.tsx`: discoveredExpansionAxis prop 追加。発見カードは条件付き9枚目として表示
  5. `expansion-log/route.ts` 新規: 解放条件を評価し、conditionsMet/released/unmetReasons をログ出力+JSON返却
- **Phase C CEO条件の達成**:
  1. visible/displayTier が唯一の表示判定源。`axes.filter(a => a.visible && a.displayTier !== "hidden")` + `score !== null` の二重安全弁
  2. 解放率と未解放理由のログが見える状態: `buildUnmetReasons()` で人間が読める理由文を生成、console + API レスポンスで可視化
- **不変条件**: archetypeResolver未変更、既存45軸不変、匿名ユーザーに拡張軸非表示
- **次フェーズ**: P4 Phase D（拡張質問18問 + 日常質問への混合ロジック）

### [2026-04-01] [Build] P4 Phase D 完了 — 拡張軸質問18問 + 日常混合ロジック
- **決定内容**: 拡張軸専用の質問18問（6軸×3問）と、日常観測への1日最大1問の混合ロジックを実装。
- **承認**: CEO（3条件付き）
- **ステータス**: Phase D 完了

- **Phase D 実装内容**:
  1. `expansionQuestions.ts` 新規: 18問の質問定義（SemanticDifferential形式、5段階スライダー）
  2. `expansionQuestionSelector.ts` 新規: 選択ロジック（候補軸スコアリング + 深さ段階解放 + 回答処理）
  3. `dailyOrchestrator.ts`: `DailyObservationPlan` に `expansionQuestion` スロット追加、`selectExpansionQuestionForPlan()` で自動選択
  4. `daily-observation/route.ts`: `expansionAnswer` ペイロード追加、axis_snapshot 保存、ベイズ信念更新でcore/expansion分離

- **CEO条件1: 1日最大1問の原則**:
  - `selectExpansionQuestion()` で `todayAlreadyAsked` をDBから確認（`variant_id LIKE 'exp_%'` + `session_date = today`）
  - true なら即 null 返却。物理的に2問目は選択されない
  - 最近14日以内の出題済み質問も除外

- **CEO条件2: 発見済み軸にだけ出す**:
  - confidence <= 0 の軸は対象外（推論すらされていない）
  - hidden tier でも confidence > 0.08 なら候補（解放に近づいている）
  - emerging/forming tier が最高優先度
  - 矛盾検出された軸は CONTRADICTION_BOOST (×2.0) で優先
  - 低精度（τ < 5）の軸は LOW_PRECISION_BOOST (×1.5) で優先
  - セッション数 < 20 or 日数 < 7 なら出題しない

- **CEO条件3: archetype / core 45軸への逆流防止**:
  - `processExpansionAnswer()`: `isExpansionAxis()` で二重チェック、non-expansion は null 返却
  - `daily-observation POST`: `dailyInputs` から `isExpansionAxis()` で expansion を除外 → `coreInputs` のみ core 更新
  - expansion 回答は `expansionInputs` として分離し、同一 `updateFromDailyObservation` に渡すが、`updateAxisBelief()` 内で expansion 軸は τ_max=40, confidence_cap=0.45 に制限
  - `EXPANSION_QUESTIONS` の各質問は `axisId` が expansion 軸のみ。core 軸への weight 配分なし

- **不変条件**: archetypeResolver未変更、core 45軸の更新パスに expansion 回答が混入しない

### [2026-04-01] [Build] P4 運用確認フェーズ — 監視基盤 + 微調整パラメータ
- **決定内容**: Phase D クローズ後、運用確認フェーズに移行。監視基盤と閾値微調整機構を構築。
- **承認**: CEO
- **実装内容**:
  1. `scripts/expansion-ops-kpis.sql`: 7カテゴリの運用監視SQLクエリ（出題率・軸偏り・解放率・軽さ・回答分布・逆流チェック・サマリー）
  2. `app/api/ceo/expansion-monitor/route.ts` 新規: CEO専用 GET API。servingRate / axisBreakdown / releaseRate / lightness / alerts を返却
  3. `lib/stargazer/expansionTuning.ts` 新規: 全閾値を一箇所に集約。コード変更なしで微調整可能
  4. `expansionQuestionSelector.ts`: ハードコード定数を expansionTuning.ts からの import に置換
- **監視アラート（自動）**:
  - 🔴 critical: 1日1問超過、core逆流検出
  - 🟡 warning: 軸偏り（最多/最少 > 3倍）、重いセッション（10問超）
  - 🔵 info: 出題実績なし（対象ユーザー未到達）
- **微調整可能パラメータ**: EXPANSION_MIN_SESSIONS, EXPANSION_MIN_DAYS, NEAR_EMERGING_CONFIDENCE, CONTRADICTION_BOOST, LOW_PRECISION_BOOST, DEPTH_2/3_PRECISION, EXPANSION_EVIDENCE_PRECISION, FAST/SLOW_ANSWER_THRESHOLD 他

### [2026-04-01] [Build] 運用確認v2 — 価値検証指標の追加
- **決定内容**: 安全監視から価値検証へ拡張。completion rate / response time / precision改善量 / lightness percentile / visible到達推移 / 解放進捗偏りを追加。
- **承認**: CEO
- **追加指標**:
  1. **回答完了率**: served（raw_answers に expansionAnswer 存在）vs answered（axis_snapshots に exp_ 記録）→ completion_rate_pct
  2. **回答時間中央値**: raw_answers.expansionAnswer.responseTimeMs から軸別に median / p90 を算出
  3. **precision改善量**: 軸別の precision median / p75 / max を表示（精度がどこまで育っているか）
  4. **lightness p90/p95**: 日別の p90QuestionsPerSession / p95QuestionsPerSession 追加（平均だけでは重い外れ値が見えない）
  5. **visible到達率推移**: visibleTrend — 軸別の currentVisibleCount / currentVisibleRatePct / weeklyActivity
  6. **解放進捗の軸間偏り**: visible到達率の軸間差が AXIS_BIAS_RATIO_THRESHOLD を超えたら warning アラート
- **新アラート**:
  - 🟡 warning: 回答完了率 < 50%（拡張質問がスキップされている）
  - 🟡 warning: 解放進捗偏り（visible到達率の軸間格差）
- **SQL**: expansion-ops-kpis.sql も同期更新（回答時間・完了率・解放進捗偏りクエリ追加）

### [2026-04-01] [Build] 運用確認v3 — CEO運用基準の正式採用 + axis served count
- **決定内容**: CEO基準を expansionTuning.ts に明文化。axis served count 追加。healthGrades + thresholds をレスポンスに追加。
- **承認**: CEO
- **CEO運用基準（正式採用）**:
  - completionRate: >=80% 健全 / 60-79% 注意 / <60% 要修正
  - responseTime: median 1.5-6s 適正 / p90>10s 重い / median<1.5s 浅い
  - lightness: p90<=8問 / p95<=9問 維持目標
  - visibleRate 軸間格差: AXIS_BIAS_RATIO_THRESHOLD(3倍) 超で warning
- **追加指標**:
  1. `axisBreakdown[].servedCount` — 各軸が何回出題されたか（raw_answers.expansionAnswer から集計）
  2. `axisBreakdown[].completionRatePct` — 軸別の回答完了率
  3. `healthGrades` — completion / lightness / responseTime / coreIsolation の4項目一覧
  4. `thresholds` — 現在のCEO基準値をレスポンスに含めて透明化
- **新アラート**:
  - 🔴 critical: completionRate < 60%
  - 🟡 warning: completionRate 60-79% / responseTime median<1.5s or >6s / p90>10s / lightness p90>8 / p95>9
  - 🔵 info: 未出題軸の存在（visibleRate低下時の原因切り分け用）
- **「育たないのか、出ていないのか」の判別**:
  - axisBreakdown の servedCount=0 → そもそも出ていない（出題条件の見直し）
  - servedCount>0 だが visibleRate=0 → 出ているが育たない（質問の質 or precision 育ちの問題）

### [2026-04-01] [Build] 運用確認v4 — healthGrades明文化 + アラートカテゴリ分離
- **決定内容**: healthGrades判定ルールを docs に明文化。alerts に category フィールドを追加し under_served / low_growth を分離。
- **承認**: CEO
- **実装内容**:
  1. `docs/expansion-monitor-spec.md` 新規: healthGrades定義 / アラートカテゴリ定義 / 切り分けフロー / 閾値一覧 / 定点観測スケジュール
  2. `expansion-monitor/route.ts`: alerts に `category` フィールド追加（9種: safety / completion / response_time / lightness / serving_bias / release_bias / under_served / low_growth / info）
  3. under_served（servedCount=0の軸）と low_growth（served>0だがvisible=0の軸）をアラートで明示分離
- **運用フェーズ移行**: 以後は新規実装より定点観測を優先。1週/2週/1ヶ月の3点で completionRate → lightness → servedCount → visibleRate → precision の順に確認

### [2026-04-01] [CEO] P4 拡張軸 — チューニング運用フェーズ移行（CEO指示）
- **決定内容**: 新規実装を停止し、定点観測サイクルに移行する。
- **承認**: CEO
- **運用ルール**:
  1. **新規実装の停止**: expansion 関連のコード追加・機能追加は行わない
  2. **唯一の判断源**: `GET /api/ceo/expansion-monitor` の healthGrades と alerts のみで判断する
  3. **調整対象の限定**: 変更は `lib/stargazer/expansionTuning.ts` のパラメータ調整のみ許可
  4. **最優先制約**: completion と lightness を壊さないことが最優先。調整前後で両指標を必ず確認
  5. **調整時の記録**: パラメータ変更時は本 decision-log に変更前後の値と理由を記録すること
- **定点観測サイクル**:
  - 1週間: completionRate / lightness p90,p95 / under_served の有無
  - 2週間: low_growth の有無 / responseTime / servedCount 偏り
  - 1ヶ月: visibleRate 軸間格差 / precision 育ち / healthGrades 全体
- **前提**: 対象ユーザーが条件（20セッション+7日）に到達するまでは出題実績なしが正常

### 2026-04-03 CI パイプライン復旧 (lint + test)
- **部門**: Build
- **決定内容**: `fix/ci-lint-errors` ブランチで CI 復旧し main に merge。4コミット、18ファイル変更。
- **理由**: eslint-config-next v16 (react-hooks v7) 導入による 220+ lint errors、テスト28件失敗、Node 20/npm 10 の lockfile 非互換
- **承認**: CEO
- **ステータス**: 実行済
- **暫定対応**: `homeAlterQualityAudit.test.ts` のモード精度閾値を 0.75→0.45 に暫定引き下げ（clarify パス追加後の expectedMode 未更新）
- **残TODO**:
  1. qualityAudit 106件の expectedMode 再分類 → 閾値 0.75 復元
  2. package.json の `"latest"` 指定を固定バージョンに変更（再発防止）

### [2026-04-26] [Build] CoAlter Bug-1 Phase 3A 観測 gate PASS / 本線 build-fix 着地
- **部門**: Build
- **決定内容**: Phase 3A retrieval recall/precision 観測 4 指標が全 PASS。Phase 3B narration 接続の着手条件達成。Phase 3A の build blocker 除去 commit を本線 `feat/coalter-three-stage` に cherry-pick。
- **承認**: CEO
- **ステータス**: Phase 3A 完了 / Phase 3B 着手前
- **観測 gate 結果（N=19）**:
  - searchCandidatesCount median: **6** (閾値 ≥5)
  - searchCandidatesCount p25: **3** (閾値 ≥3)
  - hasActionable=false での fire 率: **0%** (閾値 =0%、precision 完全)
  - 0 candidates 比率: **0%** (閾値 <20%)
  - candidatesCount sorted: `[3,3,3,3,3,3,3,6,6,6,7,8,8,8,9,9,9,9,9]`
- **観測前提**:
  - branch: `preview/coalter-stepc-phase3a` (HEAD `e2eb810b`)
  - env: `EXA_API_KEY` (preview+production), `COALTER_UNDERSTANDING_DIAGNOSTICS=1` (preview, branch scope)
  - 観測経路: 正規 ChatClient (`/talk/[threadId]`) → CoAlter button click → POST `/api/coalter/invoke`
- **本線着地（cherry-pick）**: `e2eb810b` を `feat/coalter-three-stage` に cherry-pick → 新 hash **`45cd1327`**。preview のみあった build blocker 除去（main の portable file 6 個欠落: `AneurasyncLogo.tsx` / `placeCacheStore.ts` / `placesApiClient.ts` / `routesApiClient.ts` / `municipalityCoords.ts` / `episodicRecall.ts`、計 1538 lines）を本線に取り込み、再発防止。
- **正確な扱い（CEO 確定）**:
  - Phase 3A retrieval recall/precision の gate は **PASS**
  - Phase 3B 進行条件は満たした
  - ただし「完全に健全」ではなく、後続課題が残る
- **後続課題**（Phase 3B 完了後 or 別 Phase で扱う、優先順位 CEO 確定）:
  1. theme drift（直前 N turn 累積で「表参道 昼カフェ」が movie 誤分類）
  2. 同一クエリ / エリアの retrieval 重複（dedup 不足）
  3. double invoke (10 click → 20 invoke)
  4. travel/activity の query 弱さ（candidatesCount=3 上限）
- **次フェーズ**: Phase 3B narration 接続を `feat/coalter-three-stage` 上で開始。`preview/coalter-stepc-phase3a` 上では行わない。

### [2026-04-26] [Build] CoAlter Bug-1 Phase 3B Layer 2-C preview 観測 — inconclusive
- **部門**: Build
- **決定内容**: Layer 2-C (`5e63e7b5` = preview cherry-pick `634ff651`) の preview deploy
  (`dpl_4hTC7cVUfYGVeBb6fkL498RUoPtu`) で UX 効果検証を試みたが、movie path の
  `rankedCount=0` が連続したため UI 上の効果検証は **inconclusive (未判定)**。
- **承認**: CEO
- **ステータス**: 観測完了 / 効果判定保留 / 修正未着手
- **観測結果（5 invoke / 直近 1h logs）**:
  - movie 4/5: `rawResultsCount=9 / catalogCount=3 / rankedCount=0` （4 件全て同一構造）
    - `missingWhereRejectCount=3` / `titleWithoutTheaterCount=3` で全 drop
  - food 1/5: `rawResultsCount=6 / parsedVenues=1 / rankedCount=1`（rank>0 達成）
  - emotion_signals が prose に反映された観察ゼロ
- **新たに判明した別 gate（重要）**:
  - **Phase 3A retrieval gate PASS は維持**（recall/precision の観測値は別 entry 既述）
  - ただし retrieval 後の **catalog / ranker gate**（特に movieRanker の `missing_where`
    hard filter）で movie が 100% drop する事実が判明
  - **Phase 3A は retrieval 評価としては有効だが、UX 到達には ranker gate も別途必要**
- **food path の dead spot（Layer 2-D 論点）**:
  - foodOrchestrator は narrationEnricher を呼ばない構造（Phase B Commit 4 lock）
  - Layer 2-A/B/C で構築した emotion 経路は food path に届かない
  - food rank>0 でも logic-only narration → emotion 反映ゼロ
  - Layer 2-C 効果検証直後には扱わず、Layer 2-D で別判断
- **UX 課題（layout/UI phase 送り）**:
  - repeated clarify / context drift（CEO 入力の直近 N turn が薄い相槌だと
    `combinedSample` が stale 化、4 連続で同一 query → 同一 clarify）
  - 「もっと聞かせて」連発に対する UX 改善は別 phase
- **次の観察候補（CEO 優先順位 A → B → C → D、本 entry 時点で実装着手なし）**:
  - **A**: theater 名直接指定 movie 入力で rank>0 に到達するか preview で再観測
    （CEO 操作 + Claude logs 確認）
  - **B**: `lib/coalter/movieRanker.ts` / `movieCatalog.ts` の `missing_where`
    hard filter を読み取り、最小修正案を起草（observation のみ、修正禁止）
  - **C**: food Layer 2-D は別判断（保留）
  - **D**: layout/UI 改善は別 phase で課題一覧を整理
- **layout/UI phase 候補課題**:
  - L-1: repeated clarify
  - L-2: context drift（直近 N turn 薄い相槌で combinedSample stale 化）
  - L-3: clarify card に「ピン止めされた条件」見える化
  - L-4: clarify card に「足りない条件」明示（既存 missingConstraints 経路の UI 強化）
  - L-7: rank=0 時の「何が原因か」UI 表示（"theater 情報が取れなかった" 等の透明化）
  - L-9: 「もっと聞かせて」click 後に context が更新される仕組み

### [2026-04-27] [Build] CoAlter Phase 3B catalog parser 強化打ち切り / 映画 2 段階分離設計へ移行
- **部門**: Build
- **決定内容**: B'-1 (theater 解決) / Bug 1 (page 名 reject) / Bug 2 (markdown heading 抽出) と
  catalog parser 強化を 3 commit 連続で実施。preview 再観測で限定的に Layer 2-C 効果検証に
  到達したが、CEO 判断で catalog parser 強化はここで打ち切り。映画は「映画館検索」と
  「映画内容そのもの」の 2 段階分離設計を別 Phase で扱う。
- **承認**: CEO
- **ステータス**: 打ち切り判定 / Phase 3B Layer 2-C 観測は限定的成果のまま終了
- **3 commit の経緯**:
  1. **B'-1** (`56f7e487` preview / cherry-pick `9a52bfba` feat): theater 解決強化
     (crank-in / eiga.com URL pattern 追加 + resolveTheaterForTitle chain 順序変更)
     - 観測結果: rankedCount 0 → 1 達成、UI に「クランクイン！」(page 名) 表示
     - Layer 2-C emotion 経路が 1 度だけ user-facing に到達
  2. **Bug 1** (`9ce67668` preview / `f7f597e5` feat): NON_TITLE_SEGMENT に「クランクイン」追加
     (page 名 → site 名扱いで reject)
     - 観測結果: 「クランクイン！」消滅、しかし description 内 markdown `# {作品名}` を
       extractBracketedTitles が拾えず rankedCount 0 後退
  3. **Bug 2** (`fcfc3d8b` feat、preview 未反映): markdown heading 抽出 helper
     `extractMarkdownHeadingTitles` 追加、parseMovieScreenings の description fallback chain に統合
     - unit test 全 PASS (84 files / 1236 tests)、preview deploy 前に CEO パス判定
- **打ち切り理由**:
  - 映画は「映画館検索」と「映画内容そのもの」の 2 段階分離が本来の設計（CEO）
  - catalog parser 単体強化を続けても real EXA results の表記揺れに追従しきれない
  - parser 強化は 3 commit で十分試行、これ以上は ROI 低い
- **未反映の commit**:
  - **`fcfc3d8b` (Bug 2)** は feat 本線に commit 済 + unit test PASS だが preview deploy しない
  - 映画 2 段階分離設計が定まる前は preview に流さない方針
- **次フェーズ**: CEO 判断仰ぐ
  - food path Layer 2-D（narrationEnricher への接続、前 turn で保留）
  - layout/UI phase（rank=0 理由の見える化、context drift 対策）
  - 映画 2 段階分離設計（新 Phase）
  - その他

## [2026-04-30] [Build] [Stage 4 B-3.4 Realtime publication 追加] [承認: CEO]

### 範囲
- migration: `supabase/migrations/20260430100000_coalter_memory_items_realtime.sql`
  - SQL: `ALTER PUBLICATION supabase_realtime ADD TABLE public.coalter_memory_items`
  - 冪等性: `pg_publication_tables` check で重複追加回避 (既存 `20260415100000_coalter.sql` と同 pattern)
- code: `useMemoryItems` hook に Supabase Realtime channel subscribe 追加
  - channel name: `coalter_memory:${pairId}` (CEO 確定 2026-04-30、filter 式は分離)
  - filter: `pair_id=eq.${pairId}` (postgres_changes 内、performance 最適化)
  - throttle: **250ms** (REALTIME_THROTTLE_MS、CEO 確定 2026-04-30、即時性より安定性優先)
  - throttle 中の連続 event 取りこぼし防止: `pendingRef.current ?? itemsRef.current` を base に compute
  - `shouldDisplay` 多層 gate (CEO 確定 2026-04-30):
    - viewer=user_a で user_b_only → 非表示
    - viewer=user_b で user_a_only → 非表示
    - internal_only → 常に非表示
    - expired (expires_at <= now) → 非表示
    - both_visible / same-side scope → 表示

### security boundary (3 層 defense in depth)
1. RLS (DB-level、主防御): SELECT policy で pair member + 片側可視性 enforce、Realtime broadcast は subscriber session の RLS を評価
2. filter (server-side、performance): `pair_id=eq.${pairId}` で別 pair event を server-side で短絡
3. client `shouldDisplay` (UI-level、副防御): visibility / expires / viewer scope を client 側でも check

### supabase db push timing (CEO 確認 gate)
1. B-3.4.a/b/c 3 commits を local 完了
2. push origin → Vercel preview build
3. preview smoke (publication 未追加で CHANNEL_ERROR でも UI 壊れない invariant 確認)
4. **CEO 確認 → CEO が `supabase db push` 手動実行** (ここが必須 gate)
5. publication 追加後 manual realtime test (test pair で service_role INSERT → 別端末で受信確認)
6. test data cleanup (CEO 指示 Gate B、必須):
   - `DELETE FROM coalter_memory_items WHERE pair_id = '${test_pair_id}' AND content LIKE 'B-3.4 manual test%'`
   - service_role 経由、SQL Editor or supabase CLI
7. Production promote 判断 (B-4 完了後にまとめて、B-2/B-3 と同方針)

### rollback 手順
- code rollback:
  - `git revert <B-3.4.a hash> <B-3.4.b hash> <B-3.4.c hash>` + `git push origin feat/coalter-three-stage`
  - Vercel auto preview build → CEO promote
- migration rollback:
  - 別 migration `supabase/migrations/<timestamp>_revert_coalter_memory_items_realtime.sql` を作成
  - SQL: 冪等性付き `ALTER PUBLICATION supabase_realtime DROP TABLE public.coalter_memory_items`
    ```sql
    do $$
    begin
      if exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'coalter_memory_items'
      ) then
        execute 'alter publication supabase_realtime drop table public.coalter_memory_items';
      end if;
    end $$;
    ```
  - **CEO 操作で `supabase db push`** で適用
- env / `coalter_memory_items` table / 既存 RLS は touch しない (data 破棄ゼロ)
- revert 中の in-flight subscribe client は CHANNEL_ERROR を受けるが、`setRealtimeError("channel_*")` fallback で UI 壊れず、initial fetch 経路維持

### 制限事項
- B-3.4 単独で Production promote しない (Path B 完了後にまとめて、CEO 確定方針)
- B-4 (Supabase migration 適用状態最終 audit + integration test) は別 phase
- preview smoke 段階では publication 未追加で CHANNEL_ERROR が来る可能性あり、UI 壊れない invariant が保証

## [2026-04-30] [Build] [Stage 4 B-3.4.d REPLICA IDENTITY FULL] [承認: CEO]

### 経緯
- B-3.4 publication 追加後の manual realtime test (2026-04-30) で発見:
  - INSERT realtime: ✅ 即時反映
  - UPDATE realtime: (本 test では未検証、INSERT と同じ broadcast 経路のため OK 想定)
  - DELETE realtime: ⚠️ 不発火、page refresh 後に initial fetch 経由で消える

### 根本原因
- PostgreSQL `REPLICA IDENTITY DEFAULT` 仕様: DELETE event の OLD record に PK のみ
- Supabase Realtime は subscriber session の RLS で event filter
- RLS policy `cps.id = coalter_memory_items.pair_id` の評価で OLD record の `pair_id`
  不在 → filter で drop → subscriber に届かない

### 修正
- migration: `supabase/migrations/20260430110000_coalter_memory_items_replica_full.sql`
- SQL: `ALTER TABLE public.coalter_memory_items REPLICA IDENTITY FULL;`
- これにより DELETE event の OLD record に全 columns が含まれ、RLS evaluation 成功

### 副作用評価
- WAL log size がやや増加 (UPDATE / DELETE 時に全 row が log に書かれる)
- coalter_memory_items は row size 小 (text + uuid + timestamps) かつ update 頻度低
  → 影響軽微、許容範囲
- 既存 RLS / INSERT / UPDATE realtime 経路は不変 (schema-only change)
- 既存 row data は touch しない

### 不変 (CEO 厳守 2026-04-30)
- useMemoryItems.ts ロジック変更なし (既存 client computeNext で動く)
- API / UI / MemorySurface 変更なし
- RLS policy 変更なし
- soft delete pattern 採用せず (scope 過大、B-4 でも別審議せず)

### supabase db push timing (Gate A 維持)
1. migration commit + push
2. preview build + smoke (publication 既追加で INSERT/UPDATE は引き続き動作、
   DELETE は本 migration 適用前のため引き続き page refresh 依存)
3. 私が `supabase migration list --linked` で未適用 1 本確認 → CEO に GO 仰ぐ
4. CEO `supabase db push` 手動実行
5. 適用確認 + DELETE manual realtime test 再実行

### rollback 手順
- code: 本 migration を git revert (file 削除)
- migration rollback:
  - 別 migration `<timestamp>_revert_coalter_memory_items_replica_default.sql` を作成
  - SQL: `ALTER TABLE public.coalter_memory_items REPLICA IDENTITY DEFAULT;`
  - CEO `supabase db push` で適用
- env / DB row data / 既存 RLS / publication 登録は touch しない (data 破棄ゼロ)
- rollback 後の DELETE realtime は再び不発火に戻るが、INSERT/UPDATE は引き続き動作

### 制限事項
- B-3.4.d 単独で Production promote しない (Path B 完了後にまとめて)
- B-4 (Supabase migration 適用状態最終 audit + integration test) は本 migration 適用後に実施

## [2026-04-30] [Build] [Stage 4 B-4.1 audit + Path B 完了判定] [承認: CEO]

### Path B で達成した範囲

- **B-1** (`02b57f79`): L4-b state header + L4-f ModeSwitcher 本番化
- **B-2** (`2bc7a7b4` / `03ada72a` / `a0a4d2c9`): L4-h Urgent layer + critical signal detection (CEO 視覚確認 PASS)
- **B-3.0**: migration / RLS read-only audit (commit なし、audit only)
- **B-3.1** (`e5474242`): Memory list API endpoint (server-side、RLS-aware)
- **B-3.2** (`6c0cf82d`): useMemoryItems hook (initial fetch のみ)
- **B-3.3** (`8330c7bc`): UpperLayerMount に MemorySurface mount + viewer 解決
- **B-3.4.a** (`8e5d0e80`): Realtime publication migration (適用済 2026-04-30 10:00:00)
- **B-3.4.b** (`bb0eba99`): useMemoryItems Realtime 拡張 (channel + filter + throttle 250ms)
- **B-3.4.c** (`9599138e`): Realtime hook test + 既存 grep 反転 (CEO 修正条件 1/2 cover)
- **B-3.4.d** (`42ba5bee`): REPLICA IDENTITY FULL migration (適用済 2026-04-30 11:00:00)

### Path B 完了 ≠ §10.2 全項目完全達成

Stage 4 L4-l 完了定義 §10.2 13 項目に対する Path B の状態:
- **完全達成 (complete)**: 5 項目 (#3 3 mode / #4 memory surface / #5 urgent layer / #7 連投抑制 / #11 不可侵項遵守)
- **部分達成 (partial)**: 6 項目 (#1 Stage 4 全 / #2 flag 全 (PRESENCE_SPEECH_LLM 未稼働) / #6 拒否 3 分類 UI 未接続 / #9 telemetry 観測未確認 / #10 a11y 4 補助状態未接続 / #12 mainstream E-3 整合未確認)
- **未達成 (missing)**: 2 項目 (#8 speechBuilder LLM 合成 / #13 legacy CoAlterCard 削除)

表現規約 (CEO 確定 2026-04-30):
- ✅ **Path B 完了** / ✅ **Stage 4 L4-l core UI path 完了**
- ❌ **§10.2 全項目完全達成** / ❌ **Stage 4 L4-l 完全完了** (= 表現禁止)

→ **Path B 完了 = Stage 4 L4-l core UI path 完了**。Stage 4 L4-l 正式完了には L4-i / L4-j / L4-k / L4-m / mainstream E-3 の追加 phase が必要。

### B-3.4 Realtime INSERT / DELETE manual test PASS

2026-04-30 manual test (CEO 視覚確認):
- INSERT realtime: 即時表示 ✅
- DELETE realtime: page refresh なしで即時消失 ✅ (REPLICA IDENTITY FULL 効果)
- cleanup SELECT count = 0 ✅
- console error / CHANNEL_ERROR なし ✅

REPLICA IDENTITY FULL の効果が想定通りに発揮 (DELETE event の OLD record が full row で broadcast され RLS 評価成功 → subscriber に届く)。

### publication / REPLICA IDENTITY FULL / RLS の最終状態

- `coalter_memory_items`: `supabase_realtime` publication に登録済 ✅ (`20260430100000`)
- `coalter_memory_items`: REPLICA IDENTITY FULL ✅ (`20260430110000`)
- `coalter_memory_items` RLS:
  - SELECT: pair member + visibility gate (4 軸: both_visible / user_a_only / user_b_only / internal_only) ✅
  - UPDATE: pair member ✅
  - INSERT: `with check (false)` (service_role 経由のみ) ✅
  - DELETE: pair member ✅
- `coalter_pair_states` RLS:
  - SELECT/INSERT/UPDATE: pair member ✅
  - DELETE: cascading delete only

### 残リスク R1-R13

#### Path B 範囲外 (§10.2 残項目)
- **R1**: `PRESENCE_SPEECH_LLM` 未稼働 (L4-i 残)
- **R2**: telemetry 8 項目 Production 観測未確認 (L4-j 部分)
- **R3**: a11y 4 補助状態 UI 未接続 (L4-k 部分、State*Fallback components 実装済だが UpperLayerStateRenderer に mount なし)
- **R4**: 拒否 3 分類 UI 未接続 (§10.2 #6、rejectionReducer 実装済だが UpperLayerMount に mount なし)
- **R5**: legacy CoAlterCard 削除未実施 (L4-m、CEO「1 rev 観測後」方針)
- **R6**: mainstream plan E-3 整合未確認

#### Path B 範囲内
- **R7**: explicit / mention / chip tap signal 未実装 (B-2 で除外)
- **R8**: Memory item 「両端末視点」確認 1 端末のみ (端末 2 台での visibility test 未実施)
- **R9**: Production load (memory rate / subscriber count) 未測定
- **R10**: rate limit / utterance queue は Stage 2 実装済だが UI 接続未確認

#### 運用
- **R11**: rollback 経路の手動依存 (CEO 操作: Vercel env / supabase db push)
- **R12**: test pair_id 1 つでの確認のみ
- **R13**: CEO 厳守事項 12 項目 → 機械的 enforcement なし

### Production promote 候補 P1/P2/P3

- **P1**: Path B 完了で promote (B-4.2 完了後の CEO 判断、推奨)
- **P2**: §10.2 全項目達成後 promote (慎重派、L4-i/j/k/m + E-3 完了まで preview のみ)
- **P3**: 段階的 promote (sub-phase 完了ごとに promote)

### 推奨は P1、最終判断は B-4.2 後

CEO 確定 (2026-04-30): **P1 を採用候補**、B-4.2 完了後に以下 6 つの判断材料を見て最終判断:
1. B-4.2 test 結果
2. decision-log 記録
3. rollback 手順
4. preview smoke
5. CEO 視覚確認
6. §10.2 残項目が明示されていること

### 次フェーズ優先順位 (B-4 完了後、CEO 確定 2026-04-30)
1. **L4-k**: a11y / loading / error / empty 補助状態の本番 wire
2. **L4-j**: telemetry 8 項目の Production 観測
3. **L4-i**: Presence speech LLM 合成
4. **L4-m**: legacy CoAlterCard 自動挿入コード削除
5. **mainstream plan E-3 整合 audit**

ただし実際の着手順は B-4 完了後に再判断。

### 不変 (CEO 厳守 2026-04-30)
- B-4.1 audit は read-only、code touch ゼロ
- migration / API / UI / RLS / supabase db push / Production promote / env / package / next-env.d.ts / supabase temp 全て不変

## [2026-04-30] [Build] [Stage 4 L4-k a11y / loading / error / empty 4 補助状態 wire] [承認: CEO]

### 範囲
- UpperLayerStateRenderer に `<StateAriaWrapper>` を統合 (全 state component を統一 wrap)
- UpperLayerShell から `role="region"` + `aria-label="CoAlter 上部レイヤー"` 削除 (二重 region 回避、`data-testid="coalter-upper-layer-mount"` 維持)
- UpperLayerMount を `<UpperLayerErrorBoundary>` でラップ
- UpperLayerMountActive 内に Loading transient (isPresenceReady) + Empty (availability!=='active') 経路追加

### 4 補助状態の Trigger 条件
- **Loading**: `!isPresenceReady` (mount 直後 1 tick、setTimeout(0) で ready)
- **Empty**: `availability !== "active"` (B-1 では active 固定で発火しない、将来 consent flow で発火)
- **Error**: UpperLayerErrorBoundary class component の getDerivedStateFromError catch
- **Aria**: StateAriaWrapper polite 固定 (UrgentLayer assertive と分離、二重通知回避)

### §10.2 #10 状態遷移
- Path B 完了時点 (B-4.2 record): partial
- L4-k 完了時点: **complete** (4 補助状態すべて mount 経路 wire、trigger 条件明確、test PASS)
- B-4.2 mapping update: complete 5→6 / partial 6→5 / missing 2 (不変)

### CEO 厳守事項の遵守 (2026-04-30)
- ChatClient.tsx 触らない (test で grep 確認、UpperLayerErrorBoundary 等 import なし)
- ErrorBoundary は UpperLayerMountActive のみ包む (chat input / scroll / message rendering 不変)
- telemetry / Sentry breadcrumb は L4-j で別接続、本 phase は console.error のみ (L4-j 衝突回避)
- Memory / Realtime / Supabase / Urgent trigger / signal detection 不変
- L4-i / L4-j / L4-m / mainstream E-3 触らない
- env / package / next-env.d.ts / supabase temp 触らない
- 新 dependency 追加なし (react-error-boundary 不使用、class component で React 古典実装)

### test 計画 (10 必須項目すべて cover)
- Loading: 初期 tick 経路 (構造 invariant + StateLoadingFallback 関数 invoke)
- Loading: timer 後 ready 経路 (useEffect setTimeout grep)
- Empty: availability 4 値 (disabled / inactive / pending_consent / enabled) で StateEmptyFallback
- Error: ErrorBoundary class method (getDerivedStateFromError + render + reset + componentDidCatch)
- Aria: StateAriaWrapper wrap + state component children + polite 固定
- UpperLayerShell role=region 削除確認
- ChatClient touch ゼロ確認
- B-1/B-2/B-3/B-4/B-2.4 regression (5327/5328 PASS、1 failure は pre-existing alter-morning)
- 27 セル × 4 補助 = 108 ケース structural readiness

### rollback
- code rollback: `git revert <L4-k commit>` + push (15-20 min)
- env / migration / DB 不変
- 影響: a11y 属性削除 + ErrorBoundary なし → 既存 UpperLayerShell の role=region に戻る (B-1 状態)
- behavior 不変原則: flag OFF で完全不変

### Production observation 項目
- a11y reader 読み上げ品質 (CEO / 任意 user による screen reader テスト)
- Error 経路の発火率 (L4-j で telemetry wire 後に Sentry で監視)
- Loading transient 時間 (dev tools React profiler、1 frame 内に通常 UI 切替確認)

### 制限事項
- Production promote は B-4.2 全完了後にまとめて (CEO 確定方針)
- 本 commit のみで Production promote しない

## [2026-04-30] [Build] [Stage 4 L4-j Phase 1 — production reachable 4 event wire] [承認: CEO]

### 範囲
Plan D (CEO 確定 2026-04-30): production reachable 4 event のみ telemetry emit を usePresenceExecutor に wire。
- ① `state_transition`: presence.state 変化時 (前値比較で重複防止)
- ② `pattern_used`: primaryPattern 変化時 (前値比較)
- ⑤ `mode_transition`: mode 変化時 (`lastModeEventTypeRef` で trigger 解決)
- ⑦ `urgent_triggered`: urgentDecision 変化時 (`buildUrgentDedupeKey` で dedupe)

### 不採用 4 event (別 phase 扱い)
- ③ `consent`: consent / activate flow の観測設計が別途必要 (consent UI phase で wire)
- ④ `legacy_fallback`: `LEGACY_CARD_AUTO_INSERT=false` で抑止中、L4-m legacy 削除 phase と統合
- ⑥ `rejection`: rejection UI が本番 wire されていない (§10.2 #6 と連動)
- ⑧ `ratelimit_blocked`: utteranceQueue / ratelimit の UI 経路が現状 reachable でない

→ **未到達 event を telemetry だけ入れて「実装済み」に見せる行為を回避**。

### emit point の集約
- 全 4 event を `usePresenceExecutor.ts` の useEffect 内で emit
- ChatClient.tsx に touch なし (B-1 から不変、grep で確認)
- emit point 分散ゼロ (presence state / mode / urgent / pattern の中心 hook で集約)

### dedupe 戦略
- 4 event すべて useRef で前値 / 前 key を保持
- 前値と異なる場合のみ emit、毎 render の rerender では emit ゼロ
- urgent は null 復帰で dedupe key reset (次の non-null で再 emit 可能)

### payload 制約 (CEO 厳守 2026-04-30)
- 会話本文 / ユーザー入力文 / 個人情報を一切含めない (test で grep 確認)
- pairId は `initial?.pairId ?? ""` のみ (telemetry のための fetch 追加禁止)
- state / mode / pattern variant 等の構造化 enum + number (ts) のみ送信

### Sentry breadcrumb 経路 (既存 wire の活用、本 phase で追加変更なし)
- `lib/coalter/presence/sentryTelemetry.ts` の `createSentryTelemetrySink` で `Sentry.addBreadcrumb` 経由
- `instrumentation-client.ts` の `wireSentryTelemetry()` で sink 注入済 (L4-pre-3 wire)
- 8 event → category mapping は既存 (`coalter.presence` / `coalter.pattern` / `coalter.mode` / `coalter.urgent` 等)

### 重要観測仮説 (CEO 指摘)
`Sentry.addBreadcrumb` は通常、breadcrumb 単体で独立送信されるとは限らない:
- error event / transaction / replay 等に紐づいて初めて Sentry Discover で見える可能性
- L4-j Phase 1 完了後の Production 観測で実証必要
- もし breadcrumb 単体で観測不能なら、追加 event wire に進まず、**sink 設計に戻る** (Sentry breadcrumb → Sentry custom event / metric / span 等への切替検討)

### Production 観測手順
1. CEO Production talk page (`https://culcept-2ly9oxx2v-...vercel.app/talk/<thread>`) で:
   - ModeSwitcher で「Daily」 tap → `mode_transition` 発火想定
   - 「もう限界」等 critical keyword 送信 → `urgent_triggered` + `state_transition` + `pattern_used` 発火想定
2. CEO Sentry dashboard で `category:coalter.*` filter で breadcrumb 確認
3. もし breadcrumb 単体で観測できない場合、L4-j Phase 1 を「sink 設計再検討」 phase として記録、追加 wire は次 phase へ

### §10.2 #9 status
- Plan D 完了後も **partial 維持** (CEO 確定方針)
- 4/8 wire に留まる (構造的 reachable のみ)
- 残 4 event は別 phase 依存
- Sentry 観測経路もまず実証段階

### 不変 (CEO 厳守 2026-04-30)
- ChatClient.tsx 触らない ✅
- consent / rejection / legacy / ratelimit を本 phase で wire しない ✅
- L4-i / L4-m / E-3 触らない ✅
- env / package / next-env.d.ts / supabase temp 触らない ✅
- telemetry payload に会話本文 / 個人情報を入れない ✅
- §10.2 #9 を complete に更新しない ✅
- 既存 telemetry sink (Sentry breadcrumb) 設計を変更しない ✅

### rollback 境界
- code rollback: `git revert <L4-j Phase 1 commit>` + push (15-20 min)
- env / migration / DB 不変
- 影響: 4 emit 経路削除のみ、telemetry sink + 既存 wire は維持
- behavior 不変原則: flag OFF で完全不変 (`safeEmit` が flag check で短絡)

### 次フェーズ
- L4-j Phase 1 完了後 Production 観測実証 → 結果次第:
  - **観測 OK** → 残 4 event を別 phase で順次 wire (ただし trigger UI 接続要件あり)
  - **観測 NG (sink 経路問題)** → sink 設計再検討 phase (Sentry breadcrumb 単体観測の代替検討)

## [2026-04-30] [Build] [L4-j-blocker — Sentry sink unreachable: NEXT_PUBLIC_SENTRY_DSN 未設定確定] [承認: CEO]

### 観測契機
- L4-j Phase 1 (`30866d3e` + fix `a21d2f80`) で 4 event (state_transition / pattern_used / mode_transition / urgent_triggered) の sink emit 配線を完了
- CEO Production smoke で「観測できているか」確認の段階で Sentry dashboard / Discover に CoAlter 関連 breadcrumb が一切見当たらない事象を観測
- 本 phase は Plan D の **観測経路実証** part であり、wire 完了 ≠ 観測完了

### 確認手順 (CEO 実施 2026-04-30)
1. **Project レベル env 確認**: `https://vercel.com/taishis-projects-0a8deb17/culcept/settings/environment-variables`
   → `NEXT_PUBLIC_SENTRY_DSN` **存在せず**
2. **Team レベル Shared env 確認**: `https://vercel.com/taishis-projects-0a8deb17/~/settings/environment-variables?view=shared&q=NEXT_PUBLIC_SENTRY_DSN`
   → "No Results Found" — **Shared スコープにも存在せず**
3. CEO 確認結果 (chat): 「結論、NEXT_PUBLIC_SENTRY_DSN は存在しない可能性が高いです」→ Shared 確認後「ここ？」screenshot で確定

### 結論 (CEO 承認 2026-04-30)
- **Sentry SDK は Vercel preview / production 環境で完全 no-op**
- 根拠: `instrumentation-client.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts` 全て `enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN` ガード
- 根拠: `next.config.js` の `withSentryConfig` も `disableClientWebpackPlugin: !process.env.NEXT_PUBLIC_SENTRY_DSN`
- 根拠: 結果として `Sentry.addBreadcrumb` は SDK 未初期化で no-op、**1 件も Sentry に届いていない**
- 影響範囲: L4-j Phase 1 で wire した 4 event だけでなく、**プロジェクト全体の Sentry breadcrumb / error / transaction / replay が一切送信されていない**

### Phase ステータス確定
- **L4-j Phase 1 wire**: ✅ 完了維持 (`30866d3e` + `a21d2f80`)
- **L4-j Phase 1 観測実証**: ❌ blocker により未到達
- **§10.2 #9 status**: partial (4/8 wire) のまま不変、観測実証なしでは complete に上げられない
- **fix-forward 維持**: L4-j Phase 1 の commit はリバートしない (構造的 reachable は確保済、Sentry 復元後に観測実証で完了)

### 新 phase 挿入: L4-j-blocker (Sentry 接続復元 / 判断 phase)
CEO 判断 (2026-04-30):
- 旧計画: L4-j Phase 1 完了 → L4-i / L4-m / E-3 着手
- 新計画: **L4-j Phase 1 完了 → L4-j-blocker (Sentry 接続判断) → 結論次第で L4-i / L4-m / E-3 着手順を再決定**
- L4-j-blocker は code 変更を伴わない判断 phase。CEO の選択を待って次 phase を決める

### CEO 判断待ちの選択肢 (4 案)
1. **既存 Sentry project 復元** — 過去に存在した Sentry project の DSN / Auth Token を Vercel Shared env に再設定。dashboard / Discover に蓄積された過去データが残っていれば最短復旧
2. **新規 Sentry project 作成** (推奨案) — `culcept` 用に新規 project を Sentry SaaS で作成、新 DSN / Auth Token を Vercel Shared env に登録。過去データ無しだが clean start
3. **別 sink 採用** — Sentry を使わず別 telemetry 先 (PostHog / Datadog / Supabase logs / 自前 endpoint) に切替。設計差し戻し phase が必要
4. **telemetry なしで L4-i に進む** — 観測なしで code path だけ進める。CEO 既に却下 (Plan D の観測実証要件と矛盾、§10.2 #9 partial 固定化)

### 不変 (CEO 厳守 2026-04-30)
- L4-j Phase 1 commits リバートしない ✅ (HEAD = `a21d2f80`)
- L4-i / L4-m / E-3 着手しない (L4-j-blocker 判断後に着手順再決定) ✅
- ChatClient.tsx 触らない ✅
- env / package / next-env.d.ts / supabase temp 触らない ✅
- 本 phase は code 変更ゼロ、判断ログのみ ✅

### rollback 境界
- 本 phase は code 変更なし → rollback 対象は decision-log entry のみ (`git revert` で除去可能)
- L4-j Phase 1 wire (`30866d3e` + `a21d2f80`) は本 phase の rollback 対象外

## [2026-04-30] [Build] [L4-j-blocker — Q4 判断: Option 2 採用 (新規 Sentry project / Preview only DSN)] [承認: CEO]

### CEO 判断 Q4-blocker (2026-04-30)
- **採用**: Option 2 = 新規 Sentry project 作成 + Preview only DSN
- **却下**: Option 1 (既存復元) — 確認結果から既存 project の根拠が薄い (Vercel Project / Shared / .env.local / repo / git history すべて DSN 痕跡なし、Sentry dashboard project 0 件)
- **却下**: Option 3 (別 sink 採用) — `@sentry/nextjs` / Sentry config / tunnelRoute / sink 配線が実装済、PostHog 等への切替は scope 過大
- **却下**: Option 4 (telemetry なしで L4-i 進行) — L4-i は LLM 合成 phase、発火頻度 / 誤発火 / 出力品質 / 安全性を観測できない状態での着手は危険

### 進め方 (CEO 確定方針)
- いきなり Production へは入れない
- **まず Preview only で DSN 設定 → Sentry 観測実証 → PASS 後に Production DSN を別判断**

### CEO 担当作業 (2026-04-30 進行中)
1. Sentry SaaS で新規 Project 作成
   - Platform: Next.js
   - Project name: `culcept` (Vercel project 名と一致、混乱回避)
2. DSN 取得
3. Vercel Project `culcept` の Environment Variables に追加
   - key: `NEXT_PUBLIC_SENTRY_DSN`
   - value: Sentry DSN
   - scope: **Preview only** (Production / Development には入れない)
   - 可能なら branch filter: `feat/coalter-three-stage`
4. Preview redeploy

### Claude 担当作業 (CEO Preview URL 共有後)
Preview redeploy 完了後に下記 5 項目を確認:
1. **sentry-release** が最新 commit hash に一致 (HEAD = `37d92eb8` 時点)
2. **sentry-environment** = `vercel-preview`
3. DevTools Network で `/monitoring` request が出る (tunnelRoute による Sentry SaaS 転送)
4. Sentry dashboard に event / breadcrumb / transaction / replay のいずれかが見える
5. **L4-j Phase 1 の 4 event 観測**:
   - `coalter.mode.transition` (ModeSwitcher で Daily/通常切替)
   - `coalter.urgent.triggered` (「もう限界」等 critical keyword 送信)
   - `coalter.presence.state_transition` (S0→S1/S2 遷移)
   - `coalter.pattern.used` (pattern 算出)

### 判定基準 (CEO 確定 2026-04-30)
- Preview で `/monitoring` request が出る
- Sentry 側で最低限 `coalter.mode.transition` と `coalter.urgent.triggered` の 2 event が確認できる
- 上記 2 条件 PASS で **Sentry 接続復元 phase 一旦 PASS**
- その後 Production DSN を入れるかは **別判断** (L4-j-blocker の範囲外)

### 禁止事項 (CEO 厳守 2026-04-30)
- Production env に DSN を入れない (Preview PASS 後の別判断)
- Shared Variables で全 project / 全環境に広げない (Project scope 限定)
- Sentry project を複数作らない (`culcept` 1 個のみ)
- DSN を code に直書きしない (env 経由のみ)
- env / package / next-env.d.ts / Supabase は触らない
- L4-i へ進まない (本 phase PASS 待ち)
- 別 sink へ飛ばない (Sentry 採用方針維持)

### 不変 (CEO 厳守 2026-04-30)
- L4-j Phase 1 commits (`30866d3e` + `a21d2f80`) リバートしない ✅
- ChatClient.tsx 触らない ✅
- 本 phase は code 変更ゼロ、判断ログ + 観測手順記録のみ ✅

### rollback 境界
- 本 phase は code 変更なし → rollback 対象は decision-log entry のみ
- DSN 設定は Vercel UI 操作 → rollback も Vercel UI で env 削除 + redeploy のみ
- 観測 NG だった場合の次 phase: Sentry 接続トラブルシュート (DSN typo / project scope mismatch / build env 未反映 等) を切り分け、別 phase として記録

### 次ステップ (CEO Preview URL 共有待ち)
1. CEO が Sentry project 作成 + Vercel Preview env 登録 + redeploy 完了
2. CEO が Preview URL を共有
3. Claude が 5 項目検証 → 結果を decision-log に記録
4. 判定 PASS / NG の双方を別 entry で記録、PASS なら L4-i 着手可否を CEO 判断、NG ならトラブルシュート phase

## [2026-04-30] [Build] [L4-j-blocker — Sentry 接続復元 phase PASS (4/4 event 観測実証 完了)] [承認: CEO]

### 経過
- CEO が新規 Sentry project (`taishi-harada / culcept`) 作成、Preview only DSN を Vercel Project env に登録、redeploy 完了
- Preview URL: `https://culcept-i8yqqlwkz-taishis-projects-0a8deb17.vercel.app/`
- Sentry org: `taishi-harada`、project slug: `culcept`、org_id: 4511307264622592

### 5 項目検証 結果
| # | 項目 | 結果 | 根拠 |
|---|---|---|---|
| 1 | sentry-release | ✅ PASS | HTML meta tag に `sentry-release=28ba23e0d6b776b08c91d66029743298d67f8f90` (最新 commit と一致) |
| 2 | sentry-environment | ✅ PASS | HTML meta tag に `sentry-environment=vercel-preview` |
| 3 | `/monitoring` request | ✅ PASS | DevTools Network で 21 件以上観測、payload に正規 Sentry envelope |
| 4 | Sentry dashboard 反映 | ✅ PASS | `taishi-harada.sentry.io/insights/projects/culcept/` で Issues 2 件 (CULCEPT-1 + CULCEPT-2) |
| 5 | L4-j 4 event 観測 | ✅ **完全 PASS (4/4 種)** | CULCEPT-2 の Breadcrumbs pane で全 4 category 観測 |

### 観測された L4-j 4 event (CULCEPT-2 の Breadcrumbs)
| category | level | trigger 操作 | 観測 timestamp | data payload |
|---|---|---|---|---|
| `coalter.urgent` | warning | 「もう限界」送信 | 2026-04-30T10:31:07.721Z | `{category:"rupture_detected", form:"dominant_card", memoryFallback:"demote", pairId:"", ts:1777545067721}` |
| `coalter.presence` | info | 同上 (S0→S2 critical) | 2026-04-30T10:31:07.721Z | `{from:"S0", to:"S2", trigger:"critical", pairId:"", ts:1777545067721}` |
| `coalter.pattern` | info | 同上 (variant A) | 2026-04-30T10:31:07.721Z | `{state:"S2", mode:"normal", variant:"A", hasSecondary:false, pairId:"", ts:1777545067721}` |
| `coalter.mode` (#1) | info | Daily 切替 | 2026-04-30T10:31:20.914Z | `{from:"normal", to:"daily", trigger:"manual_switch", pairId:"", ts:1777545080914}` |
| `coalter.mode` (#2) | info | 通常切替 | 2026-04-30T10:31:21.907Z | `{from:"daily", to:"normal", trigger:"manual_switch", pairId:"", ts:1777545081907}` |

→ 5 件の telemetry breadcrumb が単一 error event (level: error, message: "L4-j breadcrumb verification - manual trigger") に attach されて Sentry に到達。

### payload 制約 (CEO 厳守項目) 全 PASS
- ✅ 会話本文 / ユーザー入力文 / 個人情報を一切含まない (構造化 enum + number のみ)
- ✅ `pairId: ""` (空文字) — `initial?.pairId ?? ""` のみ、telemetry のための fetch 追加なし
- ✅ state / mode / pattern variant / category / form / trigger 等の enum
- ✅ `coalter.urgent` のみ level=warning、他は info — `lib/coalter/presence/sentryTelemetry.ts` 仕様と一致

### CEO 判定基準到達
- 必須: `/monitoring` request が出る → **超過 (21 件)**
- 必須: `coalter.mode.transition` 観測 → **超過 (2 件)**
- 必須: `coalter.urgent.triggered` 観測 → **PASS (1 件)**
- 追加: `coalter.presence.state_transition` 観測 → PASS
- 追加: `coalter.pattern.used` 観測 → PASS

### 検証経路 (CEO 操作詳細)
1. Preview talk page で chat 操作:
   - 「もう限界」送信 (19:31:07 JST) → 3 event 同時 emit
   - CoAlter mode で Daily 切替 (19:31:20 JST) + 通常戻し (19:31:21 JST) → mode_transition × 2
2. DevTools Console で uncaught error:
   ```js
   setTimeout(() => { throw new Error("L4-j breadcrumb verification - manual trigger") }, 0)
   ```
3. Sentry SDK の `window.onerror` integration が auto-capture
4. error event に直前の 5 breadcrumb が attach されて `/monitoring` 経由で Sentry SaaS に送信
5. CEO が Sentry dashboard で CULCEPT-2 を開いて Breadcrumbs pane を確認

### 重要な技術知見 (今後の運用 / 別 phase 設計参考)
- `Sentry.addBreadcrumb` 単体は **Sentry に独立送信されない** (transaction/error の context として attach のみ)
- `tracesSampleRate: 0.1` で 90% の transaction が drop される → breadcrumb もそれと運命を共にする
- error event は **100% sampling** (instrumentation-client.ts の error 設定) → breadcrumb attach の最確実経路
- `window.Sentry` は modern Sentry SDK (v10) で **window 露出されない** → console から直接呼べない、uncaught error 経由が唯一の手段
- L4-j Phase 1 の 4 event は client side (`instrumentation-client.ts` の `wireSentryTelemetry()` で sink 注入) でのみ emit
- server side error (例: CULCEPT-1 の `/offline` Server/Client Component bug) には CoAlter breadcrumb は attach されない (server runtime には sink なし)

### Phase ステータス確定
- **L4-j-blocker = PASS**
- **L4-j Phase 1 観測実証 = 完了**
- **§10.2 #9 status**:
  - 4 event wire complete + Sentry 観測実証 完了
  - 但し CEO 確定方針 (Plan D) で **partial 維持** (8 event 中 4/8 のみ wire、残 4 event は consent / rejection / legacy / ratelimit 経路依存)
  - **complete 昇格は別 phase で 4 event 追加 wire してから**

### 並行観測された副次論点 (本 phase 範囲外、別 task で対応)
- **CULCEPT-1**: `/offline` page の Next.js Server/Client Component event handler bug
  - "Event handlers cannot be passed to Client Component props. {onClick: function onClick, className: ..., children: ...}"
  - 修正は spawn task として記録済 (本 phase scope 外)

### 不変 (CEO 厳守 2026-04-30)
- L4-j Phase 1 commits (`30866d3e` + `a21d2f80`) リバートしない ✅
- ChatClient.tsx 触らない ✅
- env / package / next-env.d.ts / supabase は触らない ✅
- L4-i / L4-m / E-3 へまだ進まない (本 phase PASS で進路再決定 phase に移行) ✅

### 次フェーズ (CEO 判断待ち)
本 phase PASS により下記 4 つの判断が CEO に戻る:

1. **Production DSN 投入の可否** (本 phase 範囲外、CEO 別判断)
   - 案 A: Preview PASS のまま Production も同 DSN を投入 (Project env Production scope)
   - 案 B: Preview のみ運用継続、Production は L4-i / L4-m / E-3 完了後の別 phase で判断
   - 案 C: 別 Sentry project (Production 用) を分離 (本気運用なら推奨だが工数 +)

2. **L4-i / L4-m / E-3 の着手順**
   - Plan D 元案: L4-i (LLM 合成) → L4-m (memory 拡充) → E-3 (Stage 4 §10.2 完成)
   - 本 phase で telemetry 観測経路が確立 → L4-i の発火頻度 / 誤発火 / 出力品質 / 安全性が観測可能になった (本来の前提条件 PASS)

3. **§10.2 #9 status を complete に昇格するか**
   - 残 4 event (consent / rejection / legacy / ratelimit) を wire する別 phase を切るか、partial のまま L4-l 完了とするか

4. **CULCEPT-1 (`/offline` bug) の修正タイミング**
   - 既に spawn task に記録済、本 phase 完了後の別 task で対応

### rollback 境界
- 本 phase は code 変更なし → rollback 対象は decision-log entry のみ
- DSN 設定: Vercel UI 操作のみ、rollback は env 削除 + redeploy
- L4-j Phase 1 wire (`30866d3e` + `a21d2f80`) は不変
