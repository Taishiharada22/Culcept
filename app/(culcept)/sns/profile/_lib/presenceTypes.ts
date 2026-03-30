/* ── Core types for Presence page ── */

export type Tab = "mirror" | "depth" | "change" | "relations" | "self";

export type PresenceLoadState = "loading" | "ready" | "error";

export type EvidenceShape = {
    lanes: string[];
    likes: string[];
    avoid: string[];
    tags: string[];
    people: { hard_include: string[]; soft_include: string[]; hard_exclude: string[]; soft_exclude: string[]; handshake_rules: string[] };
    market: { hard_include: string[]; soft_include: string[]; hard_exclude: string[]; soft_exclude: string[]; handshake_rules: string[] };
    isPublic: boolean;
};

/* ── Re-export API response types ── */

export type { PulseResponse } from "@/app/api/sns/presence/pulse/route";
export type { MomentResponse } from "@/app/api/sns/presence/moment/route";
export type { DepthResponse } from "@/app/api/sns/presence/depth/route";
export type { MetamorphosisResponse } from "@/app/api/sns/presence/metamorphosis/route";
export type { RelationsResponse } from "@/app/api/sns/presence/relations/route";
export type { SelfResponse } from "@/app/api/sns/presence/self/route";
export type { SeekResponse, SeekBlock } from "../_lib/presenceDefaults";
