/**
 * Stage 4 L4-i Phase 1 — UpperLayerMount speech fetch wiring test (静的検査主体)
 *
 * 完了条件 (CEO 必須 14 項目より該当 cover):
 *   #1 flag OFFでclient fetchが起動しない (gate import + isSpeechFetchEnabled call)
 *   #2 flag OFFでUI文言が既存hardcodedのまま (state component fallback test)
 *   #5 S0/S1/S3/S4/S6/S8 では fetch しない (state guard grep)
 *   #6 urgentDecision が出ても LLM speech fetch しない (UrgentLayer 不変 grep)
 *   #10 timeout 時は fallback 表示 (AbortController + setTimeout grep)
 *   #11 in-flight 重複 fetch しない (inFlightRef grep)
 *   #12 state 変更時に古い response で UI を上書きしない (mountedRef + abort)
 *   #13 ChatClient.tsx touch なし (既存 invariant 維持)
 *
 * test strategy:
 *   - UpperLayerMount.tsx を grep して構造 invariant を確認
 *   - state component invoke で body undefined → hardcoded fallback の確認
 *   - 関数 invoke で React render なしで判定可能なロジックを検証
 */

import { describe, it, expect } from "vitest";

import S2Opening from "@/app/components/chat/states/S2Opening";
import S5Bridging from "@/app/components/chat/states/S5Bridging";
import S7ProposalShown from "@/app/components/chat/states/S7ProposalShown";

const NOOP = () => {};

describe("L4-i Phase 1 #2 — state component の hardcoded fallback (body undefined で既存挙動)", () => {
  it("S2Opening: body undefined で React element 返却 (hardcoded fallback で render 可能)", () => {
    const result = S2Opening({ mode: "normal", onSwitchMode: NOOP });
    expect(result).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).type).toBeTruthy();
  });

  it("S5Bridging: body undefined で React element 返却", () => {
    const result = S5Bridging({ mode: "normal", onSwitchMode: NOOP });
    expect(result).not.toBeNull();
  });

  it("S7ProposalShown: body undefined で React element 返却", () => {
    const result = S7ProposalShown({ mode: "normal", onSwitchMode: NOOP });
    expect(result).not.toBeNull();
  });

  it("S2Opening: body 渡しても render 可能 (Phase 2 で active)", () => {
    const result = S2Opening({
      mode: "normal",
      onSwitchMode: NOOP,
      body: "テスト発話",
    });
    expect(result).not.toBeNull();
  });
});

describe("L4-i Phase 1 #1, #5 — UpperLayerMount.tsx 構造 invariant", () => {
  it("isSpeechFetchEnabled を import (client gate)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(
      /import\s+\{\s*isSpeechFetchEnabled\s*\}\s+from\s+["']@\/lib\/coalter\/presence\/speechFetchGate["']/,
    );
  });

  it("speech fetch effect で isSpeechFetchEnabled() check が最初 (gate OFF で early return)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(
      /if\s*\(\s*!isSpeechFetchEnabled\(\)\s*\)\s*\{[\s\S]{0,200}setSpeechBody\(null\)/,
    );
  });

  it("S2/S5/S7 以外は fetch しない (state guard、CEO 必須 #5)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(
      /speechState\s*!==\s*["']S2["'][\s\S]{0,100}speechState\s*!==\s*["']S5["'][\s\S]{0,100}speechState\s*!==\s*["']S7["']/,
    );
  });

  it("threadId === null で fetch しない (auth 文脈なし)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/if\s*\(\s*threadId\s*===\s*null\s*\)/);
  });
});

