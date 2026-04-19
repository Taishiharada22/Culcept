# CoAlter Phase 2 — Preview シナリオ (1 枚)

最終更新: 2026-04-19 (misread detector Phase A 接続と同時に作成)
目的: **card 付き新規 invoked sessions 30 件** を効率よく積み、3-mode
(decision / negotiate / clarify) の実運用分布を観測可能にする。
Phase 3 判断の本番データを取るための「投入ガイド」。

---

## 前提

- **本カウント開始条件**: misread detector (Phase A) 接続後の新規 card セッションから数える。
- **対象ユーザー数**: 3〜5 人 (知人・招待制)。一人あたり 1〜3 ペアで複数回起動を許容。
- **対象 thread**: Talk の 1:1 thread のみ (CoAlter は pair 前提)。
- **起動導線**: 既存の CoAlter ボタン (`components/coalter/CoAlterButton.tsx`)。新規 UI は作らない。
- **凍結線厳守**: `docs/coalter-phase2-freeze-checklist.md` の 6 項目に触れる変更は禁止。

---

## 狙う分布 (暫定)

観測仕様 (`docs/coalter-phase2-observation-spec.md`) の暫定閾値に揃える:

| mode | 目標比率 | 投入で狙うシナリオ数の目安 |
|------|---------|---------------------------|
| decision | 60-80% | 18-24 件 |
| negotiate | 10-25% | 3-8 件 |
| clarify | 5-15% | 2-5 件 |

合計 30 件到達を最低ラインとし、clarify と negotiate は各 2 件以上は確保する。
(router 仕様上、misread 検出なしだと clarify が構造的に 0 になる → Phase A 接続が前提)

---

## シナリオ A — decision 系 (stall / default_decision を踏む)

狙い: router が最終的に decision に落ちる「通常の意思決定支援」ケース。KPI-1 decision 比率と AUX-1 stall_detected / default_decision の量を作る。

### A-1. 定番: 映画を決める (stall_detected)

> A: 土曜の映画どうする?
> B: うーん、何がいいかな
> A: 迷うね
> B: 何見たい気分?
> A: どっちでもいいかも
> B: 決められないな
> [CoAlter 起動]

期待:
- theme = "movie" → G6 通過、decision builder 起動
- stall_detected = true → reason="stall_detected"
- card.mode = "decision" / proposals > 0 (候補出る)

### A-2. テーマ外 (food) — theme_not_movie_yet fallback を踏む

> A: 今日の夕飯どうしよう
> B: 家にあるもので何か作る?
> A: うーん、ちょっと面倒
> B: じゃあ出る?
> [CoAlter 起動]

期待:
- theme = "food" → executorFallbackReason="theme_not_movie_yet"
- card.mode = "decision" (fallback)
- KPI-3 theme_fallback_rate_pct にカウントされる
- **注**: food 実行路は Phase 3 候補なので、現時点は decision fallback で正常

### A-3. 短い雑談 → 起動 (default_decision)

> A: 金曜 暇?
> B: 空いてるよ
> A: なんかする?
> [CoAlter 起動]

期待:
- stall も contradiction も misread も発火しない
- reason = "default_decision"
- card.mode = "decision"

---

## シナリオ B — negotiate 系 (contradiction_detected)

狙い: `detectContradiction` を確実に発火させる。KPI-6 (negotiate proposals=0 率) を観測可能にする。

### B-1. 軸 quietness 対立

> A: 今日は静かな店がいいな
> B: 静かな店はちょっと気分じゃない、賑やかな方がいい
> [CoAlter 起動]

期待:
- contradiction.detected = true / axes=["quietness"]
- reason = "contradiction_detected"
- card.mode = "negotiate"
- interests / pieExpansion が埋まる

### B-2. 軸 access 対立

> A: 近場がいい、移動したくない
> B: たまには遠出したい、ドライブしよう
> [CoAlter 起動]

期待:
- contradiction.axes=["access"]
- card.mode = "negotiate"

### B-3. 軸 novelty 対立

> A: 新しい店に行ってみたい
> B: 新しい店はハズレが怖いから定番がいい
> [CoAlter 起動]

期待:
- contradiction.axes=["novelty"]
- card.mode = "negotiate"
- **注**: theme によっては theme gate で decision fallback されるので、movie テーマと組み合わせるのが確実 (「映画の好みで novelty 対立」)

---

## シナリオ C — clarify 系 (misread_dominant) 【Phase A 接続後のみ有効】

狙い: `detectMisread` を発火させ、clarify builder を走らせる。KPI-7 (clarify question=null 率) を観測可能にする。

> **⚠ 重要 (2026-04-19 実機確認済み)**: clarify シナリオは **必ず movie テーマと組み合わせること**。
> theme !== "movie" のとき `coalterDispatch.ts` の G6 theme gate が `executorFallbackReason=theme_not_movie_yet` で decision fallback するため、router が clarify を選んでも **ClarifyCard は絶対に出ない**。
> routerTrace.selectedMode="clarify" のログは残るが UI は decision (空 candidates) になる。
> この挙動は Phase 2 凍結線 #1 (`isExecutorThemeEnabled`, G6 movie 先行) の仕様どおり。

### C-1. 明示的困惑語 (confidence 0.8)

> A: 土曜の映画どうする?
> B: コナンにしよう
> A: いいね、そうしよう
> B: え?どういうこと? 見に行くってこと?
> [CoAlter 起動]

期待:
- theme = "movie" → G6 通過
- misread.confidence = 0.8
- reason = "misread_dominant"
- card.mode = "clarify"
- pointList / neutralTranslation が埋まる / question?.length >= 0

### C-2. 連続質問 (confidence 0.7)

