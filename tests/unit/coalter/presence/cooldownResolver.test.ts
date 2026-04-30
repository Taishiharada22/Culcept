/**
 * Stage 2 L2-e — cooldownResolver 6 段階優先順位 test
 *
 * plan §5.5 Gate:
 *   ① 6 段階優先順位 (availability → dignity → rupture → mode 拒否 → 提案拒否 → 通常 S8)
 *   ② dignity / rupture 超越 (@coalter 強制でも介入棄却、抑制応答返す)
 *   ③ 通常 S8 の @coalter 強制上書き (mention/button/mode_tap)
 *   ④ critical signal の 5 分ルール超越
 */

import { describe, it, expect } from "vitest";

import {
  resolveCooldown,
  pruneExpired,
  type ActiveCooldown,
  type ResolveInput,
} from "@/lib/coalter/presence/cooldownResolver";

const now = 1_000_000;
const future = (ms: number): number => now + ms;

const cd = (
  kind: ActiveCooldown["kind"],
  extra: Partial<ActiveCooldown> = {},
): ActiveCooldown => ({
  kind,
  expiresAt: future(60 * 60 * 1000), // 1h ahead
  ...extra,
});

const baseInput = (over: Partial<ResolveInput> = {}): ResolveInput => ({
  availability: "active",
  activeCooldowns: [],
  fireKind: "mention",
  ...over,
});

// ─────────────────────────────────────────────
// Tier 1: availability gate
// ─────────────────────────────────────────────

describe("L2-e cooldownResolver — Tier 1 availability gate (§3.3 順位 1)", () => {
  it("disabled → admit=false / tier=1 / respondSuppressed=false (UI 非表示で発火不能)", () => {
    const r = resolveCooldown(baseInput({ availability: "disabled" }));
    expect(r.admit).toBe(false);
    expect(r.tier).toBe(1);
    expect(r.respondSuppressed).toBe(false);
  });

  it("inactive → admit=false / tier=1", () => {
    expect(resolveCooldown(baseInput({ availability: "inactive" })).admit).toBe(
      false,
    );
  });

  it("pending_consent → admit=false / tier=1", () => {
    expect(
      resolveCooldown(baseInput({ availability: "pending_consent" })).admit,
    ).toBe(false);
  });

  it("enabled / active で他 cooldown なし → admit=true", () => {
    expect(resolveCooldown(baseInput({ availability: "enabled" })).admit).toBe(
      true,
    );
    expect(resolveCooldown(baseInput({ availability: "active" })).admit).toBe(
      true,
    );
  });
});

// ─────────────────────────────────────────────
// Tier 2: dignity 超越 (§3.3 順位 2 / §3.3.1)
// ─────────────────────────────────────────────

