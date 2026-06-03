/**
 * Slice 2 (Option B-3) — 予定 (ExternalAnchor) → コーデ文脈 event への純粋写像
 *
 * 役割 (この層の本質):
 *   - `/plan` の予定を「服推薦が理解できる TPO 文脈」へ翻訳する **再利用可能な中間層**。
 *   - UI 表示カード / 将来のコーデ推薦エンジン入力 / コーデ理由生成 が共通で読める語彙にする。
 *   - **engine には接続しない** (generateTodayProposal を呼ばない)。 ここは文脈抽出のみ。
 *
 * 設計判断 (調査に基づく):
 *   - 内部 VM (`OutfitContextEvent`) を持ち、 engine 入力型に **直接ロックしない**。
 *     理由: `lib/shared/outfitEngine` は `/calendar/_lib` と (generator 経由で) `@supabase/supabase-js`
 *     を巻き込むため、 型 import だけでも client/server 境界が重くなる。 → 疎結合な内部 VM にする。
 *   - 構造化フィールドを最優先で使う (naive な title 正規表現に頼らない):
 *       placeKind ← `anchor.locationCategory` (home/office/school/cafe/outdoor/public/transit/unknown)
 *       fixed     ← `anchor.rigidity === "hard"`
 *       formality ← `sensitiveCategory` (exam/legal=きちんと) も加味 (※ privacy: 機微の中身は tag に出さない)
 *   - 横断推論 (人間的判断): place × title × time × social × sensitivity を突き合わせて formality 等を決める。
 *   - 語彙整合: activityKind は将来 engine の event_type (EVENT_STYLE_MAP: work/meeting/date/party/
 *     casual/outdoor/sports/travel) へ写像しやすい粒度にしてある (B-4 で薄い projection を書く)。
 *
 * 不変原則:
 *   - pure。 副作用 / 現在時刻参照 / I/O / DB / engine / AI なし。 入力 anchors を mutate しない。
 *   - title / location が欠けても落ちない (unknown へ安全に倒す)。
 *   - 機微カテゴリ (medical/legal/exam) の **具体内容を reasonTags に出さない** (共有除外原則の尊重)。
 */

import type {
  AnchorSensitiveCategory,
  ExternalAnchor,
} from "@/lib/plan/external-anchor";
import type { LocationCategory } from "@/lib/plan/location-category";

import { anchorsForDay, formatTime, isoDate } from "../_helpers";

// ── 内部 VM 語彙 ──

export type OutfitPlaceKind =
  | "home"
  | "office"
  | "school"
  | "cafe"
  | "restaurant"
  | "outdoor"
  | "station"
  | "gym"
  | "online"
  | "public"
  | "unknown";

export type OutfitActivityKind =
  | "work"
  | "meeting"
  | "meal"
  | "errand"
  | "move"
  | "exercise"
  | "rest"
  | "social"
  | "unknown";

/** EVENT_STYLE_MAP (engine) と整合する人間可読フォーマル度 (表示・理由用) */
export type OutfitFormality = "casual" | "smart_casual" | "office" | "formal" | "unknown";

export type OutfitMobility = "none" | "low" | "medium" | "high" | "unknown";

export type OutfitSocialContext = "solo" | "friend" | "client" | "team" | "unknown";

export type OutfitTimeOfDay = "morning" | "day" | "evening" | "night" | "unknown";

/**
 * 1 予定のコーデ文脈 (内部 VM)。 UI / engine / 理由生成 が共通で読む再利用層。
 */
