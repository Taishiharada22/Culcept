/**
 * lib/plan/candidateLens/placeDetailsAdapter.ts
 *   — Candidate Lens / Phase 4-a: Place Details adapter **interface ＋ Fake のみ**
 *
 * ★スコープ厳守（CEO 2026-06-16・P4-a 条件付き GO）:
 *   - P4-a で提供するのは **adapter interface ＋ FakePlaceDetailsAdapter（fixtures のみ）** だけ。
 *   - **実 Google adapter / actual fetch / API route / network は P4-b 以降**（本ファイルには置かない）。
 * ★adapter は **任意 field mask を受け取らない**設計（mask は placeDetailsEnrichment.ts の定数に固定）。
 *   → fetchDetails の引数は placeId と AbortSignal のみ。mask を外から差し込めない。
 * ★fail-open: fetchDetails は **reject しない**。失敗も error を載せて resolve する。
 * ★pure: network/外部 API/Date 不使用（Fake は固定 fixtures を返すだけ）。
 */
import type {
  PlaceDetailsEnrichment,
  EnrichedPhoto,
  EnrichedHours,
} from "@/lib/plan/candidateLens/placeDetailsEnrichment";
import { buildEnrichedHours } from "@/lib/plan/candidateLens/placeDetailsEnrichment";

/**
 * Place Details adapter（実装は P4-b の Google adapter で差し替え）。
 *   ★opts に field mask は無い（任意 mask 注入を構造的に不可能化）。
 */
export interface PlaceDetailsAdapter {
  /** placeId → enrichment。fail-open（reject せず error を載せて resolve）。 */
  fetchDetails(placeId: string, opts?: { signal?: AbortSignal }): Promise<PlaceDetailsEnrichment>;
}

// ───────────────────────── enrichment builder（fixtures 用・pure） ─────────────────────────

function makeEnrichment(over: Partial<PlaceDetailsEnrichment> & { placeId: string }): PlaceDetailsEnrichment {
  return {
    provenance: "google_places",
    photo: null,
    hours: null,
    fetchStatus: "ok",
    error: null,
    fetchedAtMs: null, // ★session-only。Fake では時刻を入れない（永続化しない・Date 不使用）。
    ...over,
  };
}

const SAMPLE_PHOTO: EnrichedPhoto = {
  name: "places/FAKE_PLACE/photos/FAKE_REF",
  widthPx: 1600,
  heightPx: 1200,
  authorAttributions: [{ displayName: "Taro Y.", uri: "https://example.test/u/taro", photoUri: "https://example.test/u/taro.png" }],
};

const PHOTO_NO_ATTRIB: EnrichedPhoto = {
  name: "places/FAKE_PLACE2/photos/FAKE_REF2",
  widthPx: 800,
  heightPx: 600,
  authorAttributions: [], // 空配列（policy 上 表示義務なし・displayable は可）
};

const HOURS_OPEN: EnrichedHours = buildEnrichedHours({ openNow: true, weekdayDescriptions: ["月曜日: 9時00分～18時00分", "火曜日: 9時00分～18時00分"] });
const HOURS_CLOSED: EnrichedHours = buildEnrichedHours({ openNow: false, weekdayDescriptions: ["日曜日: 定休日"] });
const HOURS_UNKNOWN: EnrichedHours = buildEnrichedHours({ openNow: null, weekdayDescriptions: ["営業時間: 店舗にお問い合わせください"] });

/**
 * ★Fake fixtures（test 用 6 ケース・placeId キー）。network なし。
 */
export const FAKE_ENRICHMENTS: Readonly<Record<string, PlaceDetailsEnrichment>> = Object.freeze({
  fake_withPhotoAndHours: makeEnrichment({ placeId: "fake_withPhotoAndHours", photo: SAMPLE_PHOTO, hours: HOURS_OPEN }),
  fake_photoOnly: makeEnrichment({ placeId: "fake_photoOnly", photo: PHOTO_NO_ATTRIB, hours: null }),
  fake_hoursOnly: makeEnrichment({ placeId: "fake_hoursOnly", photo: null, hours: HOURS_CLOSED }),
  fake_hoursOpenNowNull: makeEnrichment({ placeId: "fake_hoursOpenNowNull", photo: null, hours: HOURS_UNKNOWN }),
  fake_empty: makeEnrichment({ placeId: "fake_empty", photo: null, hours: null }),
  fake_errorTimeout: makeEnrichment({
    placeId: "fake_errorTimeout",
    fetchStatus: "error",
    error: { kind: "timeout", message: "fake timeout (1500ms)" },
  }),
});

/** 未知 placeId 用の空 enrichment（fail-open → 全 fallback）。 */
function makeEmptyOk(placeId: string): PlaceDetailsEnrichment {
  return makeEnrichment({ placeId });
}

/**
 * ★P4-a の唯一の adapter 実体: fixtures を返すだけ（network/実 API なし）。
 *   - 既知 placeId → 対応 fixture。未知 → 空 ok enrichment（fallback）。
 *   - **reject しない**（fail-open contract）。
 *   - field mask を引数に取らない（定数固定）。
 */
export class FakePlaceDetailsAdapter implements PlaceDetailsAdapter {
  constructor(private readonly responses: Readonly<Record<string, PlaceDetailsEnrichment>> = FAKE_ENRICHMENTS) {}

  async fetchDetails(placeId: string, _opts?: { signal?: AbortSignal }): Promise<PlaceDetailsEnrichment> {
    const hit = this.responses[placeId];
    return hit ?? makeEmptyOk(placeId);
  }
}
