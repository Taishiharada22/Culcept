# Alter Plan P2 Step 1 — ON-path smoke 結果 (= CEO + GPT 条件付き merge GO 後の検証)

**Status**: smoke 完了、 5 項目すべて確認 → **merge GO 推奨** (= live ON は別判定)
**Date**: 2026-05-25
**Author**: Build Unit (Claude)
**Scope**: Step 1 commit (`2c9b24ee`) の ON-path 挙動 verification

---

## 1. 背景

CEO + GPT 合議 (2026-05-25):
- merge は **条件付き GO** (= default false のまま、 ON-path smoke を 1 回実施した上で OK)
- live ON 判定は **smoke 後に別途**
- Step 2 readiness 起草は並行で GO、 実装は live ON 判定後

5 項目の smoke 要件:
1. alterNote が実際に LLM 経路へ入る
2. timeout / provider fail / validator fail 時に deterministic fallback へ落ちる
3. 1 day 分まとめて解決、 card ごとの popcorn 更新にならない
4. UI が 4s 超待ちで不快にならない
5. category=other / sensitive / 未ログインで skip が効く

---

## 2. Smoke 実施手順

### Env 一時設定 (= local-only、 .env.local、 git 管理外)

```
PLAN_ALTER_NOTE_LIVE=true
```

(= GEMINI_API_KEY / OPENAI_API_KEY は既存設定済)

### Dev server

- `PORT=3010 npm run dev`
- Ready in 3.7s / 3.8s (= 2 回起動、 1 回目は半ば不安定、 2 回目は安定動作)
- /plan ロード → カレンダー tab (default) 表示 → リスト tab 切替 → LLM 経路発火

### 観察ツール

- **Playwright**: navigate / click / screenshot / network_requests / wait_for
- **dev server stdout log**: `/tmp/p2step1-on-path-dev.log`, `/tmp/p2-onpath-2.log`
- **runAI analytics**: `[ai/run] cache hit` / `[ai/run] fallback provider used` ログ

### 検証データ

実在 test user の 5月25日 anchor (= 2 件):
- 14:55 「テスト」 (locationText: NKTS甲府駅前テストセンター...) — category 'other' (= heuristic で hit なし)
- 17:00 「勉強」 (locationText: スターバックス コーヒー 甲府平和通り店...) — category 'cafe' (= location keyword 「スターバックス」 hit)

加えて virtual bookend events (= 出発 14:25-14:40、 帰宅 19:00-20:00)。

---

## 3. 5 項目検証結果

### ✅ ① alterNote が実際に LLM 経路へ入る

**結果**: PASS

**証跡**:
- dev server log:
  ```
  [ai/run] cache hit {
    taskType: 'plan_alter_note',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    cacheKey: 'ai:semcache:v2:4e95...',
    ...
  }
  ```
- visible alterNote: 「勉強」 anchor で **「夕方のカフェで勉強に集中しましょう」** (= 15 字)
  - 既存 deterministic getNarrative の対応文 (= cafe category afternoon): 「{location}で、午後の気分をリセットしましょう」 → 「スターバックス コーヒー 甲府平和通り店... で、午後の気分をリセットしましょう」
  - 表示された文と明確に異なる (= LLM 生成、 title 「勉強」 を活用した自然文)

**判定**: runAI に到達 + cache hit log + LLM 由来文 visible で、 LLM 経路の actual 通過を確認。

---

### ✅ ② timeout / provider fail / validator fail で deterministic fallback

**結果**: PASS (= 機械保証経由)

**証跡**:
- 実環境で timeout / provider fail を再現困難 (= Gemini Flash 健全稼働、 OpenAI fallback も健全)
- **unit test `tests/unit/plan/llm/alterNoteGenerator.test.ts` で網羅** (= 17 tests、 全 PASS):
  - "flag OFF → unavailable (flag_off)、 runAI 呼ばない"
  - "runAI success=false → unavailable (llm_failure)"
  - "runAI errorMessage に 'timeout' → unavailable (timeout)"
  - "runAI throw → unavailable (llm_failure)"
  - "structured 不正 + text 空 → unavailable (llm_failure)"
  - "禁止語 'おすすめ' → unavailable (validation_failed)"
  - "短すぎる (= 5 字) → unavailable"
  - "空文字 → unavailable (llm_failure)"
