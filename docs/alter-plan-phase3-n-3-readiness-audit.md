# Phase 3-N-3 Readiness Audit — Empty Day → ALTER Flow

**作成日**: 2026-05-23
**branch**: `docs/plan-phase3-n-3-readiness-audit`
**前提**: Phase 3-N-2 完了宣言 `afaa8eb0` 着地後、 CEO 「N-3 readiness audit 着手提案までは進めてよい」 承認
**性質**: docs only (= 実装変更 0、 frozen branches 追加 commit 0、 既存 file 改変 0)

---

## 0. Executive Summary

### 0.1 本 readiness audit の目的

- Phase 3-N-3 (= empty day → ALTER flow) の実装可否を CEO 判断するための事前整理 doc
- N completion audit `95d15ea6` §3.3 が定めた N-3 責務に対し、 scope / invariants / success scenario / failure scenario / 既存 docs 整合 を整理
- 実装着手前の CEO 明示承認が必要 (= 即断禁止、 handoff doc §A-2 「N-3 readiness 後 CEO 判断」)

### 0.2 結論先出し

- **N-3 は実装可能** (= 既存 Stargazer / Alter engine が利用可能、 接続範囲限定で fail-safe 設計可)
- **但し scope の哲学的境界に判断要** (= 「empty day 提案」 が Counter-Factual generation 禁止に該当するか、 CEO 明示判断必要)
- **scope 確定 + CEO 判断後の連続 GO は時期尚早** (= 大型設計のため readiness 後に 1 段階 plan audit を入れる方が安全、 自律推奨)

### 0.3 CEO 判断項目 (= §9 で詳細)

1. N-3 を /plan 内で実装するか / 別軸 (= Stargazer 単独 phase) で扱うか / 明示 defer か
2. 「empty day 提案」 が Counter-Factual generation 禁止に該当するか の哲学的判断
3. scope 範囲確定 (= 本 doc §1 の整理で OK か、 縮小 / 拡大か)
4. readiness 後の進行 (= 連続 GO で plan audit に進むか、 報告で停止か)

---

## 1. N-3 の scope (= 含める / 含めない)

### 1.1 含める (= N-3 範囲、 N completion audit §3.3 + 自律整理)

| 項目 | 内容 | 性質 |
|---|---|---|
| **1** | CalendarTab / FlowTab / MapTab で empty 日 (= anchor 0 件) を識別 | UI 識別 |
| **2** | empty 日 tap → Alter modal 起動 (= 既存 AlterModal 流用 or 新規) | UI 起動 |
| **3** | Alter modal で自然質問 (= 「どんな日にしたい？」 系、 観測の入口) | LLM 接続 |
| **4** | user 回答 → Alter 応答 chip 3-5 件 (= 候補提示) | LLM 出力 |
| **5** | chip tap → AddAnchorModal pre-fill or 直接 anchor 作成 | Plan API 接続 |
| **6** | privacy 設計 (= LLM に送る data の minimum surface) | infra 設計 |
| **7** | cost cap 設計 (= LLM 呼び出し回数 + token 制限) | infra 設計 |
| **8** | fail-safe 設計 (= LLM down 時 / timeout 時の fallback) | infra 設計 |
| **9** | regression test (= 永続化、 思想保護) | test 整備 |

### 1.2 含めない (= N-3 scope 外、 N-4 以降 or 別軸)

| 項目 | 理由 |
|---|---|
| Counter-Factual generation (= 「あなたの 1 日はこうした方が良い」) | 永続禁止 (= handoff doc §A-3、 N completion audit §5) |
| 複数日傾向観測 / Pattern Truth Layer | N-4 範囲 |
| 「過去の自分の選択を観測」 (= Counter-Factual Observation) | N-4 範囲 |
| Stargazer pivot (= /plan 外の Stargazer 全面強化) | /plan complete 後 |
| Routes API / Arrival Risk Memory | 永続禁止 |
| 警告文言 / amber/orange/red / icon / badge / warning box | 永続禁止 |
| localStorage / DB / env / package / dependency 変更 | 永続禁止 (= N-3 でも遵守) |