export interface OutfitContextEvent {
  id: string;
  /** YYYY-MM-DD (この event が属する日) */
  date: string;
  title: string;
  /** "HH:MM" */
  startTime?: string;
  /** "HH:MM" */
  endTime?: string;
  timeOfDay: OutfitTimeOfDay;
  /** 場所の自由記述ラベル (locationText 由来) */
  locationLabel?: string;
  placeKind: OutfitPlaceKind;
  activityKind: OutfitActivityKind;
  formality: OutfitFormality;
  mobility: OutfitMobility;
  socialContext: OutfitSocialContext;
  /** rigidity === "hard" (動かせない固定予定) */
  fixed: boolean;
  /** コーデ理由カード用の privacy-safe なタグ (機微の中身は出さない) */
  reasonTags: string[];
}

// ── 時刻帯 (既存 _helpers の categoryTimeSignature と同じ帯を踏襲) ──

export function inferTimeOfDay(startTime: string | undefined): OutfitTimeOfDay {
  if (!startTime) return "unknown";
  const hour = Number(startTime.slice(0, 2));
  if (!Number.isFinite(hour)) return "unknown";
  if (hour >= 5 && hour <= 10) return "morning";
  if (hour >= 11 && hour <= 16) return "day";
  if (hour >= 17 && hour <= 21) return "evening";
  return "night";
}

// ── placeKind: locationCategory を base に、 title/locationText の具体語で上書き ──

const LOCATION_CATEGORY_TO_PLACE: Record<LocationCategory, OutfitPlaceKind> = {
  home: "home",
  office: "office",
  school: "school",
  cafe: "cafe",
  outdoor: "outdoor",
  public: "public",
  transit: "station",
  unknown: "unknown",
};

/** title/locationText の具体語 → placeKind (locationCategory より具体的なら優先) */
function placeKindFromText(text: string): OutfitPlaceKind | null {
  const t = text.toLowerCase();
  if (/(カフェ|coffee|cafe|スタバ|スターバックス|ドトール|喫茶)/.test(t)) return "cafe";
  if (/(レストラン|restaurant|ディナー|dinner|ランチ|lunch|居酒屋|外食|焼肉|寿司|ビストロ|food)/.test(t)) return "restaurant";
  if (/(ジム|gym|フィットネス|筋トレ|トレーニング|ヨガ|yoga|プール|pool)/.test(t)) return "gym";
  if (/(オンライン|online|zoom|ズーム|meet|teams|リモート|web会議|ウェビナー)/.test(t)) return "online";
  if (/(駅|station|空港|airport|バス停)/.test(t)) return "station";
  if (/(オフィス|office|会社|勤務|職場|会議室|本社|支社|オフィース)/.test(t)) return "office";
  if (/(自宅|在宅|家|home|マイホーム)/.test(t)) return "home";
  if (/(公園|park|屋外|outdoor|ハイキング|キャンプ|ビーチ|海|山)/.test(t)) return "outdoor";
  if (/(学校|大学|school|キャンパス|授業|講義)/.test(t)) return "school";
  return null;
}

export function inferPlaceKind(anchor: ExternalAnchor): OutfitPlaceKind {
  // 1) title / locationText の具体語 (最も具体的) を優先
  const text = `${anchor.title ?? ""} ${anchor.locationText ?? ""}`.trim();
  const fromText = text ? placeKindFromText(text) : null;
  if (fromText) return fromText;
  // 2) 構造化 locationCategory
  if (anchor.locationCategory) return LOCATION_CATEGORY_TO_PLACE[anchor.locationCategory] ?? "unknown";
  return "unknown";
}

// ── activityKind: title 語 → 不足は placeKind から補完 ──