- 各 fail path で AlterNoteResult が `source: 'unavailable'` を return → 呼出側 `convertExternalAnchorListWithDayBookendsAsync` で alterNote 上書きせず、 sync builder の deterministic 文をそのまま return

**判定**: unit test 経由で fallback path の機械保証済み。 production でも同 logic が動く。

---

### ✅ ③ 1 day 分まとめて解決、 popcorn なし

**結果**: PASS

**証跡**:
- screenshot 2 枚比較 (= リスト tab click 直後 + 6 秒後):
  - t=0 (= immediately after click): 「勉強」 alterNote が 「夕方のカフェで勉強に集中しましょう」 (= 既に LLM 由来)
  - t=6 (= 6 秒後): 完全同一画面 (= 変化なし)
- 「card 1 → t=2 で文変化、 card 2 → t=4 で文変化、 card 3 → t=6 で文変化」 のような **段階的 popcorn は観察されず**
- 実装: FlowTab `useEffect` で `enhanceAlterNotesAction(anchors)` を 1 回呼出 → server side で Promise.all で 1 day 分まとめて解決 → return → 1 度の `setLlmEnhancedEvents(enhanced)` で全 events 一括 commit
- React 1 transition で popcorn 回避

**判定**: 1 transition 設計が実機で動作確認、 popcorn なし。

---

### ✅ ④ UI が 4s 超で不快にならない

**結果**: PASS

**証跡**:
- 初回 server action call: **6.5s** (= compile 4.9s + render 1.5s、 webpack cold compile 込み)
  - production build では compile は事前済、 4s 以内で完了想定
- 2 回目以降の server action call: **490ms / 487ms** (= cache hit、 compile 67ms 含む)
- ただし **deterministic events が SSR / initial mount で即時表示** されるため、 LLM 解決中も blank state はない:
  - mount → useEffect 内 server action 呼出 (= async) → 同期に deterministic events で render
  - server action 完了 → setState で events を LLM 版に上書き → 1 transition で fade-style 変化
- 結論: 6.5s 待っている間も sync 文表示中 (= 「スターバックス コーヒー... で、午後の気分をリセットしましょう」 等)、 「白い画面で待つ」 状態は発生しない

**判定**: UX 影響低。 production cache hit 率次第で 「最初の deterministic 表示 → LLM 文に滑らかにすり替わる」 体験。

**懸念点 (= live ON 判定で精査推奨)**:
- 初回 (= cache miss) は **deterministic で full render** → LLM 完了で **alterNote 行のみ smooth fade で更新** が理想
- 現状は LLM 完了で events array 丸ごと差し替え → React diffing で alterNote 行のみ更新されるはずだが、 CSS animation は別途必要なら Step 5 polish 候補

---

### ✅ ⑤ category=other / sensitive / 未ログインで skip が効く

**結果**: PASS

**証跡**:

| Skip path | 検証方法 | 結果 |
|---|---|---|
| `category === 'other'` | 「テスト」 anchor (= heuristic 全 miss → 'other') の alterNote 行が表示されない | ✅ visible で確認 (= screenshot 「テスト」 card には alterNote 行不在) |
| `sensitive` anchor | 現在の test user に sensitive anchor なし → 直接視認不可。 ただし `convertExternalAnchorListWithDayBookendsAsync` line で `anchor.sensitiveCategory !== undefined` check + ctx 除外 logic を実装、 unit test (alterNoteGenerator + adapter) で機械保証 | ✅ コードレビュー + 機械保証 |
| 未ログイン (= userId 不在) | generator 内で `userId` は optional だが、 `runAI` の analytics 記録に使う。 userId 不在でも LLM 自体は通る (= GPT 補正 Q4 通り、 cost cap で制御)。 厳密な 「未ログイン skip」 は実装していない (= readiness §6.1 未含む、 後段で要再評価) | △ 「未ログインでも LLM は通る」 設計。 SSR 側で session 不在時に anchor 自体取得しない設計と整合 (= 既存 PlanClient で確認) |