### 1.3 scope の哲学的境界 (= CEO 判断要)

handoff doc §A-3 の定義:
- **禁止**: AI が「あなたの 1 日はこうした方が良い」 と提案 / おすすめ / 最適化
- **許可**: 余地観測 / 選択構造差分観測

N-3 「empty day → ALTER 提案」 の解釈候補:

| 解釈 | 内容 | generation/observation 判定 |
|---|---|---|
| **A** | 「user の選んだ 1 日を別案に置き換える」 | generation (= 禁止) |
| **B** | 「空白 (= 選んでいない) 日に user 自身の選択を促す問いかけ + 候補提示」 | 境界 (= 観測の入口 + user 選択尊重) |
| **C** | 「空白の余地を user 自身が観測する補助」 | observation 寄り (= 許可) |

→ N-3 の本質は **B** に近い。 但し UX 表現 (= 「Alter おすすめ」 等の語) が A に寄ると generation 違反になる懸念。

**CEO 判断必要**: 解釈 B を採用するか、 解釈 C に縮小するか、 解釈 A 含む場合は scope を再定義するか。

---

## 2. Invariants (= 永続規約、 全 N-3 実装で遵守)

### 2.1 思想 invariants (= Aneurasync 中心問い接続)

| # | invariant | 違反検出方法 |
|---|---|---|
| **1** | 質問 = 観測の入口 (= アンケートではない) | prompt 監査 + 応答 audit |
| **2** | 観測のみ (= AI が別の 1 日を生成しない) | prompt 監査 + post-check |
| **3** | user の選択尊重 (= 「Alter おすすめ」 文言禁止、 「あなたが選んだら？」 等の framing) | UI copy 監査 |
| **4** | 「最適化」 「効率化」 「おすすめ」 「こっちの方が良い」 文言禁止 | grep 監査 + regression test |
| **5** | empty day の「空白」 を否定的に扱わない (= 「予定がない」 ≠ 「埋めるべき」) | UX copy 監査 |

### 2.2 機械 invariants (= 永続禁止項目、 N-3 でも継承)

| # | invariant | scope |
|---|---|---|
| **6** | warning / recommendation / optimization 文言禁止 | UI copy + prompt |
| **7** | amber / orange / red 警告色禁止 | Tailwind class grep |
| **8** | icon / badge / warning box 禁止 | UI component grep |
| **9** | localStorage / persist 禁止 | code grep |
| **10** | DB / env / package / dependency 変更禁止 | git diff 監査 |
| **11** | Arrival Risk Memory 禁止 | feature flag + grep |
| **12** | Routes API / 実 API 禁止 (= 別 phase) | network 監査 |
| **13** | Counter-Factual generation 禁止 | prompt 監査 + post-check |
| **14** | runtime telemetry sink 禁止 | code grep |
| **15** | fetch / push / gh / reset / restore / stash / branch delete 禁止 | git 監査 |

### 2.3 規約 24-extended の継承 (= N-2 確立)

> すべての focus surface (= ring / border / outline) は `focus-visible:` + `slate-*` を使い、 `focus:` (= focus-visible なし) と brand color (= indigo, purple) を組み合わせない。

→ N-3 で新規追加する UI (= Alter modal / chip / button 等) は規約 24-extended を遵守。 既存 40 件 regression test の TARGET_FILES に追加するパターンを継承。

---

## 3. Success Scenario

### 3.1 user flow (= 成功時の体験)

```
1. user が /plan を開く (= CalendarTab default)
2. user が empty 日 (= anchor 0 件) を tap
3. Alter modal 起動 (= 既存 AlterModal 流用 or 新規)
4. Alter 自然質問: 「○○日、 どんな日にしたい？」 (= 観測の入口、 1 文 14-28 文字)
5. user が text input で回答 (= 自由記述)
6. Alter 応答 (= chip 3-5 件、 ActionShape + ForceBalance で構造化):
   - 「リセットしたい?」 → recover / reset 系
   - 「会いたい人?」 → social 系
   - 「進めたい事?」 → advance 系
7. user が chip tap (= 選択)
8. AddAnchorModal pre-fill 起動 (= title + 暫定時刻、 user は微調整 + 保存)
9. anchor 確定 → 通常 plan に組み込み
```