function activityKindFromText(text: string): OutfitActivityKind | null {
  const t = text.toLowerCase();
  if (/(会議|ミーティング|mtg|打ち合わせ|打合せ|商談|面談|面接|プレゼン|presentation|meeting)/.test(t)) return "meeting";
  if (/(作業|集中|企画|資料|仕事|業務|タスク|開発|執筆|勉強|work)/.test(t)) return "work";
  if (/(ランチ|ディナー|食事|ご飯|ごはん|飲み|外食|lunch|dinner|お茶|カフェ会|会食|宴)/.test(t)) return "meal";
  if (/(ジム|運動|トレーニング|筋トレ|ヨガ|ランニング|yoga|gym|workout|スポーツ|練習)/.test(t)) return "exercise";
  if (/(移動|電車|バス|通勤|通学|送迎|ドライブ|フライト|出発|train|move)/.test(t)) return "move";
  if (/(買い物|買物|役所|用事|銀行|郵便|受け取り|手続き|通院|診察|errand|shopping)/.test(t)) return "errand";
  if (/(友達|友人|デート|遊び|パーティ|party|飲み会|集まり|交流|社交)/.test(t)) return "social";
  if (/(休|休憩|休息|昼寝|リラックス|rest|off)/.test(t)) return "rest";
  return null;
}

function activityKindFromPlace(place: OutfitPlaceKind): OutfitActivityKind {
  switch (place) {
    case "restaurant":
      return "meal";
    case "gym":
      return "exercise";
    case "office":
      return "work";
    case "online":
      return "meeting";
    case "station":
      return "move";
    case "home":
      return "rest";
    case "school":
      return "work";
    default:
      return "unknown";
  }
}

export function inferActivityKind(anchor: ExternalAnchor, place: OutfitPlaceKind): OutfitActivityKind {
  const text = `${anchor.title ?? ""} ${anchor.locationText ?? ""}`.trim();
  const fromText = text ? activityKindFromText(text) : null;
  if (fromText) return fromText;
  return activityKindFromPlace(place);
}

// ── socialContext ──

export function inferSocialContext(anchor: ExternalAnchor): OutfitSocialContext {
  const t = `${anchor.title ?? ""} ${anchor.locationText ?? ""}`.toLowerCase();
  if (/(商談|取引先|顧客|client|お客様|先方|面接|面談|営業)/.test(t)) return "client";
  if (/(会議|チーム|team|打ち合わせ|打合せ|mtg|部署|社内)/.test(t)) return "team";
  if (/(友達|友人|デート|date|飲み会|遊び|family|家族|彼|彼女)/.test(t)) return "friend";
  return "solo";
}

// ── formality: 横断推論 (機微カテゴリも加味、 ただし中身は外に出さない) ──

export function inferFormality(
  activity: OutfitActivityKind,
  place: OutfitPlaceKind,
  social: OutfitSocialContext,
  sensitive: AnchorSensitiveCategory | undefined,
  text: string,
): OutfitFormality {
  const t = text.toLowerCase();
  // 最もきちんと: 面接 / 試験 / 法的手続き
  if (/(面接|面談|試験|入試|審査)/.test(t)) return "formal";
  if (sensitive === "exam" || sensitive === "legal") return "formal";
  // 商談・顧客対応・会議・オフィス
  if (social === "client") return "office";
  if (activity === "meeting" || place === "office") return "office";
  // 食事 / カフェ / 外
  if (place === "restaurant" || activity === "meal") return "smart_casual";
  if (place === "cafe") return "smart_casual";
  // 運動 / 屋外 / 在宅 / 休息
  if (activity === "exercise" || place === "gym" || place === "outdoor") return "casual";
  if (activity === "rest" || place === "home") return "casual";
  return "unknown";
}

// ── reasonTags: privacy-safe な人間可読タグ ──

function buildReasonTags(ev: {
  activityKind: OutfitActivityKind;
  placeKind: OutfitPlaceKind;
  formality: OutfitFormality;
  mobility: OutfitMobility;
  timeOfDay: OutfitTimeOfDay;
  socialContext: OutfitSocialContext;
}): string[] {
  const tags: string[] = [];
  if (ev.activityKind === "meeting") tags.push("会議あり");
  if (ev.placeKind === "cafe" && (ev.activityKind === "work" || ev.activityKind === "unknown"))
    tags.push("カフェ作業");
  if (ev.activityKind === "meal" || ev.placeKind === "restaurant") tags.push("外食");
  if ((ev.placeKind === "office" || ev.formality === "office") && ev.activityKind !== "meeting")
    tags.push("オフィス");
  if (ev.activityKind === "exercise" || ev.placeKind === "gym") tags.push("運動あり");
  if (ev.mobility === "high") tags.push("移動多め");
  if (ev.timeOfDay === "evening" && ev.socialContext === "friend") tags.push("夜のお出かけ");
  // formal は機微 (面接/試験/法務) も合流するが、 中身は出さず「きちんとした場」に丸める
  if (ev.formality === "formal" || ev.socialContext === "client") tags.push("きちんとした場");
  // 重複除去
  return Array.from(new Set(tags));
}

