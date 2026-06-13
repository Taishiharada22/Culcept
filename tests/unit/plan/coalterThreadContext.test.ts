/**
 * coalterThreadContext — TalkBridge-A thread context section skeleton test
 *
 * 検証（CEO A tests required）:
 *   - attachedThreadRef は genome-connections.threadId から populate
 *   - threadId null → attachedThreadRef なし
 *   - session は threadId なしで成立（attachedThreadRef null）
 *   - thread speakers は SessionParticipant にならない / talk_pair_member 不生成 / identity 推論なし
 *   - thread messages は CoAlterSessionMessage でない・複製しない
 *   - thread context は extraction/projection 入力にしない（構造として condition/slot を生まない）
 *   - relation identity に /api/talk/threads(LIST) を使わない・/api/coalter なし・service_role なし
 *   - flag default OFF
 *
 *  （flag OFF/no-threadId の no-fetch・GET-only・read-only は hook の active gate + preview で担保。
 *    /talk source files untouched は diff scope。）
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  resolveAttachedThreadRef,
  resolveRelationParticipants,
  type GenomeConnectionMetadata,
} from "@/app/(culcept)/plan/tabs/coalter/coalterRelationBinding";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

const VIEWER = "user-self";
const ACCEPTED_WITH_THREAD: GenomeConnectionMetadata = {
  id: "conn-9",
  status: "accepted",
  counterpart: { userId: "user-bbb", displayName: "Mio" },
  threadId: "thread-xyz",
};

describe("TalkBridge-A resolveAttachedThreadRef（pure・relation→thread）", () => {
  it("accepted connection + threadId + 単一 target → attachedThreadRef を返す", () => {
    expect(resolveAttachedThreadRef([ACCEPTED_WITH_THREAD], ["user-bbb"])).toEqual({
      threadId: "thread-xyz",
    });
  });

  it("threadId null/欠落 → null（session は threadId なしで成立）", () => {
    expect(
      resolveAttachedThreadRef(
        [{ ...ACCEPTED_WITH_THREAD, threadId: null }],
        ["user-bbb"],
      ),
    ).toBeNull();
    expect(
      resolveAttachedThreadRef(
        [{ id: "conn-9", status: "accepted", counterpart: { userId: "user-bbb" } }],
        ["user-bbb"],
      ),
    ).toBeNull();
  });

  it("非 accepted / target 不一致 / connection id 欠落 → null", () => {
    expect(resolveAttachedThreadRef([{ ...ACCEPTED_WITH_THREAD, status: "pending" }], ["user-bbb"])).toBeNull();
    expect(resolveAttachedThreadRef([ACCEPTED_WITH_THREAD], ["user-zzz"])).toBeNull();
    expect(
      resolveAttachedThreadRef([{ ...ACCEPTED_WITH_THREAD, id: undefined }], ["user-bbb"]),
    ).toBeNull();
  });

  it("target が 0 / 2+（曖昧）→ null（勝手に選ばない・単一 counterpart 限定）", () => {
    expect(resolveAttachedThreadRef([ACCEPTED_WITH_THREAD], [])).toBeNull();
    expect(resolveAttachedThreadRef([ACCEPTED_WITH_THREAD], ["user-bbb", "user-ccc"])).toBeNull();
  });

  it("同一 target に accepted+threadId が 2+ → 曖昧で null", () => {
    expect(
      resolveAttachedThreadRef(
        [
          { id: "c1", status: "accepted", counterpart: { userId: "user-bbb" }, threadId: "t1" },
          { id: "c2", status: "accepted", counterpart: { userId: "user-bbb" }, threadId: "t2" },
        ],
        ["user-bbb"],
      ),
    ).toBeNull();
  });

  it("participant 解決は threadId を無視（identity に thread を混ぜない・C-1 不変）", () => {
    const r = resolveRelationParticipants({
      connections: [ACCEPTED_WITH_THREAD],
      viewerUserId: VIEWER,
      targetCounterpartUserIds: ["user-bbb"],
    });
    expect(r.bound).toBe(true);
    if (!r.bound) return;
    for (const p of r.participants) {
      // thread 由来の値が participant/source に混入しない
      expect(JSON.stringify(p)).not.toContain("thread-xyz");
      expect(JSON.stringify(p)).not.toContain("threadId");
      expect(p.source.kind).not.toBe("talk_pair_member");
    }
  });
});

describe("TalkBridge-A 境界 / flag / source guard", () => {
  it("flag default OFF: coalterThreadContext=false", () => {
    expect(PLAN_FLAGS.coalterThreadContext).toBe(false);
  });

  it("文脈セクション/hook ファイルは read-only・identity/extraction を生まない（source guard）", () => {
    const dir = join(process.cwd(), "app/(culcept)/plan/tabs/coalter");
    const files = [
      "useCoAlterThreadContext.ts",
      "CoAlterThreadContextSection.tsx",
    ];
    for (const f of files) {
      const src = readFileSync(join(dir, f), "utf8");
      const importSpecs = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      // 書き込み/副作用 API・service_role を持たない
      expect(/["'`]\/api\/coalter/.test(src), `${f}: no /api/coalter`).toBe(false);
      expect(src.includes("SUPABASE_SERVICE_ROLE_KEY"), `${f}: no service_role`).toBe(false);
      // import 解析（コメント言及で誤検出しない）: supabase / useCoAlter(823) / session message・session 契約を import しない
      for (const spec of importSpecs) {
        expect(spec.includes("supabase"), `${f}: import ${spec}`).toBe(false);
        expect(/\/useCoAlter$/.test(spec), `${f}: import ${spec}`).toBe(false);
        // session message / session participant 契約を import しない＝変換・昇格が構造的に不可
        expect(spec.includes("coalterSessionMessageContract"), `${f}: import ${spec}`).toBe(false);
        expect(spec.includes("coalterPlanSessionContract"), `${f}: import ${spec}`).toBe(false);
      }
      // 既読/送信/realtime の痕跡なし
      expect(/["'`][^"'`]*\/read["'`]/.test(src), `${f}: no read receipt URL`).toBe(false);
      expect(src.includes(".channel("), `${f}: no realtime channel`).toBe(false);
      expect(/method:\s*["'](POST|PATCH|DELETE)["']/.test(src), `${f}: no write method`).toBe(false);
    }
  });

  it("coalter フォルダ全体が ≥7 ファイルで guard 対象（thread context 追加後も維持）", () => {
    const dir = join(process.cwd(), "app/(culcept)/plan/tabs/coalter");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
    expect(files.length).toBeGreaterThanOrEqual(7);
  });
});