> A: 今週末の映画、いつ観る?
> B: まあね
> A: 結局いつ観るの?
> [CoAlter 起動]

期待:
- theme = "movie"
- misread.confidence = 0.7
- card.mode = "clarify"

### C-3. topic drift (confidence 0.6)

> A: 予算は安い方がいい
> B: 上映時間は長いのが好き
> [CoAlter 起動]

期待:
- theme = "movie" (上映時間で拾える)
- misread.confidence = 0.6
- card.mode = "clarify"

---

## 投入ガイドライン

### 1 セッション 1 テーマ

- CoAlter は session 単位で mode が決まる。複数起動は別 session として動く。
- 1 ユーザー 1 日 2-3 起動までが自然 (過剰投入は母数の質が下がる)。

### テーマ分布

- movie を 60% 以上にする (G6 のため、それ以外は自動で decision fallback)。
- food / travel / activity は 30% を上限に「fallback を踏むシナリオ」として混ぜる (KPI-3 観測のため)。

### 起動タイミング

- 膠着 (3 ターン以上決着なし) してから起動する。
- 明示困惑が出たら即起動 (clarify が狙える)。
- 対立が明確になったら起動 (negotiate が狙える)。

### 禁止投入

- emotion_heat_high になるような攻撃的 / DV 疑いの会話 (gate でブロックされるのは正常だが、不要な block 率上昇は KPI-2 を歪める)。
- CoAlter が既に active のセッションでの再起動 (既に 409 で弾く仕様)。

---

## 投入チェックリスト (投入前に見る)

- [ ] misread detector Phase A が接続済み (engine.ts L326)
- [ ] 最新 build が動作中 (staging or local preview)
- [ ] 対象ユーザーに「観測中である」ことを事前共有済み
- [ ] CoAlter 同意フロー (accept) 完了済みペアであることを確認
- [ ] 投入開始日時を記録 (Phase 3 gate の「preview 投入後 3 日」起算点)

> **preview counting started at 2026-04-19 21:16 JST, baseline commit = f5f88e09**
> 途中観測: card 付き新規 invoked sessions 10 件到達時点で軽い確認 (KPI-1 / KPI-6 / KPI-7 / AUX-1 のみ)。
> 本番 gate: 30 件 or 3 日経過の早い方で `scripts/coalter-phase2-kpis.sql` 全 KPI 再実行。

---

## 観測タイミング

CEO 固定条件 (Phase 3 gate):

**再観測の発火条件 (どちらか早い方)**
1. card 付き新規 invoked sessions が **30 件** 到達
2. preview 投入後 **3 日経過**

到達時に `scripts/coalter-phase2-kpis.sql` を再実行 (7 KPI + 4 AUX)。
評価対象は observation spec (`docs/coalter-phase2-observation-spec.md`) の閾値。

---

## 投入前の sanity check (最小 6 項目)

preview 開始前、staging で手動投入して以下を確認:

1. ✅ **2026-04-19 PASS** — misread 明示語 (「え?」) + movie テーマで clarify に落ちる (session b892a6d0, ClarifyCard UI 確認)
2. ✅ **2026-04-19 PASS** — contradiction (「静か vs 賑やか」) で negotiate に落ちる
3-a. ✅ **2026-04-19 PASS (mode 判定)** — stall (3 ターン膠着) で decision / reason=stall_detected に落ちる — **movie テーマ必須**
3-b. stall @ movie **candidate 品質** — 2 回目 invoke でも theme=movie を維持し、URL 付きの検証可能候補しか出ない。情報不足なら candidates=[] + safe fallback summary に落ちる
   - 2026-04-19 実測: session f2cd5a44 (2 回目 invoke) で theme=general に劣化し legacy LLM が stale titles (コナン/ゴジラ/ハイキュー) を幻覚した → CEO 採用案 A+C (soft theme sticky + legacy verified-only guard) 実装で修正 (本日)
4. ✅ **2026-04-19 PASS** — food テーマで decision fallback (executorFallbackReason=theme_not_movie_yet) に落ちる (session b892a6d0 実測済み)
5. 誤検知で clarify に偏っていない (通常会話 3-5 件で clarify 0 件)
6. soft theme sticky の副作用がない (食事/旅行など明確な他テーマに入れば即切り替わる)

### 3-b verification checklist (A+C 実装後に確認)

- [ ] 1 回目 invoke: theme=movie, candidates 通常通り (空でも OK)
- [ ] 2 回目 invoke (膠着続行): `metadata.card.theme === "movie"` を維持している (sticky 適用)
- [ ] 2 回目 invoke で reason=stall_detected (movie 維持により G6 通過)
- [ ] 2 回目 invoke の candidates: 全件 `url != null` または `candidates=[]`
- [ ] 空になった場合: `summary` に「上映館や時間帯をもう少し聞いてから戻ります」相当の文言
- [ ] routerTrace.previousMode = "decision"（前回から引き継ぎが効いている）

### clarify シナリオ必須条件 (2026-04-19 追記)

- **movie テーマ**と組み合わせること。食事/旅行等のテーマでは G6 で決済fallback され ClarifyCard は出ない。
- router は clarify を選んでいても UI が decision になるので、**scenarios.md C-1/C-2 の例文は必ず「映画」文脈で書く**。

---

## 参照

- 観測仕様: `docs/coalter-phase2-observation-spec.md`
- SQL 集: `scripts/coalter-phase2-kpis.sql`
- 凍結チェックリスト: `docs/coalter-phase2-freeze-checklist.md`
- 設計書: `docs/coalter-phase2-3mode-design.md`
- 実装: `lib/coalter/coalterDispatch.ts` / `lib/coalter/modeRouter.ts` / `lib/coalter/conversationParser.ts`
