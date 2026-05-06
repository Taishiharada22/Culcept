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
  it("isSpeechFetchEnabled / isSpeechObservationMode を speechFetchGate から import", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // multi-line destructure を許容、両関数 import 必須
    expect(content).toMatch(/isSpeechFetchEnabled/);
    expect(content).toMatch(/isSpeechObservationMode/);
    expect(content).toMatch(
      /@\/lib\/coalter\/presence\/speechFetchGate/,
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
  it("AbortController + SPEECH_FETCH_TIMEOUT_MS timeout (CEO 確定 2026-05-02 修正 = 8_000ms)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/new\s+AbortController\(\)/);
    // 定数化済 (magic number 排除)、Stage 2.1 canary で 5_000ms が censored sample を
    // 生んだため 8_000ms に拡張 (Phase 2 観測専用、Production 最終値ではない)
    expect(content).toMatch(
      /export\s+const\s+SPEECH_FETCH_TIMEOUT_MS\s*=\s*8_?000/,
    );
    // setTimeout は定数を参照
    expect(content).toMatch(
      /setTimeout\([\s\S]*?,\s*SPEECH_FETCH_TIMEOUT_MS\)/,
    );
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

  it("L4-i Phase 2 Option B' (CEO 確定 2026-05-02): pattern.used emit を fetch 完了後に dedupe ref で実 source/retries/latency/validationFailed/fallbackReason で emit", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // emitPatternUsed import (UpperLayerMount で実 source 反映 emit)
    expect(content).toMatch(/import\s+\{\s*emitPatternUsed\s*\}/);
    // dedupe ref
    expect(content).toMatch(/lastEmittedSpeechTelemetryKeyRef/);
    expect(content).toMatch(
      /lastEmittedSpeechTelemetryKeyRef\.current\s*=\s*telemetryKey/,
    );
    // dedupe key は (variant, state, mode, source, fallbackReason)
    expect(content).toMatch(
      /\$\{speechVariant\}\|\$\{speechState\}\|\$\{speechMode\}\|\$\{source\}/,
    );
    // helper 内で emitPatternUsed 呼び出し
    expect(content).toMatch(
      /const\s+emitSpeechTelemetry\s*=[\s\S]{0,2000}emitPatternUsed/,
    );
  });

  it("L4-i Phase 2 Option B': payload に PII (body/prompt/userInput/conversation/transcript) を一切入れない", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // emitPatternUsed call の payload 全 field を locate
    const callMatch = content.match(
      /emitPatternUsed\(\s*\{[\s\S]*?\}\s*\)/,
    );
    expect(callMatch).not.toBeNull();
    const payloadBlock = callMatch![0];
    // 禁止 field が emit payload に存在しない
    expect(payloadBlock).not.toMatch(/\bbody\s*:/);
    expect(payloadBlock).not.toMatch(/\bpromptText\s*:|\bprompt\s*:/);
    expect(payloadBlock).not.toMatch(/\bllmResponse/);
    expect(payloadBlock).not.toMatch(/\buserMessage\s*:|\buserInput\s*:/);
    expect(payloadBlock).not.toMatch(/\bconversation\s*:|\btranscript\s*:/);
    // 許可された 11 field のみ (`field:` も `field,` shorthand も許容)
    expect(payloadBlock).toMatch(/\bvariant\s*[:,]/);
    expect(payloadBlock).toMatch(/\bstate\s*[:,]/);
    expect(payloadBlock).toMatch(/\bmode\s*[:,]/);
    expect(payloadBlock).toMatch(/\bhasSecondary\s*[:,]/);
    expect(payloadBlock).toMatch(/\bpairId\s*[:,]/);
    expect(payloadBlock).toMatch(/\bts\s*[:,]/);
    expect(payloadBlock).toMatch(/\bspeechSource\s*[:,]/);
    expect(payloadBlock).toMatch(/\bretries\s*[:,]/);
    expect(payloadBlock).toMatch(/\blatencyMs\s*[:,]/);
    expect(payloadBlock).toMatch(/\bvalidationFailed\s*[:,]/);
    expect(payloadBlock).toMatch(/\bfallbackReason\s*[:,]/);
  });

  it("L4-i Phase 2 Option B': fetch 完了 path 全網羅で emit (success / non-OK / timeout / network)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // success path: server response の safeSource / safeReason を emit
    expect(content).toMatch(
      /emitSpeechTelemetry\([\s\S]{0,200}safeSource[\s\S]{0,200}safeReason/,
    );
    // non-OK HTTP path: fallback / llm_error
    expect(content).toMatch(
      /res\.ok[\s\S]{0,400}emitSpeechTelemetry\([\s\S]{0,200}["']fallback["'][\s\S]{0,200}["']llm_error["']/,
    );
    // catch path: timeout/llm_error 区別
    expect(content).toMatch(
      /timeoutFired\s*\?\s*["']timeout["']\s*:\s*["']llm_error["']/,
    );
  });

  it("L4-i Phase 2 Option B': cleanup-induced abort では emit しない (stale response 防止)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // catch block 内で isAbort && !timeoutFired なら early return (emit せず)
    expect(content).toMatch(
      /isAbort\s*&&\s*!timeoutFired[\s\S]{0,150}setSpeechBody\(null\)[\s\S]{0,50}return/,
    );
  });

  it("L4-i Phase 2 Option C' (CEO 確定 2026-05-07): observationMode で cache read を skip", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // observationMode 判定が effect 内に存在
    expect(content).toMatch(
      /const\s+observationMode\s*=\s*isSpeechObservationMode\(\)/,
    );
    // !observationMode のときだけ cache hit / negative cache check 経路
    expect(content).toMatch(
      /if\s*\(\s*!observationMode\s*\)\s*\{[\s\S]{0,400}speechCacheRef\.current\.get\(cacheKey\)/,
    );
    expect(content).toMatch(
      /if\s*\(\s*!observationMode\s*\)\s*\{[\s\S]{0,400}speechNegativeCacheRef\.current\.get\(cacheKey\)/,
    );
  });

  it("L4-i Phase 2 Option C' : observationMode で cache write も skip", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // success path の cache write block が !observationMode で gate
    expect(content).toMatch(
      /if\s*\(\s*!observationMode\s*\)\s*\{[\s\S]{0,400}speechCacheRef\.current\.set\(cacheKey/,
    );
    // catch path / non-OK path の negative cache write も !observationMode で gate
    expect(content).toMatch(
      /if\s*\(\s*!observationMode\s*\)\s*\{[\s\S]{0,200}speechNegativeCacheRef\.current\.set\(cacheKey,\s*Date\.now\(\)\s*\+\s*30_000\)/,
    );
  });

  it("L4-i Phase 2 Option C' : observationKey が effect deps に含まれる", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // effect deps の最後に observationKey が含まれる
    expect(content).toMatch(
      /\}\s*,\s*\[speechState,\s*speechMode,\s*speechVariant,\s*threadId,\s*observationKey\]/,
    );
  });

  it("L4-i Phase 2 Option C' : observationKey は recentSignals.length に依存しない (kind:detectedAt 形式)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // observationKey が `${kind}:${detectedAt}` 形式 (SIGNAL_LOG_LIMIT 依存回避、CEO 厳守)
    const observationBlock = content.match(
      /const\s+observationKey\s*=[\s\S]{0,500};/,
    );
    expect(observationBlock).not.toBeNull();
    expect(observationBlock![0]).toMatch(/kind/);
    expect(observationBlock![0]).toMatch(/detectedAt/);
    // recentSignals.length を observationKey に使っていない
    expect(observationBlock![0]).not.toMatch(/recentSignals\.length/);
  });

  it("L4-i Phase 2 Option C' : Production default (env 未設定) で従来挙動完全維持", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // observationMode false 時は observationKey が "off" 固定 (deps 不変、従来挙動)
    expect(content).toMatch(/observationMode[\s\S]{0,200}["']off["']/);
    // in-flight dedupe / AbortController / stale guard は両モード共通
    expect(content).toMatch(/inFlightSpeechRef\.current\.has\(cacheKey\)/);
    expect(content).toMatch(/new\s+AbortController\(\)/);
    expect(content).toMatch(/speechMountedRef/);
  });

  it("L4-i Phase 2 Stage 2.1 v4 (CEO 確定 2026-05-07): observationMode の cleanup で abort も clearTimeout も両方 skip", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // cleanup return block の中で observationMode 時は早期 return
    // (controller.abort() + clearTimeout(timeoutId) を両方 skip して 8s timeout 保険を維持)
    expect(content).toMatch(
      /return\s*\(\s*\)\s*=>\s*\{[\s\S]{0,1000}if\s*\(\s*observationMode\s*\)\s*\{[\s\S]{0,200}return;[\s\S]{0,200}\}[\s\S]{0,200}controller\.abort\(\);?[\s\S]{0,80}clearTimeout\(timeoutId\)/,
    );
  });

  it("L4-i Phase 2 Stage 2.1 v4 : timeoutId は fetch finally で clear (request 単位の所有)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // finally block で clearTimeout(timeoutId) が呼ばれる
    // (effect cleanup で消えても timeout 保険を維持するための request 単位所有)
    expect(content).toMatch(
      /\}\s*finally\s*\{[\s\S]{0,200}clearTimeout\(timeoutId\)/,
    );
  });

  it("L4-i Phase 2 Stage 2.1 v4 : telemetry dedupe key に observationMode 時 observationKey を追加", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../app/components/chat/UpperLayerMount.tsx",
    );
    const content = fs.readFileSync(file, "utf8");
    // baseKey と observationMode 時の augmented key の両方を生成
    expect(content).toMatch(
      /const\s+baseKey\s*=\s*`[\s\S]{0,200}\$\{speechVariant\}[\s\S]{0,200}\$\{[\s\S]{0,40}fallbackReason/,
    );
    expect(content).toMatch(
      /const\s+telemetryKey\s*=\s*observationMode[\s\S]{0,150}\$\{baseKey\}\|\$\{observationKey\}[\s\S]{0,150}baseKey/,
    );
    // 通常モードの dedupe semantics は維持 (二重 emit 防止)
    expect(content).toMatch(
      /telemetryKey\s*===\s*lastEmittedSpeechTelemetryKeyRef\.current[\s\S]{0,80}return/,
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
