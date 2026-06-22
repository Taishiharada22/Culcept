/**
 * lib/plan/postVisit/postVisitAnchorContext.ts
 *   — 評価OS / Stage 3-B: 経過済み予定(anchor) から post-visit 答え合わせの context を導く pure helper
 *
 * ★狙い: Candidate Lens で選んだ場所は anchor.locationText に書かれる。経過した anchor から答え合わせを出せば
 *   主フローで観測が貯まり、②③/LocationDetailSheet の Fit-Arc が同 placeKey で意味を持つ。
 * ★placeKey 一致の要: anchor の canonical `displayName · address` を parse → `${displayName} ${address}` で
 *   再構成すると、lens の `opaquePlaceKey(`${name} ${address}`)` と normalizeLocationText 経由で完全一致。
 * ★privacy: sensitiveCategory は **suppress 判定にのみ使い、保存しない**。生 locationText/住所/GPS/滞在分は使わない。
 * ★pure: Date.now() を内部で呼ばない（now は呼び出し側が渡す）。
 */
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { parseCanonicalLocationText } from "@/lib/shared/canonicalLocationText";

/** 経過済みとして扱う最大過去窓（古すぎる予定は聞かない）。 */
export const PAST_ANCHOR_RECENT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** YYYY-MM-DD + (HH:mm | ISO) → ローカル timestamp（ms）。失敗で null。pure。 */
function toLocalTimestamp(dateYmd: string, time: string | undefined): number | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateYmd);
  if (!dm) return null;
  const y = Number(dm[1]);
  const mo = Number(dm[2]);
  const d = Number(dm[3]);
  let h = 23;
  let mi = 59;
  if (time) {
    const tm = /(\d{1,2}):(\d{2})/.exec(time);
    if (tm) {
      h = Number(tm[1]);
      mi = Number(tm[2]);
    }
  }
  const ts = new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
  return Number.isFinite(ts) ? ts : null;
}

/**
 * 「経過済み × 場所付き」判定（pure）。
 *   - one_off のみ対象（recurring=日常は habitual で suppress 対象・終了時刻判定も複雑なので除外）。
 *   - locationText 非空（場所がある）。
 *   - 予定終了（endTime 無ければ startTime）が now 以前、かつ直近窓内。
 */
export function isPastAnchorWithPlace(anchor: ExternalAnchor, now: number): boolean {
  if (anchor.anchorKind !== "one_off") return false;
  if (!anchor.locationText || anchor.locationText.trim().length === 0) return false;
  const end = toLocalTimestamp(anchor.date, anchor.endTime ?? anchor.startTime);
  if (end == null) return false;
  return end <= now && now - end <= PAST_ANCHOR_RECENT_WINDOW_MS;
}

/** anchor から導く trigger/suppress フラグ（pure・store 読み出しは含まない）。 */
export interface AnchorElicitFlags {
  /** lens と同一キーになる descriptor（canonical を parse→再構成）。 */
  readonly placeDescriptor: string;
  readonly isPastPlan: true;
  readonly isImportantPlan: boolean;
  readonly isDiscoveryDomain: boolean;
  readonly isSensitive: boolean;   // sensitiveCategory != null（保存せず suppress のみ）
  readonly isHomeOrWork: boolean;  // locationCategory home/office/school
  readonly isHabitual: boolean;    // locationCategory transit（recurring は isPastAnchorWithPlace で除外済み）
}

/**
 * 経過 anchor → ElicitContext 用フラグ（pure）。
 *   placeDescriptor は lens キーと一致するよう `${displayName} ${address}` で組む。
 */
export function deriveAnchorElicitFlags(anchor: ExternalAnchor): AnchorElicitFlags {
  const { displayName, address } = parseCanonicalLocationText(anchor.locationText ?? "");
  const cat = anchor.locationCategory;
  return {
    placeDescriptor: `${displayName} ${address ?? ""}`, // normalizeLocationText が末尾空白を吸収＝lens と一致
    isPastPlan: true,
    isImportantPlan: anchor.rigidity === "hard",
    isDiscoveryDomain: false, // v1（将来 source/category から）
    isSensitive: anchor.sensitiveCategory != null,
    isHomeOrWork: cat === "home" || cat === "office" || cat === "school",
    isHabitual: cat === "transit",
  };
}