### 3.2 成功指標

| # | 指標 | 測定方法 |
|---|---|---|
| **1** | empty 日 tap → modal 起動率 100% (= 機能正常) | manual smoke |
| **2** | Alter 質問の自然さ (= 「アンケート臭くない」、 観測の入口として機能) | CEO smoke + Alter voice constraints 遵守 |
| **3** | LLM 応答時間 ≤ 3 sec (= UX 劣化 threshold) | response time 計測 |
| **4** | chip 提示 3-5 件 (= 過剰でも過少でもない) | LLM output validation |
| **5** | 1tap → anchor 作成成功率 ≥ 95% (= friction なし) | manual smoke + error rate |
| **6** | regression test 全 PASS (= 永続規約遵守) | CI |
| **7** | post-check 全違反 0 件 (= 警告系文言不在、 generation 文言不在) | post-check audit |

### 3.3 思想 success (= Aneurasync 中心問い接続)

- 「自分って、 そういう人間だったのか」 への接続: empty 日への Alter 質問 → user 回答 = 自己観測の入口
- 「観測の幕間」 = 質問前は静か、 modal 閉じれば静か (= 邪魔しない UX)
- 「観測中の hover」 = chip hover で brand color 維持 (= 観測中 identity)
- 「観測の幕間 focus」 = chip focus で slate (= 規約 24-extended 継承)

---

## 4. Failure Scenario

### 4.1 想定失敗パターン + fallback

| # | failure | fallback / 対応 |
|---|---|---|
| **1** | LLM 応答 timeout (= 3 sec 超過) | skeleton + 「Alter は今日少し時間がかかります」 等の自然 fallback、 modal 閉じ自由 |
| **2** | LLM 応答内容違反 (= 警告文言 / amber 等) | post-check で検出 → 再生成 (= P4 safety layer pattern 継承) → 3 回失敗で fallback message |
| **3** | LLM cost cap 超過 (= token / 回数) | hard cap で block、 「Alter は今日休んでいます」 等の自然 fallback |
| **4** | privacy 漏洩 (= 送信 data に過剰情報) | dataSurface 制限設計、 送信前 audit |
| **5** | user の質問拒否 (= modal close) | 何も起きない (= 観測の幕間遵守、 押し付けない) |
| **6** | 1tap → anchor 作成 API error | error toast + manual fallback (= AddAnchorModal 通常起動) |
| **7** | empty 日 ≠ empty 判定誤り (= anchor 0 件だが ALTER flow が起きない / 起きすぎ) | empty 判定 spec 明示 + regression test |
| **8** | Alter modal 起動と既存 Add Anchor flow 衝突 | empty vs filled 日で UX 分離設計 |
| **9** | mobile / desktop UX 不整合 | responsive 設計、 manual smoke |
| **10** | a11y 違反 (= keyboard focus 不可能、 screen reader 非対応) | focus-visible + ARIA、 規約 24-extended 継承 |

### 4.2 fail-safe 設計原則

- **fail-open**: LLM 失敗時は ALTER flow 全体を skip、 通常 AddAnchorModal が動く (= empty 日 tap が壊れない)
- **post-check 多段**: P4 safety layer pattern (= prompt 監査 + 応答 post-check + 違反時 fallback) 継承
- **observation only fallback**: LLM 完全 down 時は「○○日は何もない日です」 等の中立観測 message のみ
- **user 選択尊重**: 強制提案 / pop-up 押し付けゼロ (= modal close 自由)

### 4.3 思想 failure (= 思想違反パターン)

| # | 思想 failure | 検出方法 |
|---|---|---|
| **1** | Alter が「おすすめ」 と言う | post-check + regression test grep |
| **2** | empty 日が「埋めるべき空白」 と語られる | UI copy 監査 |
| **3** | 「最適化」 「効率化」 文言が混入 | prompt 監査 + post-check |
| **4** | 押し付けがましい modal (= close 困難) | UX manual smoke |
| **5** | Alter が user の選択を否定 (= 「それより…」) | prompt 監査 + post-check |

