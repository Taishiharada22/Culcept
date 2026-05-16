# CoAlter Always-On Observer — A-2e State Observation Preflight

**ステータス**: 完了（docs-only、preflight only、実装着手なし）
**作成日**: 2026-05-17
**目的**: Observer の **mount + state update + PII firewall** を Preview 実機で実証する観測手段の比較・選定。
**前提**:
- A-2c runtime wiring merged (PR #159、main HEAD `c2d7cfd5`)
- A-2d Preview canary smoke PASS (UI / presence layer 不変、Console 赤 error 0)
- ObserverHost mount **未確認** (React DevTools 未実施)
- Observer state update **未実証**
- Phase A は「実質完了」ではなく「runtime wiring + canary build smoke は通った、ただし mount / state update は未実証」状態

**結論先出し**: **Option 2 (canary-only debug global expose) 推奨**、CEO 厳条件下で。

---

## 0. Executive Summary

### 0.1 観測目的（5 項目、CEO 提示）

Preview 上で Observer が以下を実行することを実機で確認:

| # | 確認項目 | 現状 |
|---|---|---|
| 1 | ObserverHost mount される | 未確認 (A-2d S3) |
| 2 | presence signal を購読する | 未実証 |
| 3 | signal を受ける | 未実証 |
| 4 | relationship state を更新する | 未実証 |
| 5 | raw text / PII / lastMessageId raw / matchedPattern raw を出さない | unit test 保証 (実機未確認) |

### 0.2 選定結果

**Option 2 (canary-only debug global expose) 採用** with 厳条件:
- **merge 禁止** (draft PR、smoke only)
- **canary branch 限定**
- **redacted only** (raw 値露出禁止)
- **smoke 後 branch 破棄**
- **Production env 不変**
- **time-bounded expire** (自立補強、後述)

### 0.3 A-2e 実装着手は本 PR では行わない

本 PR は **preflight only**。A-2e canary 実装は別 PR (Stop-before-merge lane)、CEO 判断後。

---

## 1. 4 Option 詳細比較

### Option 1: React DevTools のみで ObserverHost mount 確認

| 項目 | 内容 |
|---|---|
| 実行 | CEO が React Developer Tools (browser extension) を install → Preview URL で thread page を開く → Components tab で `<ObserverHost>` を検索 |
| 観測可能項目 | ✓ mount / ✓ props (pairStateId) / ✗ subscription registry / ✗ state update / ✗ PII firewall |
| Code change | 0 (Claude 側完全 0、CEO 操作のみ) |
| risk | ★ 低 (extension install / 観測のみ) |
| 不可侵境界 | ★★★ 完全遵守 |
| 観測範囲 | **mount のみ**、subscribe / state update は見えない |
| 観測手間 | CEO 15-30 分 |

**評価**: 確実だが範囲狭い。観測目的 5 項目のうち #1 のみカバー。**A-2e の本旨「state update 実証」を満たさない**。

### Option 2: canary-only debug global expose

| 項目 | 内容 |
|---|---|
| 実行 | hook 内に debug-gated global expose を追加 (env flag で gate)、canary branch で Preview deploy、Browser console から `__AOO_DEBUG_STATE__` 経由で redacted snapshot inspect |
| 観測可能項目 | ✓ mount / ✓ subscription registry size / ✓ state update (redacted snapshot) / ✓ PII firewall verification |
| Code change | 数十行 (hook 内 debug section + tests)、canary branch only、main merge 禁止 |
| risk | ★★ 中 (debug global は env-gated だが code bundle 内に残るリスクあり) |
| 不可侵境界 | ★★ presence layer 不変、debug は observer layer 内に閉じる |
| 観測範囲 | **5 項目すべて** カバー |
| 観測手間 | CEO 30-60 分 (canary deploy + console inspect) |
| 厳条件 (CEO 補正) | merge禁止 / canary branch限定 / redacted only / smoke後破棄 |

**評価**: 観測 coverage 最大。CEO 推奨条件下で安全に運用可。**A-2e 本旨を完全に満たす**。

### Option 3: client-side debug endpoint

| 項目 | 内容 |
|---|---|
| 実行 | 新規 `/api/coalter/observer/_debug_state` endpoint を作る、client が POST で問い合わせ、server が応答 |
| 観測可能項目 | (検討余地あり、ただし observer state は client-local) |
| 構造的問題 | **observer state は client process-local in-memory** (A-2c 設計遵守)、server endpoint からは読めない |
| Code change | 大規模 (server endpoint + client → state push 仕組み or client → request rpc) |
| risk | ★★★ 高 (新規 endpoint + client/server 設計複雑) |
| 不可侵境界 | ★ route / API 追加、不可侵境界違反候補 |

**評価**: **client memory と server route の論理境界が壊れる**。CEO 補正「今は非推奨」と一致。**不採用**。

### Option 4: A-2b/A-2c tests guarantee のみで Phase B へ進む

| 項目 | 内容 |
|---|---|
| 実行 | 既存 unit (197 tests) + integration tests の PII firewall / state update 検証で実機 verify 代替 |
| 観測可能項目 | 全項目 (test レベルでの guarantee) |
| 実機証拠 | **0** (実機 runtime での mount / subscribe / state update 不在) |
| Code change | 0 |
| risk | ★★★★ 高 (test 環境 ≠ Preview 環境、build artifact での実 webpack bundle と node 環境での test に乖離可能性) |

**評価**: **実機証拠が皆無**。CEO 補正「非推奨」と一致。**不採用**。

---

## 2. Option 推奨順位

| 順位 | Option | Coverage | risk | 不可侵境界 | 採用判断 |
|---|---|---|---|---|---|
| **1** | **Option 2** (canary-only debug global expose) | ★★★ 5/5 項目 | ★★ | ★★ | **推奨** (CEO 厳条件下で) |
| 2 | Option 1 (React DevTools のみ) | ★ 1/5 項目 | ★ | ★★★ | A-2e 本旨不足、ただし Option 2 と組み合わせて補完価値あり |
| - | Option 3 (debug endpoint) | (検討余地あり) | ★★★ | ★ | **不採用** (CEO 補正準拠) |
| - | Option 4 (tests guarantee only) | 0 実機 | ★★★★ | ★★★ | **不採用** (CEO 補正準拠) |

**推奨採用**: **Option 2 メイン + Option 1 補完** (mount は React DevTools でも併確認)

---

## 3. Option 2 詳細設計（canary-only debug global expose）

### 3.1 設計原則

1. **draft PR / merge 禁止** — main に絶対 merge しない (smoke trigger only)
2. **canary branch 限定** — short-lived branch、smoke 後破棄
3. **env-gated** — 専用 debug flag (`NEXT_PUBLIC_COALTER_OBSERVER_DEBUG_EXPOSE`) で gate、default OFF
4. **redacted only** — `getRedactedRelationshipStateSnapshot()` 経由、raw pairStateId / raw signal / raw text 一切露出させない
5. **fixed canary salt** — debug global の hash key 生成用に固定 salt 使用 (test-friendly、ただし salt 露出させない)
6. **Production env 不変** — debug flag は Preview のみ
7. **smoke 後完全破棄** — branch / PR / env / global expose 全て cleanup
8. **時限自動 expire** (自立補強) — install 後 N 分で自動 invalidate

### 3.2 実装スケッチ (A-2e canary 実装フェーズ、本 PR では実装しない)

#### 3.2.1 New env flag (canary 一時用)

```
env: NEXT_PUBLIC_COALTER_OBSERVER_DEBUG_EXPOSE
default: false
scope: Preview only, all branches OR specific canary branch (CEO 判断)
production: 絶対追加しない
```

#### 3.2.2 Debug global expose (hooks/useObserverSubscription.ts 内、env-gated)

```typescript
// 概念実装 (実装は別 PR、本 doc では仕様提示のみ)
const DEBUG_EXPOSE_ENABLED = (() => {
  // double-gate: env + NODE_ENV (production build では完全除外)
  if (process.env.NODE_ENV === "production") return false;
  return process.env.NEXT_PUBLIC_COALTER_OBSERVER_DEBUG_EXPOSE === "true";
})();

const DEBUG_CANARY_SALT = "_aoo_canary_debug_observation_salt_2026_05";

// 時限 expire (自立補強)
const DEBUG_EXPIRE_MS = 15 * 60 * 1000; // 15 min

useEffect(() => {
  // ... existing subscribe logic ...
  
  if (DEBUG_EXPOSE_ENABLED && typeof globalThis !== "undefined") {
    const installedAt = Date.now();
    
    (globalThis as any).__AOO_DEBUG_STATE__ = {
      meta: {
        installedAt,
        expiresAt: installedAt + DEBUG_EXPIRE_MS,
        version: "a2e-canary-preflight-v1",
      },
      
      // mount 確認
      getRegistrySize: (): number => {
        if (Date.now() > installedAt + DEBUG_EXPIRE_MS) {
          delete (globalThis as any).__AOO_DEBUG_STATE__;
          throw new Error("__AOO_DEBUG_STATE__ expired (15 min)");
        }
        return __getSubscriptionRegistrySizeForTests();
      },
      
      // state update 確認 (redacted snapshot のみ)
      getRedactedStateForPair: (pairStateId: string): RedactedRelationshipStateSnapshot | null => {
        if (Date.now() > installedAt + DEBUG_EXPIRE_MS) {
          delete (globalThis as any).__AOO_DEBUG_STATE__;
          throw new Error("__AOO_DEBUG_STATE__ expired (15 min)");
        }
        return getRedactedRelationshipStateSnapshot(pairStateId, DEBUG_CANARY_SALT);
      },
      
      // raw 露出禁止: 以下は絶対公開しない
      // - internal salt
      // - raw signal
      // - raw pairStateId (caller が pairStateId を知っているからこそ getRedactedStateForPair を呼べる、
      //   server からは redactedRelationshipKey のみ返る)
    };
  }
}, [pairStateId]);
```

#### 3.2.3 Console から CEO が観測する手順

```javascript
// Browser DevTools Console (Preview URL 開いた状態で):

// 1. Debug global の存在確認
window.__AOO_DEBUG_STATE__
// → { meta: {...}, getRegistrySize, getRedactedStateForPair }

// 2. mount 確認 (subscription registry size)
window.__AOO_DEBUG_STATE__.getRegistrySize()
// → 1 if mount 成功 + flag ON、0 if not

// 3. state update 確認
// CEO がペアの pairStateId を知っている前提 (debug 専用観測)
window.__AOO_DEBUG_STATE__.getRedactedStateForPair("<pairStateId>")
// → RedactedRelationshipStateSnapshot { redactedRelationshipKey, observationCount, ... }
//   raw pairStateId なし、bucket 化された値のみ

// 4. PII firewall verification
const snap = window.__AOO_DEBUG_STATE__.getRedactedStateForPair("<pairStateId>")
const json = JSON.stringify(snap)
console.log("raw pairStateId leak:", json.includes("<pairStateId>"))  // false 期待
console.log("forbidden fields:", Object.keys(snap).filter(k =>
  ["userId","pairId","threadId","email","lastMessageId","message","utterance","text"].includes(k)
))  // [] 期待
```

#### 3.2.4 New unit tests (A-2e canary 実装フェーズで追加)

- debug global が flag OFF (default) で expose されないこと
- debug global が NODE_ENV=production で expose されないこと
- expose された場合の getRegistrySize / getRedactedStateForPair の挙動
- 時限 expire の動作
- PII firewall: redacted snapshot に raw 値が出ないこと

### 3.3 不可侵境界 (A-2e canary 実装時の遵守事項)

- ✗ `productionSignalBus.ts` / presence layer 30+ files **触らない**
- ✗ `UpperLayerMount.tsx` / `ModeSwitcher.tsx` / chat layer 17 files **触らない**
- ✗ route / API endpoint **追加なし** (Option 3 不採用)
- ✗ DB / Supabase / migration / Sentry / telemetry / cookie / localStorage **使わない**
- ✗ Production env **絶対触らない**
- ✗ canary branch を main に **merge しない**
- ✗ smoke 後の debug global を本番 build に残さない (double-gate: env + NODE_ENV)

---

## 4. CEO 補正準拠の絶対条件（Option 2 採用時）

| 補正項目 | 反映 |
|---|---|
| draft PR | ✓ A-2e canary PR は draft で起票 |
| merge 禁止 | ✓ canary 観測完了後 close (PR #160 と同じパターン) |
| canary branch 限定 | ✓ `chore/coalter-aoo-a2e-canary` (短命) |
| redacted only | ✓ `getRedactedRelationshipStateSnapshot()` 経由のみ |
| raw text / PII / IDs 露出禁止 | ✓ debug accessor は redacted snapshot だけ返す |
| smoke 後 branch 破棄 | ✓ canary 完了後 PR close + branch delete + worktree cleanup |
| Production env 不変 | ✓ debug env は Preview のみ、CEO 操作 |
| Production deploy 不変 | ✓ canary は Preview branch deploy のみ |

---

## 5. 自立補強（CEO 指示外）

### 5.1 Time-bounded debug expose (時限 expire)

実装に `installedAt + DEBUG_EXPIRE_MS` チェックを組み込み、install 後 15 分で自動 invalidate:

利点:
- CEO 観測 session が終わった後、debug global が残らない (browser tab 開きっぱなしでも自動消滅)
- canary smoke の責任範囲を明確に limit
- forget-to-cleanup の human error 対策

### 5.2 Double-gate (env + NODE_ENV)

```typescript
if (process.env.NODE_ENV === "production") return false;
if (process.env.NEXT_PUBLIC_COALTER_OBSERVER_DEBUG_EXPOSE !== "true") return false;
```

意図:
- Vercel production build (NODE_ENV=production) では完全に dead code elimination
- webpack tree shaking で debug code が production bundle から除外
- env flag を誤って production に設定しても、NODE_ENV ガードで安全

### 5.3 Fixed canary salt の意味

debug global で固定 salt を使うのは:
- CEO 観測 session で同じ pairStateId から同じ redactedRelationshipKey が出る (確認しやすい)
- production 用 ephemeral salt とは別 namespace (cross-environment correlation 防止)
- salt は code 内 hard-coded、env でなくてよい (canary 一時用)

### 5.4 Observation script template

CEO 観測時間短縮のため、Console 実行用 snippet を canary PR body に添付:

```javascript
// CEO 観測 snippet (canary smoke 用、A-2e canary PR body に含める)
(async function aooObservationProof() {
  const dbg = window.__AOO_DEBUG_STATE__;
  if (!dbg) {
    console.log("❌ debug global not exposed (flag OFF or expired)");
    return;
  }
  console.log("✓ debug global installed:", dbg.meta);
  console.log("✓ registry size:", dbg.getRegistrySize());
  // pairStateId を CEO が現セッションから取得して 入力
  // (例: useCoAlter hook の coalter.pairStateId)
  const PAIR_ID = "<your-pair-state-id-here>";
  const snap = dbg.getRedactedStateForPair(PAIR_ID);
  console.log("✓ redacted snapshot:", snap);
  console.log("✓ raw leak check:", JSON.stringify(snap).includes(PAIR_ID));
})();
```

### 5.5 Failure mode 列挙

| failure | 対応 |
|---|---|
| debug global undefined → mount してない or flag OFF | env / NODE_ENV / build artifact 順に確認 |
| getRegistrySize() === 0 → subscribe 失敗 or pairStateId null | useCoAlter の pairStateId を確認、flag OFF も再確認 |
| getRedactedStateForPair() === null → state 未登録 | message 送信して signal 発火を待つ、registry size が >0 でも初回 signal 受信前は state なし |
| snapshot に raw pairStateId 含む → PII firewall 破綻 | **🔴 即時中断、bug 起票** |
| Production env に debug flag 流出 | **🔴 即時削除、影響範囲調査** |

### 5.6 成功条件 (Option 2 採用時の A-2e canary smoke PASS 基準)

| # | 条件 | 計測 |
|---|---|---|
| O1 | Preview build SUCCESS (real build) | Vercel check + duration > 5 min |
| O2 | debug global expose 確認 | `window.__AOO_DEBUG_STATE__` 存在 |
| O3 | ObserverHost mount 確認 | `getRegistrySize() >= 1` (CoAlter enabled pair で) |
| O4 | State update 確認 | message 送信 → signal 発火 → `getRedactedStateForPair()` で redacted snapshot 返る、observationCount > 0 |
| O5 | PII firewall 実機確認 | redacted snapshot に raw pairStateId / raw signal / raw text / forbidden fields 0 件 |
| O6 | UI / UX 変化なし | A-2d S4 同様 |
| O7 | Console error なし | A-2d S5 同様 |
| O8 | presence layer 動作不変 | A-2d S6 同様 |
| O9 | Production deploy 不変 | A-2d S7 同様 |
| O10 | smoke 後 15 分で debug global 自動消滅 (時限 expire 検証) | Console で 15 分後再 access |

---

## 6. CEO 判断項目（A-2e canary 実装着手前）

| # | 質問 | 推奨 |
|---|---|---|
| **K1** | Option 採用 | **Option 2 (canary-only debug global expose)** + Option 1 補完 ⭐ |
| **K2** | A-2e canary 実装着手承認 | CEO 判断 |
| **K3** | New env `NEXT_PUBLIC_COALTER_OBSERVER_DEBUG_EXPOSE` 追加 (Preview only) 承認 | CEO 判断 |
| **K4** | 時限 expire (15 min) 採用 | YES (自立補強) ⭐ |
| **K5** | Double-gate (env + NODE_ENV=production excluded) 採用 | YES (自立補強) ⭐ |
| **K6** | A-2e canary 完了後の cleanup 範囲 | branch / PR / env 全削除 + worktree cleanup |
| **K7** | A-2e canary PR の Lane | **Stop-before-merge** (canary draft、merge 絶対禁止) |

---

## 7. A-2e canary 実装 scope（CEO 承認後の別 PR）

### 新規ファイル

| File | 用途 | 行数想定 |
|---|---|---|
| (existing) `hooks/useObserverSubscription.ts` modify | debug-gated global expose 追加 | +50 行 |
| `tests/unit/hooks/useObserverSubscription.test.ts` modify | debug expose / expire / PII firewall tests | +100 行 |

### 修正ファイル

| File | 修正内容 |
|---|---|
| `lib/coalter/flags.ts` | `presenceObserverDebugExposeEnabled` getter 追加 (double-gate logic 含む) |

### Lane

**Stop-before-merge** (CEO 補正準拠、canary draft only)

### 推定工数

実装 1 日 + canary 観測 0.5 日 + cleanup 0.5 日 = 2 日

---

## 8. 不変境界（A-2e preflight + canary 実装、厳守）

- ✗ Phase B Mirror 実装禁止
- ✗ auto-speak / Question / Proposal 自動発火 禁止
- ✗ Production env 変更禁止
- ✗ `NEXT_PUBLIC_COALTER_PRESENCE_OBSERVER` 再追加禁止 (A-2e canary では別 flag `NEXT_PUBLIC_COALTER_OBSERVER_DEBUG_EXPOSE` を使う)
- ✗ debug endpoint 実装禁止 (Option 3 不採用)
- ✗ route / API 追加禁止
- ✗ DB / Supabase / migration 禁止
- ✗ Sentry / telemetry 禁止
- ✗ Step E-1 / bug1 cleanup / Stargazer pivot 禁止
- ✗ presence layer 30+ files / chat layer 17 files **触らない**
- ✗ A-2e canary を main に **merge しない** (canary draft only)

---

## 9. 次の動き

| Phase | 内容 | Lane |
|---|---|---|
| **本 PR (A-2e preflight)** | docs-only design 起票 | Auto-merge |
| A-2e canary 実装 PR | Option 2 実装 + tests | Stop-before-merge |
| **CEO**: env 追加 | `NEXT_PUBLIC_COALTER_OBSERVER_DEBUG_EXPOSE=true` Preview 追加 | CEO 操作 |
| canary deploy + 観測 | CEO 実機 Console 確認 (O1-O10) | observation |
| 結果報告 | CEO 判断: continue or rollback | — |
| cleanup | PR close + branch delete + env 削除 | — |
| **次フェーズ判断** | Phase B Mirror Channel design 着手 or 別判断 | CEO 判断 |

---

## 10. 参照

- `docs/coalter-aoo-presence-reconciliation.md` (PR #154) 不可侵境界正本
- `docs/coalter-aoo-a2-presence-signal-bus-audit.md` (PR #156)
- `docs/coalter-aoo-a2b-implementation-preflight.md` (PR #157)
- `lib/coalter/observer/relationshipState.ts` / `relationshipStateRedaction.ts` (A-1/A-1b)
- `lib/coalter/observer/signalRedaction.ts` (A-2b)
- `hooks/useObserverSubscription.ts` (A-2c)
- `components/coalter/observer/ObserverHost.tsx` (A-2c)
- A-2d canary report (CEO 実機観測、2026-05-17): UI / presence layer 不変、Console error なし、mount/state update 未実証

---

## 11. 変更履歴

| 日付 | 変更 | 承認 |
|---|---|---|
| 2026-05-17 | A-2e State Observation preflight 初版 | CEO 推奨 Option 2 (canary-only debug global expose、厳条件下) |