describe("L2-e cooldownResolver — Tier 2 dignity (超越 cooldown、§3.3-2 / §3.3.1)", () => {
  it("dignity active + mention → admit=false / tier=2 / respondSuppressed=true (抑制応答 §3.3.1)", () => {
    const r = resolveCooldown(
      baseInput({ activeCooldowns: [cd("dignity")], fireKind: "mention" }),
    );
    expect(r.admit).toBe(false);
    expect(r.tier).toBe(2);
    expect(r.respondSuppressed).toBe(true);
  });

  it("dignity active + chip → admit=false / respondSuppressed=false (chip は強制起動でないため抑制応答も返さない、§3.3.1)", () => {
    const r = resolveCooldown(
      baseInput({ activeCooldowns: [cd("dignity")], fireKind: "chip" }),
    );
    expect(r.admit).toBe(false);
    expect(r.tier).toBe(2);
    expect(r.respondSuppressed).toBe(false);
  });

  it("dignity は @coalter 強制起動 (mention/button/mode_tap) でも上書き不可 (超越、§3.7-4 不可侵)", () => {
    for (const fireKind of ["mention", "button", "mode_tap"] as const) {
      const r = resolveCooldown(
        baseInput({ activeCooldowns: [cd("dignity")], fireKind }),
      );
      expect(r.admit).toBe(false);
      expect(r.respondSuppressed).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────
// Tier 3: rupture 超越 + intervention_retreat
// ─────────────────────────────────────────────

describe("L2-e cooldownResolver — Tier 3 rupture (超越、§3.3-3) + intervention_retreat (§6.6.3)", () => {
  it("rupture active + mention → admit=false / tier=3 / respondSuppressed=true", () => {
    const r = resolveCooldown(
      baseInput({ activeCooldowns: [cd("rupture")], fireKind: "mention" }),
    );
    expect(r.admit).toBe(false);
    expect(r.tier).toBe(3);
    expect(r.respondSuppressed).toBe(true);
  });

  it("rupture は強制起動でも上書き不可", () => {
    const r = resolveCooldown(
      baseInput({ activeCooldowns: [cd("rupture")], fireKind: "button" }),
    );
    expect(r.admit).toBe(false);
  });

  it("intervention_retreat + chip → admit=false (S1 自動昇格停止、§6.6.3)", () => {
    const r = resolveCooldown(
      baseInput({
        activeCooldowns: [cd("intervention_retreat")],
        fireKind: "chip",
      }),
    );
    expect(r.admit).toBe(false);
    expect(r.tier).toBe(3);
  });

  it("intervention_retreat + mention → 強制起動で通る (§6.6.3「期間中もユーザー明示呼び出し応答可」)", () => {
    const r = resolveCooldown(
      baseInput({
        activeCooldowns: [cd("intervention_retreat")],
        fireKind: "mention",
      }),
    );
    expect(r.admit).toBe(true);
  });

  it("intervention_retreat + button → 強制起動で通る", () => {
    const r = resolveCooldown(
      baseInput({
        activeCooldowns: [cd("intervention_retreat")],
        fireKind: "button",
      }),
    );
    expect(r.admit).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Tier 4: mode 拒否 cooldown (範囲限定)
// ─────────────────────────────────────────────

describe("L2-e cooldownResolver — Tier 4 mode_rejection (§3.3 順位 4、範囲限定)", () => {
  it("mode_rejection (daily) + mode_tap (target=daily) → admit=false / tier=4", () => {
    const r = resolveCooldown(
      baseInput({
        activeCooldowns: [cd("mode_rejection", { rejectedMode: "daily" })],
        fireKind: "mode_tap",
        targetMode: "daily",
      }),
    );
    expect(r.admit).toBe(false);
    expect(r.tier).toBe(4);
  });

  it("mode_rejection (daily) + mode_tap (target=travel) → admit=true (他 mode は通る)", () => {
    const r = resolveCooldown(
      baseInput({
        activeCooldowns: [cd("mode_rejection", { rejectedMode: "daily" })],
        fireKind: "mode_tap",
        targetMode: "travel",
      }),
    );
    expect(r.admit).toBe(true);
  });

  it("mode_rejection + mention (mode_tap でない) → admit=true (他経路通る、§3.3 注記)", () => {
    const r = resolveCooldown(
      baseInput({
        activeCooldowns: [cd("mode_rejection", { rejectedMode: "daily" })],
        fireKind: "mention",
      }),
    );
    expect(r.admit).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Tier 5: 提案拒否 cooldown (テーマ範囲限定)
// ─────────────────────────────────────────────

describe("L2-e cooldownResolver — Tier 5 proposal_rejection (§3.3 順位 5、テーマ限定)", () => {
  it("proposal_rejection (food) + theme=food → admit=false / tier=5", () => {
    const r = resolveCooldown(
      baseInput({
        activeCooldowns: [
          cd("proposal_rejection", { rejectedTheme: "food" }),
        ],
        theme: "food",
      }),
    );
    expect(r.admit).toBe(false);
    expect(r.tier).toBe(5);
  });

  it("proposal_rejection (food) + theme=movie → admit=true (他テーマは通る)", () => {
    const r = resolveCooldown(
      baseInput({
        activeCooldowns: [
          cd("proposal_rejection", { rejectedTheme: "food" }),
        ],
        theme: "movie",
      }),
    );
    expect(r.admit).toBe(true);
  });

  it("proposal_rejection 中の theme 未指定 → admit=true (テーマ判定なし = 通る)", () => {
    const r = resolveCooldown(
      baseInput({
        activeCooldowns: [
          cd("proposal_rejection", { rejectedTheme: "food" }),
        ],
        // theme 未指定
      }),
    );
    expect(r.admit).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Tier 6: 通常 S8 cooldown (強制起動 / critical 上書き)
// ─────────────────────────────────────────────

describe("L2-e cooldownResolver — Tier 6 normal_s8 (§3.3 順位 6 / §3.5)", () => {
  it("normal_s8 + chip → admit=false / tier=6 (chip は上書き対象外、§3.5)", () => {
    const r = resolveCooldown(
      baseInput({ activeCooldowns: [cd("normal_s8")], fireKind: "chip" }),
    );
    expect(r.admit).toBe(false);
    expect(r.tier).toBe(6);
  });

  it("normal_s8 + free_text_reply → admit=false (上書き対象外)", () => {
    const r = resolveCooldown(
      baseInput({
        activeCooldowns: [cd("normal_s8")],
        fireKind: "free_text_reply",
      }),
    );
    expect(r.admit).toBe(false);
  });

  it("normal_s8 + mention (強制起動) → admit=true (§3.5 5 分上書き)", () => {
    const r = resolveCooldown(
      baseInput({ activeCooldowns: [cd("normal_s8")], fireKind: "mention" }),
    );
    expect(r.admit).toBe(true);
    expect(r.tier).toBe(6);
  });

  it("normal_s8 + button → admit=true (強制起動)", () => {
    const r = resolveCooldown(
      baseInput({ activeCooldowns: [cd("normal_s8")], fireKind: "button" }),
    );
    expect(r.admit).toBe(true);
  });

  it("normal_s8 + mode_tap → admit=true (強制起動)", () => {
    const r = resolveCooldown(
      baseInput({
        activeCooldowns: [cd("normal_s8")],
        fireKind: "mode_tap",
        targetMode: "daily",
      }),
    );
    expect(r.admit).toBe(true);
  });

  it("normal_s8 + critical signal 起源 → admit=true (§3.5 / v1.1 §8.4)", () => {
    const r = resolveCooldown(
      baseInput({
        activeCooldowns: [cd("normal_s8")],
        fireKind: "chip", // chip 単独では棄却、critical signal 起源で上書き
        fromCriticalSignal: true,
      }),
    );
    expect(r.admit).toBe(true);
  });
});

// ─────────────────────────────────────────────
// 6 段階優先順位 (上位棄却で下位判定なし)
// ─────────────────────────────────────────────

describe("L2-e cooldownResolver — 6 段階順位 priority order (§3.3)", () => {
  it("dignity (Tier 2) + normal_s8 (Tier 6) 同時 + mention → tier=2 棄却 (上位優先)", () => {
    const r = resolveCooldown(
      baseInput({
        activeCooldowns: [cd("dignity"), cd("normal_s8")],
        fireKind: "mention",
      }),
    );
    expect(r.admit).toBe(false);
    expect(r.tier).toBe(2);
    expect(r.respondSuppressed).toBe(true); // dignity 抑制応答
  });

  it("availability=disabled + dignity → tier=1 (availability が最上位)", () => {
    const r = resolveCooldown(
      baseInput({
        availability: "disabled",
        activeCooldowns: [cd("dignity")],
        fireKind: "mention",
      }),
    );
    expect(r.tier).toBe(1);
    expect(r.respondSuppressed).toBe(false); // tier 1 では抑制応答も返さない (§3.4 UI 非表示)
  });

  it("rupture + proposal_rejection 同時 → tier=3 棄却 (上位優先)", () => {
    const r = resolveCooldown(
      baseInput({
        activeCooldowns: [
          cd("rupture"),
          cd("proposal_rejection", { rejectedTheme: "food" }),
        ],
        theme: "food",
        fireKind: "mention",
      }),
    );
    expect(r.tier).toBe(3);
  });
});

// ─────────────────────────────────────────────
// pruneExpired helper
// ─────────────────────────────────────────────

describe("L2-e pruneExpired — 期限切れ cooldown 除外", () => {
  it("expiresAt > now の cooldown のみ残す", () => {
    const cooldowns: ActiveCooldown[] = [
      { kind: "normal_s8", expiresAt: now + 1000 },
      { kind: "rupture", expiresAt: now - 1000 }, // 期限切れ
      { kind: "dignity", expiresAt: now + 5000 },
    ];
    const pruned = pruneExpired(cooldowns, now);
    expect(pruned).toHaveLength(2);
    expect(pruned.map((c) => c.kind)).toEqual(["normal_s8", "dignity"]);
  });

  it("now と expiresAt が等しい時は除外される (>now の strict 比較)", () => {
    const cooldowns: ActiveCooldown[] = [
      { kind: "normal_s8", expiresAt: now },
    ];
    expect(pruneExpired(cooldowns, now)).toHaveLength(0);
  });
});
