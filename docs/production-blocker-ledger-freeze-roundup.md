# Production Blocker Ledger — freeze-roundup 統合（a9eedce69 base）

本台帳は `integration/freeze-roundup-on-a9eedce69-20260623` で freeze 成果を main 統合 →
production 昇格する過程で発見した **production 前に解消すべき既存債務**を記録する。
統合作業（INT-1〜）自体が持ち込んだ退化ではなく、**base（a9eedce69）時点で既に存在する**問題を分離して台帳化する。

## B-1. `travelAdapterExternalLinksAttach.test.ts` が base で failed

- **状態**: 🔴 既存 base failure（production 前に修正 or 明示的 blocker 化が必要）
- **発見**: INT-1（Logic 取り込み）の全 suite 実行時に 1 failed として検出。
- **切り分け済み**:
  - `a9eedce69` base の clean tree（Culcept-int-battery）で**同一 test を単体実行 → 同じく failed**（1 failed / 11 passed）。
  - Logic は travel adapter（`lib/shared/travel/`・`lib/coalter/travel/`）および当該 test を**非変更**（`git diff --name-only a9eedce69 HEAD` で確認）。
  - → **INT-1 由来の退化ではない**。base が持つ既存債務。
- **症状**: `r.display` の key 集合 expectation が `["cues","packet","projection"]` 固定だが、
  実際の adapter 出力に `proposalsDisplay` が追加されており、test 側 expectation が未更新。
  （adapter に proposalsDisplay を生やした変更時に、この network test の key assertion が取り残された見込み。）
- **対応方針（CEO 指示・2026-06-24）**:
  - INT-2 以降の統合作業中は**この test を勝手に修正しない**。
  - production 昇格前に、別途 owning session で「test expectation 更新」か「明示的 xfail/blocker 化」を判断する。
- **再現**: `NODE_OPTIONS=--max-old-space-size=8192 npx vitest run tests/unit/travelAdapterExternalLinksAttach.test.ts`