---

## 5. 既存 docs / handoff / N completion audit との整合

### 5.1 N completion audit `95d15ea6` §3.3 (= 本 readiness の根拠)

引用:
> N-3: empty day → ALTER flow readiness + implementation
> - 予定なし日タップ → ALTER 自然質問
> - 提案チップ → おすすめ提案 (= タイトル + 画像) → 1tap で予定作成
> - Stargazer / Alter engine 接続が必要 (= 大型設計)
> - これは「Stargazer pivot」 ではなく「Plan 内で既存 Stargazer engine を呼ぶ統合」
> - 但し engine 接続範囲、 fail-safe、 privacy、 cost cap 等が必要
> - readiness audit で実装可否判定 + scope 確定

→ **本 readiness audit は全項目をカバー** (= scope §1 / invariants §2 / success §3 / failure §4 / 接続範囲 §7)。

⚠️ 注意: N completion audit 引用には「**おすすめ**提案」 という文言があるが、 これは handoff doc §A-3 の「**おすすめ**」 禁止と矛盾する可能性。 §1.3 で哲学的境界として CEO 判断項目に明示。

### 5.2 handoff doc `93677713` §A-2 (= 順序)

引用:
> N-3 | 空き日 → ALTER flow readiness + implementation。 勝手に defer しない。 CEO 明示 defer がない限り実装対象

→ readiness audit 着手 = 順序通り。 「勝手に defer しない」 を遵守 (= 本 doc で CEO 判断項目として明示)。

### 5.3 handoff doc §A-3 (= Counter-Factual 区別)

引用:
> 禁止: Counter-Factual generation / AI が別の 1 日を提案すること / 「おすすめ」 「こっちの方が良い」 「最適化」
> 許可: Counter-Factual Observation / 選ばれなかった余地の観測 / 選択構造差分観測

→ N-3 の境界線判断 (= §1.3) に直接接続。 解釈 B / C を採用し generation 表現を避ける設計が前提。

### 5.4 handoff doc §B-5 (= 永続禁止リスト) + N completion audit §7

→ 本 readiness audit §2.2 で全項目を invariants として継承。

### 5.5 既存 Stargazer / Alter engine 資産 (= MEMORY.md 由来)

| 資産 | path / 概要 | N-3 への流用候補 |
|---|---|---|
| **Daily Guidance Engine** | `app/api/stargazer/alter/route.ts` + Daily Guidance 内部、 6 モード (recover/reset/advance/maintenance/social/explore) | empty 日への質問 pipeline 直接流用候補 |
| **Home Alter 判断エンジン** | `lib/stargazer/alterHomeAdapter.ts` (= ActionShape + ForceBalance) | chip 構造化に流用 |
| **Ambiguity Engine** | 6 ドメイン検出 + 曖昧性スコア + 3 応答モード (conclude/branch/clarify) | empty 日の曖昧質問処理に流用 |
| **Relational Lens** | 5 変数 (target_role / interaction_purpose / etc.) | social 提案時に流用 |
| **Heart Dynamics Model v1** | Phase 0-5 + 5 レンズ + Negative Capability | LLM 出力品質保証に流用 |
| **P4 Safety Layer** | adopted / weakened / rejected + post-check 4 カテゴリ + fallback 再生成 | failure §4.2 fail-safe に直接流用 |
| **PE (Perspective Engine)** | Web 検索統合、 P1.8 closed | N-3 では使用しない (= scope 外、 LLM 内 inference のみ) |
| **Episodic Recall Phase 1** | 想起設計、 未実装 | N-3 では使用しない (= 未実装、 別 phase) |

→ N-3 は **新規 engine 構築なし**、 既存 engine の **Plan empty 日 への接続のみ** が中心。

### 5.6 CLAUDE.md 思考原則 + Aneurasync 中心問い