describe("L4-i Phase 1 #10, #11, #12 — fetch dedupe / timeout / stale 防止", () => {
  it("AbortController + 2s timeout (CEO 必須 #10 timeout 時 fallback)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/new\s+AbortController\(\)/);
    // setTimeout(...,  2000) — body has nested parens, use looser anchor
    expect(content).toMatch(/setTimeout\([\s\S]*?,\s*2000\s*\)/);
    expect(content).toMatch(/controller\.abort\(\)/);
  });

  it("in-flight dedupe (CEO 必須 #11)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/inFlightSpeechRef/);
    expect(content).toMatch(/inFlightSpeechRef\.current\.has\(cacheKey\)/);
  });

  it("mounted ref で stale response 防止 (CEO 必須 #12)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/speechMountedRef/);
    expect(content).toMatch(/!speechMountedRef\.current/);
  });

  it("negative cache 30s (失敗キーは短期間 retry しない)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/speechNegativeCacheRef/);
    expect(content).toMatch(/30_000|30000/);
  });

  it("L4-i Phase 2 fix-forward (CEO 確定 2026-05-02): source==='llm' のみ cache", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // source === "llm" 分岐で speechCacheRef.set
    expect(content).toMatch(
      /source\s*===\s*["']llm["'][\s\S]{0,200}speechCacheRef\.current\.set/,
    );
    // rate_limited 時 negative cache 70s
    expect(content).toMatch(
      /reason\s*===\s*["']rate_limited["'][\s\S]{0,150}speechNegativeCacheRef\.current\.set\(cacheKey,\s*Date\.now\(\)\s*\+\s*70_000\)/,
    );
    // llm_error / validation_failed / timeout 時 negative cache 30s
    expect(content).toMatch(
      /reason\s*===\s*["']llm_error["']\s*\|\|[\s\S]{0,120}["']validation_failed["']\s*\|\|[\s\S]{0,120}["']timeout["']/,
    );
  });

  it("L4-i Phase 2 fix-forward (CEO 確定 2026-05-02): cleanup-induced abort は negative cache を汚さない", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // timeoutFired flag (timeout-induced abort と cleanup-induced abort の区別)
    expect(content).toMatch(/let\s+timeoutFired\s*=\s*false/);
    expect(content).toMatch(/timeoutFired\s*=\s*true/);
    // catch ブロックで AbortError かつ !timeoutFired なら negative cache を **設定しない**
    expect(content).toMatch(
      /isAbort[\s\S]{0,50}!timeoutFired[\s\S]{0,150}return/,
    );
    // それ以外 (timeout 由来 or 真の error) は negative cache 30s
    expect(content).toMatch(
      /speechNegativeCacheRef\.current\.set\(cacheKey,\s*Date\.now\(\)\s*\+\s*30_000\)/,
    );
  });

  it("L4-i Phase 2 fix-forward: source!=='llm' のとき UI に body を流さない (hardcoded fallback 維持)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // setSpeechBody(json.body as string) は source==="llm" 分岐内のみ
    // それ以外は setSpeechBody(null) で hardcoded fallback に戻す
    expect(content).toMatch(
      /if\s*\(source\s*===\s*["']llm["']\)\s*\{[\s\S]{0,150}setSpeechBody\(json\.body\s+as\s+string\)/,
    );
    expect(content).toMatch(
      /\}\s*else\s*\{\s*setSpeechBody\(null\)/,
    );
  });

  it("cache key に variant が含まれる (S7 F1/F2 を区別、CEO 必須要件)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(
      /buildSpeechCacheKey[\s\S]{0,300}variant[\s\S]{0,100}state[\s\S]{0,100}mode/,
    );
  });
});

describe("L4-i Phase 1 #6, #13 — Urgent / ChatClient touch なし", () => {
  it("UrgentLayer の message prop は既存 URGENT_FALLBACK_MESSAGES のまま (LLM 接続なし)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // urgentMessage は依然 URGENT_FALLBACK_MESSAGES から取る
    expect(content).toMatch(
      /urgentMessage\s*=\s*visibleUrgentDecision[\s\S]{0,100}URGENT_FALLBACK_MESSAGES/,
    );
    // Urgent path で speech fetch を呼ばない (UrgentLayer.tsx を speech に絡めない)
    expect(content).not.toMatch(/UrgentLayer[\s\S]{0,100}body=\{speechBody/);
  });

  it("UrgentLayer.tsx / UrgentMessageCard.tsx / UrgentRelease.tsx は LLM speech 接続なし", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    for (const f of ["UrgentLayer.tsx", "UrgentMessageCard.tsx", "UrgentRelease.tsx"]) {
      const file = path.resolve(__dirname, "../../../app/components/chat/", f);
      const content = fs.readFileSync(file, "utf8");
      expect(content).not.toMatch(/isSpeechFetchEnabled/);
      expect(content).not.toMatch(/buildPresenceSpeech/);
      expect(content).not.toMatch(/\/api\/coalter\/speech/);
    }
  });

  it("ChatClient.tsx touch なし (CEO 必須 #13)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/(culcept)/talk/[threadId]/ChatClient.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).not.toMatch(/isSpeechFetchEnabled/);
    expect(content).not.toMatch(/buildPresenceSpeech/);
    expect(content).not.toMatch(/\/api\/coalter\/speech/);
  });
});