// ── mobility: 自身 + 前後の場所差から簡易推定 (正確な移動量は後続 Slice) ──

function baseMobility(place: OutfitPlaceKind, activity: OutfitActivityKind): OutfitMobility {
  if (activity === "move" || place === "station") return "high";
  return "low";
}

function refineMobility(
  self: { placeKind: OutfitPlaceKind; activityKind: OutfitActivityKind },
  prev: { placeKind: OutfitPlaceKind } | undefined,
  next: { placeKind: OutfitPlaceKind } | undefined,
): OutfitMobility {
  const base = baseMobility(self.placeKind, self.activityKind);
  if (base === "high") return "high";
  const differs = (n?: { placeKind: OutfitPlaceKind }) =>
    n != null && n.placeKind !== "unknown" && self.placeKind !== "unknown" && n.placeKind !== self.placeKind;
  if (differs(prev) || differs(next)) return "medium";
  return "low";
}

// ── 1 anchor → OutfitContextEvent (mobility 以外を確定) ──

function buildBaseEvent(anchor: ExternalAnchor, date: string): Omit<OutfitContextEvent, "mobility" | "reasonTags"> {
  const startTime = anchor.startTime ? formatTime(anchor.startTime) : undefined;
  const endTime = anchor.endTime ? formatTime(anchor.endTime) : undefined;
  const timeOfDay = inferTimeOfDay(startTime);
  const placeKind = inferPlaceKind(anchor);
  const activityKind = inferActivityKind(anchor, placeKind);
  const socialContext = inferSocialContext(anchor);
  const text = `${anchor.title ?? ""} ${anchor.locationText ?? ""}`.trim();
  const formality = inferFormality(activityKind, placeKind, socialContext, anchor.sensitiveCategory, text);

  return {
    id: anchor.id,
    date,
    title: anchor.title ?? "",
    ...(startTime ? { startTime } : {}),
    ...(endTime ? { endTime } : {}),
    timeOfDay,
    ...(anchor.locationText ? { locationLabel: anchor.locationText } : {}),
    placeKind,
    activityKind,
    formality,
    socialContext,
    fixed: anchor.rigidity === "hard",
  };
}

/**
 * 指定日の anchors → OutfitContextEvent[] (時刻順)。
 *   - 予定が無ければ空配列。
 *   - title / location 欠落でも落ちない (unknown へ安全に倒す)。
 *   - mobility は前後の場所差から簡易推定 (engine は呼ばない)。
 */
export function anchorsToOutfitEvents(
  anchors: ExternalAnchor[],
  dayObj: Date,
): OutfitContextEvent[] {
  const date = isoDate(dayObj);
  const dayAnchors = anchorsForDay(anchors, dayObj); // 時刻順
  const base = dayAnchors.map((a) => buildBaseEvent(a, date));

  return base.map((ev, i) => {
    const mobility = refineMobility(ev, base[i - 1], base[i + 1]);
    const reasonTags = buildReasonTags({
      activityKind: ev.activityKind,
      placeKind: ev.placeKind,
      formality: ev.formality,
      mobility,
      timeOfDay: ev.timeOfDay,
      socialContext: ev.socialContext,
    });
    return { ...ev, mobility, reasonTags };
  });
}