- 中心問い: 「この機能は、 ユーザーの第二の自己として必要か?」
- 最高体験: 「自分って、 そういう人間だったのか」 とユーザー自身が気づく瞬間
- 判断基準: ①判断原理に近づける ②変化の法則を掴める ③再現精度が上がる ④自己理解が深まる ⑤深い観測に繋がる

→ N-3 「empty 日 → ALTER 自然質問」 は判断基準 ④ ⑤ に直接接続。 「user が普段選ばない日にどう振る舞うか」 = 自己理解の深い観測機会。

### 5.7 N-2 規約 24-extended との接続

- N-3 で新規追加する UI は規約 24-extended 遵守 (= focus-visible: + slate-*)
- 既存 40 件 regression test の TARGET_FILES に新規 component 追加
- brand color (= indigo, purple) は selection state / mouse hover のみ許可

---

## 6. 既存資産 inventory (= 利用可能 + 接続点)

### 6.1 既存 file path (= 接続候補)

| file | 役割 | N-3 接続 |
|---|---|---|
| `app/api/stargazer/alter/route.ts` | Home Alter API | empty 日 query 受付 + 応答 |
| `lib/stargazer/alterHomeAdapter.ts` | ActionShape + ForceBalance + reconcile + prompt | chip 構造化 |
| `app/(culcept)/plan/tabs/CalendarTab.tsx` | Calendar UI (= empty 日識別必要) | empty tap handler 追加 |
| `app/(culcept)/plan/tabs/FlowTab.tsx` | Flow UI (= 「予定なし」 inline button あり) | 既存 button を Alter flow に接続 |
| `app/(culcept)/plan/tabs/MapTab.tsx` | Map UI (= empty 日 判定必要) | empty 識別 + tap handler |
| `app/(culcept)/plan/components/AddAnchorModal.tsx` | anchor 作成 modal | 1tap pre-fill 接続 |
| `app/(culcept)/plan/components/AnchorFormFields.tsx` | anchor form (= wave 3 frozen) | 不変、 pre-fill 経由のみ |
| (新規) `app/(culcept)/plan/components/EmptyDayAlterModal.tsx` 等 | empty 日 Alter modal | 新規 UI、 規約 24-extended 遵守 |

### 6.2 新規追加が必要な範囲

- empty 日識別 logic (= 既存 anchor 0 件判定 + sparse 日 / 完全 empty 日 の区別)
- Alter modal UI (= 既存 AlterModal 流用 or 新規、 design 決定要)
- chip 提示 UI (= 3-5 件、 ActionShape ベース)
- 1tap → AddAnchorModal pre-fill 接続 (= title + 暫定時刻 inject)
- regression test (= empty 日 flow + post-check + 規約 24-extended)

### 6.3 不変対象 (= 触らない)

- wave 1/2/3/3a frozen file (= AnchorFormFields / ProposalChip / PlaceCandidatesPanel / focus regime tests)
- M phase 各 file (= disclosure / feasibility / display)
- L phase 各 file (= transport / movement)
- 既存 anchor 作成 flow / API / DB

---

## 7. 接続範囲設計案 (= 概観、 詳細は plan audit 段階)

### 7.1 data flow

```
[Plan empty 日 tap]
       ↓
[EmptyDayAlterModal 起動]
       ↓
[user 自由記述] → [/api/stargazer/alter/route.ts (POST、 既存)]
       ↓
[Daily Guidance Engine 呼出 (= 既存)]
       ↓
[ActionShape + ForceBalance で構造化 (= 既存)]
       ↓
[post-check (= P4 safety layer pattern 継承)]
       ↓
[chip 3-5 件 返却]
       ↓
[user chip tap]
       ↓
[AddAnchorModal pre-fill (= 既存 modal 流用)]
       ↓
[user 微調整 + 保存]
       ↓
[anchor 確定 (= 既存 flow)]
```

### 7.2 privacy 設計原則 (= dataSurface 最小化)

LLM に送る data:
- user_id (= 既存 auth 経由)
- 対象日付 (= YYYY-MM-DD)
- user の自由記述 (= 質問への回答)
- (optional) 周辺日の anchor 概要 (= context、 但し dataSurface 制限)