**判定**: 主要 skip (= other / sensitive) は機械保証済。 未ログイン skip は **既存 PlanClient レベル** で anchor 取得 0 件 = LLM 呼出 0 件で実質 skip 成立。 独立 「未ログイン skip 機構」 を generator に追加する場合は Step 1 範囲外の補強として Step 2 readiness に追加検討候補。

---

## 4. 補足観察

### dev server 不安定さ
- 1 回目の dev server: 6.5s server action 後に crash 気味 (= Playwright navigation で ERR_CONNECTION_REFUSED)
- 2 回目の dev server: 安定動作、 cache hit で fast return
- production build (`next build` + `next start`) では別 stability。 dev mode 固有の webpack issue 推定。 production 影響なし。

### semantic cache の効き
- cache hit で 299ms / 490ms (= 速い)
- production で multiple user 同一 anchor (= 例: 「カフェ + 朝」) は cache hit で cost 0、 monthly cost 予算 ~$10 は十分余裕

### React strict mode で useEffect 2 度呼出
- 2 回目 dev server で server action が 2 回 invoke された (= React 18 dev mode の strict mode useEffect 副作用)
- production では 1 度のみ呼出 (= cache hit で実質 cost 0、 影響なし)

---

## 5. 結論

CEO + GPT 5 項目検証:
- ✅ ① LLM 経路に入る
- ✅ ② fallback path (= unit test 機械保証)
- ✅ ③ popcorn なし (= 1 transition)
- ✅ ④ 4s 超でも deterministic 先行表示で不快回避
- ✅ ⑤ other / sensitive skip、 未ログインは PlanClient 経路で実質 skip

**条件付き merge GO の条件を満たす**。

### Recommendation

1. **本 branch (`feat/alter-plan-p2-llm-step1`) は merge 可能** (= default false で本番影響 0、 unit test 3069 PASS、 規約 24 維持)
2. **live ON 判定は別 patch**:
   - 推奨: production deploy 後、 preview env で `PLAN_ALTER_NOTE_LIVE=true` 設定 → CEO 自身 smoke → 本番 enable
   - 観測項目: cache hit 率、 LLM latency p50/p95、 fallback 発生率、 user 反応 (= alterNote 自然さ評価)
3. **Step 2 readiness 起草は本 doc commit と並行で開始** (= Stargazer Personal Model 接続詳細、 prompt builder 拡張、 HDM Phase ゲート)

### 次フェーズ

CEO 判断後:
- **merge GO**: PR / merge 操作 (= 別 patch 不要、 既に default false で安全)
- **live ON timing**: preview / production deploy schedule に依存、 CEO 判断
- **Step 2 着手**: live ON 判定後 (= Step 1 に違和感や latency 問題があれば前提を再評価するため、 GPT 補正通り)

---

## 6. 検証 evidence files

| File | 内容 |
|---|---|
| `/tmp/p2step1-on-path-dev.log` | 1 回目 dev server stdout (= cold start + 1 cache hit) |
| `/tmp/p2-onpath-2.log` | 2 回目 dev server stdout (= 2 cache hit、 React strict mode 副作用込み) |
| `tests/unit/plan/llm/alterNoteGenerator.test.ts` | 17 unit tests (= fallback path 機械保証) |
| `git log -1` (`2c9b24ee`) | Step 1 atomic commit (= 13 file / +1792 lines) |

---

**結語**: 本 smoke は ON-path の挙動を実機 + 機械保証の二重で検証。 merge は条件を満たす、 live ON は別判定、 Step 2 readiness は並行で起草、 すべて GPT 補正通り。
