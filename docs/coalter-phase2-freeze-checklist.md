# CoAlter Phase 2 — Freeze Checklist

最終更新: 2026-04-19（CEO 6.D 合格、本体完了判定後）
目的: Phase 2（3-mode: decision / negotiate / clarify）を **凍結線** に乗せる前に、CEO
指定の 5 項目を 1 枚で確認する。
凍結後はこの 5 項目を壊すような変更を禁止する。

---

## 到達した実装（参考）

| Phase | 範囲 | 状態 |
|-------|------|------|
| 6.A | pre-router gate / mode router / RouterTrace 構造 | 合格 |
| 6.B | tone modifier / conversation parser / negotiate & clarify builder | 合格 |
| 6.C | engine dispatch / UI discriminated union / metadata 永続化 | 合格 |
| 6.D | status API `activeCard` 復元 | 合格 |

---

## Freeze Checklist（5 項目）

### ① movie-first rollout が守られている

- **実装箇所**: `lib/coalter/coalterDispatch.ts` L141-143
  ```ts
  function isExecutorThemeEnabled(theme: ConversationTheme): boolean {
    return theme === "movie";
  }
  ```
- **挙動**: dispatch の Step 4 で `!themeOk` のときは `executorFallbackReason: "theme_not_movie_yet"` を立てて decision を返す（`coalterDispatch.ts` L185-197）。
- **テスト根拠**:
  - `tests/unit/coalter/coalterDispatch.test.ts` L325-388 の 3 ケース
    - theme=food + contradiction → decision (`theme_not_movie_yet`)
    - theme=food + misread → decision (`theme_not_movie_yet`)
    - theme=travel でも同じ挙動
- **trace 継続性**: theme gate でブロックされても RouterTrace は生成・記録される（router/modifier は先に走る）。

---

### ② food は decision fallback のまま

- **実装箇所**: ①と同じ theme gate。`ConversationTheme` 型 (`lib/coalter/types.ts` L234-241) の `"food"` は `"movie"` ではないので自動的に fallback 側へ落ちる。
- **テスト根拠**: `coalterDispatch.test.ts` L328-352, L355-371（food 指定で必ず `executorFallbackReason === "theme_not_movie_yet"` を検証）。
- **非破壊性**: food だけのコードパスは存在しない（mode 非依存 infra のため）。`"movie"` 判定を外した瞬間に food も通り抜けるが、現状は硬い 1 行で守っている。

---

### ③ negotiate / clarify が status 復元で崩れない

- **実装箇所**:
  - `lib/coalter/statusResolver.ts` — `metadata.card` を最優先で採用し、mode を潰さずそのまま返す。
  - `app/api/coalter/status/route.ts` L76-88 — レスポンスに `activeCard` を加算（`activeProposal` は並記）。
  - `hooks/useCoAlter.ts` — status / realtime 受信時に `currentCard` を更新（`deriveCard` は fallback 合成のみ）。
- **テスト根拠**: `tests/unit/coalter/statusResolver.test.ts`（10 ケース）
  - negotiate: `pieExpansion.axisShift`, `interests.a.nonNegotiable` が保存と一致
  - clarify: `pointList.facts`, `neutralTranslation.aToB` が保存と一致
  - 3 mode ループで「mode 非依存」を明示検証
- **Realtime 経路**: `hooks/useCoAlter.ts` の postgres_changes "UPDATE" ハンドラは `data.data.activeCard || data.data.activeProposal` の条件で発火するため、Phase 6.C 以降のセッションはリアルタイムでも復元される。

---

### ④ metadata.card / routerTrace の欠損時 fallback が安全

- **status 側（`statusResolver.ts`）**:
  - `metadata.card` が無い → `proposalCard` から DecisionCard を再合成し `usedFallback=true` を返す。
  - `metadata.card` の mode が未知値（例: 古い session の `"reflect"`）→ 同じく fallback。
  - `card` / `proposalCard` 両方欠損 → 全 null（例外を投げない）。
  - metadata が null / undefined でも例外にならない（`statusResolver.test.ts` で検証）。
- **engine 側（`lib/coalter/engine.ts` L469-551 `fetchPreviousCoAlterState`）**:
  - 過去 session が無い / messages が無い → `{ previousMode: null, previousClarifyTurns: 0, previousNegotiateNoProposal: false }` を返す。
  - `metadata.card?.mode` が取れないときは `metadata.routerTrace?.selectedMode` を二次参照。両方無ければ null。
  - 連続 clarify カウントは `card?.mode === "clarify"` が続く間のみ加算（最大 3 遡る）。
- **legacy session の互換**:
  - Phase 6.C 以前のセッション（`metadata.card` フィールド無し）が再読込されても、`statusResolver` が DecisionCard を合成するため UI 側は decision で表示できる。
- **副次効果**: router/gate/trace いずれも欠損で落ちる経路は無く、必ず null または初期値で続行される設計。

---

### ⑤ 既存 decision UX が壊れていない

- **UI 分離**:
  - `components/coalter/CoAlterCardDispatcher.tsx` は `card.mode === "decision"` を既存 `CoAlterCard` コンポーネントにそのまま流す（alias `CoAlterDecisionCardView` として import、実体は未改変）。
  - `app/(culcept)/talk/[threadId]/ChatClient.tsx` は `hasCard` → dispatcher、`!hasCard && hasProposal` → 従来 CoAlterCard の二段構え。
- **hook 契約**:
  - `useCoAlter.currentProposal` / `hasProposal` は維持。`projectToProposalCard` が negotiate/clarify のときもスタブを書き込むため、legacy client のプロパティ参照で落ちない。
- **decision テスト**:
  - `tests/unit/coalter/` 全 614 tests PASS（2026-04-19 時点）。
  - dispatch の E2E で decision 非破壊を確認（`coalterDispatch.test.ts` の decision ケース）。
- **metadata 非破壊**:
  - `app/api/coalter/invoke/route.ts` L122-134 は `proposalCard` を引き続き書き込み、`card / routerTrace / gateResult / executorFallbackReason` を加算。

---

## 凍結線（freeze 後の禁止事項）

凍結後に以下を変更する場合は、再度 freeze gate を通す：

1. `isExecutorThemeEnabled` の判定条件（movie 固定）
2. `coalterDispatch.ts` の 5 step の順序（gate → router → modifier → theme gate → executor）
3. `CoAlterCard` discriminated union（`decision | negotiate | clarify`）と各 mode の契約（候補有無など）
4. `coalter_messages.metadata` のキー構造（`proposalCard` / `card` / `routerTrace` / `gateResult` / `executorFallbackReason`）
5. status API レスポンスの `activeProposal` / `activeCard` 並列構造
6. `statusResolver.resolveActiveFromMetadata` の優先順位（card 優先 → proposalCard fallback）

---

## 参照

- 設計書: `docs/coalter-phase2-3mode-design.md`
- dispatch 実装: `lib/coalter/coalterDispatch.ts`
- status resolver: `lib/coalter/statusResolver.ts`
- UI dispatcher: `components/coalter/CoAlterCardDispatcher.tsx`
- hook: `hooks/useCoAlter.ts`
- テスト: `tests/unit/coalter/coalterDispatch.test.ts`, `tests/unit/coalter/statusResolver.test.ts`