LLM に送らない data:
- 詳細 anchor list / 場所 / 時刻 (= 周辺日除く)
- user の他 plan 情報
- Stargazer profile 詳細 (= 既存 alter engine 内で参照、 LLM への直接 surface はしない)
- DB / localStorage / 外部 service data

### 7.3 cost cap 設計案

- 1 empty 日 tap = 最大 1 LLM call (= chip 生成)
- 同 user 同 day で 5 回以上 = 24h cooldown
- token budget: 入力 1500 + 出力 500 = hard cap
- daily quota / monthly quota (= infra layer で実装、 詳細 plan audit 段階)

### 7.4 fail-safe 設計案

P4 safety layer pattern 継承:
- gate (= empty 日判定 + auth + cooldown) → micro-LLM (= prompt 監査) → safety (= post-check 4 カテゴリ) → integration decision (= adopted / weakened / rejected) → user 提示

違反時 fallback:
- 警告系文言 / generation 違反 → 再生成 (= 最大 3 回) → 失敗時自然 fallback
- timeout → skeleton + 「Alter は今日少し時間がかかります」 message
- complete failure → 通常 AddAnchorModal が起動 (= fail-open)

---

## 8. 実装可否判定 + risk 評価

### 8.1 実装可否

| 軸 | 判定 | 根拠 |
|---|---|---|
| 技術可否 | ✅ 可 | 既存 Stargazer engine + P4 safety layer + AddAnchorModal が使える |
| 思想可否 | ⚠️ CEO 判断要 | scope の哲学的境界 (= §1.3) で判断分岐 |
| 規模 | 大 (= 新規 modal + Plan 3 tab 接続 + privacy/cost/fail-safe 設計) | 1 wave で完了せず、 sub-phase 分割が必要 |
| risk | 中 | 既存 engine 流用で新規構築は限定的、 但し UX 設計が中心 |

### 8.2 risk 詳細

| risk | level | mitigation |
|---|---|---|
| Counter-Factual generation 禁止違反 | high | scope §1.3 で CEO 判断、 prompt 監査 + post-check |
| 「おすすめ」 「最適化」 文言混入 | high | post-check + regression test grep |
| privacy 漏洩 | medium | dataSurface 制限 + audit log |
| cost cap 超過 | medium | hard cap + cooldown |
| UX 押し付け (= modal 強制) | medium | close 自由 + 観測の幕間遵守 |
| 既存 anchor flow 破壊 | low | empty 日のみ、 filled 日は不変 |
| 新規 component 規約違反 | low | 規約 24-extended 継承 + regression test |

### 8.3 sub-phase 分割案 (= 自律提案、 plan audit 段階で確定)

| sub-phase | 内容 | 規模 |
|---|---|---|
| N-3-1 | empty 日識別 logic + 既存 tab に empty 判定追加 (= UI 変更なし、 logic のみ) | 小 |
| N-3-2 | EmptyDayAlterModal UI 設計 + LLM 接続なし dry-run | 中 |
| N-3-3 | /api/stargazer/alter/route.ts 既存 endpoint への empty 日 mode 追加 | 中 |
| N-3-4 | post-check + safety layer (= P4 pattern 継承) | 中 |
| N-3-5 | 1tap → AddAnchorModal pre-fill 接続 | 小 |
| N-3-6 | regression test + manual smoke | 中 |
| N-3-7 | N-3 closeout audit | 小 |

→ **連続 GO 不可** (= 大型設計、 各 sub-phase で CEO smoke 必須)。

---

## 9. CEO 判断項目 (= 報告で停止)

### 9.1 N-3 全体方針

| # | 判断項目 |
|---|---|
| **1** | N-3 を /plan 内で実装するか / 別軸 (= Stargazer 単独 phase) で扱うか / 明示 defer か |
| **2** | scope §1 の範囲で OK か、 縮小 / 拡大か |
| **3** | scope の哲学的境界 (= §1.3): 解釈 B (= 観測の入口 + user 選択) / 解釈 C (= 観測補助のみ) / 解釈 A 含む再定義 |

### 9.2 sub-phase 分割

| # | 判断項目 |
|---|---|
| **4** | sub-phase 分割案 §8.3 で OK か、 統合 / 細分化か |
| **5** | sub-phase 順序 (= N-3-1 → N-3-7 の自然順序か、 並列可能性か) |

### 9.3 進行判断

| # | 判断項目 |
|---|---|
| **6** | 本 readiness audit 着地後 → N-3 plan audit に進むか / 報告で停止か |
| **7** | 連続 GO 判定 (= 自律推奨: 不可、 各 sub-phase で CEO smoke 必須) |

### 9.4 別論点 (= 本 readiness と分離)

- **branch merge 戦略**: wave 1/2/3/3a + closeout + 各 docs branch 計 63 frozen branches の main merge 戦略は別論点。 N-3 readiness とは独立で CEO 判断。

---

## 10. 進行禁止リスト (= N completion audit §7 継承 + N-3 固有追加)

### 10.1 永続禁止 (= 全 N phase 継承)

- Arrival Risk Memory
- warning / recommendation / optimization 文言
- amber / orange / red / icon / badge / warning box
- localStorage / persist
- DB / env / package / dependency 変更
- runtime telemetry sink
- fetch / push / gh / reset / restore / stash / branch delete
- Counter-Factual generation (= scope §1.3 で CEO 判断後確定)
- Routes API / 実 API 連携
- Deploy readiness / Stargazer pivot / Rendezvous / Genome pivot / 初期ユーザー獲得

### 10.2 N-3 固有禁止 (= 本 readiness で確認)

- 既存 wave 1/2/3/3a frozen file への追加変更 (= 規約 24-extended 違反復活禁止)
- M phase / L phase 各 file の追加変更
- 「Alter おすすめ」 「最適化」 「効率化」 「こっちの方が良い」 文言
- 強制 modal pop-up (= modal close 自由を破る UX)
- empty 日を「埋めるべき空白」 と framing する文言

### 10.3 本 readiness audit で禁止 (= 実装はまだ)

- 実装着手 (= 新規 file 作成、 既存 file 改変)
- N-3 plan audit への独断進行 (= CEO 承認後のみ)
- branch merge (= 別論点として分離)

---

## 11. 結論

### 11.1 readiness 判定

| 軸 | 判定 |
|---|---|
| 既存資産で実装可能か | ✅ Yes (= Stargazer engine + P4 safety + AddAnchorModal 流用) |
| 思想整合か | ⚠️ 解釈 B / C なら整合、 解釈 A は generation 違反 |
| 規模 | 大 (= 7 sub-phase 分割、 連続 GO 不可) |
| risk | 中 (= 既存 engine 流用で限定、 UX 設計が中心) |
| **総合** | **CEO 判断後に N-3 plan audit へ進める状態** (= readiness 完了) |

### 11.2 次のアクション (= CEO 判断待ち)

1. CEO が §9 の判断項目に回答
2. 解釈 B / C 採用 + scope 確定なら **N-3 plan audit 着手** (= 別 branch、 sub-phase 詳細設計)
3. 解釈 A 含む再定義 / 別軸 / 明示 defer なら **本 readiness で停止**
4. branch merge 戦略は別論点として CEO 判断

### 11.3 自律推奨 (= 思考原則 ⑤ ゴールから逆算)

- /plan complete までの最短経路: N-3 (= 本 phase) → N-4 → N-5
- N-3 を defer すると /plan complete も不可 (= N completion audit §4.2「明示 defer」 でないと complete 不可)
- 但し scope を解釈 C (= 観測補助のみ) に縮小すると、 「empty day → ALTER 質問のみ、 提案 chip なし」 で N-3 を最小 scope で着地させる選択肢あり
- **自律推奨: 解釈 B (= 観測の入口 + user 選択尊重) 採用 + sub-phase 分割実装** (= 思想整合 + 体験充実の balance)

---

**完了**: Phase 3-N-3 Readiness Audit。 実装変更 0、 frozen branches 追加 commit 0、 既存 file 改変 0。 CEO 判断待ち (= §9 の 7 項目)。 別論点 (= branch merge 戦略) は分離報告。
