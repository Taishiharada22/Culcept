/**
 * Avatar Narrative Engine
 * 分身の生命感 - アバターの活動をポエティックなナラティブに変換する
 *
 * 「あなたの分身は今日も、誰かの気配を感じていた。」
 */

// =============================================================================
// Types
// =============================================================================

export type AvatarEvent = {
  type:
    | "crossed"
    | "lingered"
    | "resonance_up"
    | "new_constellation"
    | "deep_moment";
  count?: number;
  timestamp: string;
};

export type NarrativeEntry = {
  time: string; // "朝" "昼" "夜" etc
  icon: string; // emoji
  text: string; // narrative text
};

// =============================================================================
// Narrative Templates
// =============================================================================

const NARRATIVES: Record<AvatarEvent["type"], string[]> = {
  crossed: [
    "今日、分身は{count}人の気配とすれ違いました",
    "新しい光の粒が{count}つ、分身の視界を横切りました",
    "分身は{count}人分の物語を、遠くから感じ取りました",
    "世界は広い。分身は今日{count}人の存在に触れました",
    "{count}つの異なる温度を、分身は感じ取りました",
  ],
  lingered: [
    "ある人の前で、分身が立ち止まりました",
    "時間が止まったように、その場を離れられないでいます",
    "何か懐かしいものを感じたようです",
    "分身が少しだけ、振り返りました",
    "見えない糸に引かれるように、歩みが遅くなりました",
  ],
  resonance_up: [
    "ある人との共鳴が、少し高まりました",
    "静かに、でも確かに、何かが近づいています",
    "星と星の間の距離が、わずかに縮みました",
    "見えない周波数が、ふたりの間で揺れ始めました",
    "分身が、ある方向へ自然と傾いています",
  ],
  deep_moment: [
    "言葉の奥にある何かに、分身が触れました",
    "この瞬間を、分身は忘れないでしょう",
    "深い場所で、何かが響き合いました",
    "表面の言葉を超えて、本当の声が聞こえた気がしました",
    "分身の内側で、静かな震えが走りました",
  ],
  new_constellation: [
    "新しい星座の兆しを見つけました",
    "まだ名前のない光が、空に浮かび始めました",
    "未知の星が、分身の空に現れました",
    "これまでなかった光の配列が、生まれようとしています",
    "分身の宇宙に、新しい引力が加わりました",
  ],
};

// =============================================================================
// Time of Day Mapping
// =============================================================================

function getTimeOfDay(timestamp: string): { label: string; icon: string } {
  const hour = new Date(timestamp).getHours();
  if (hour >= 5 && hour < 10) return { label: "朝", icon: "\u{1F305}" }; // 🌅
  if (hour >= 10 && hour < 17) return { label: "昼", icon: "\u{1F324}" }; // 🌤
  if (hour >= 17 && hour < 21) return { label: "夜", icon: "\u{1F319}" }; // 🌙
  return { label: "深夜", icon: "\u{1F303}" }; // 🌃
}

// =============================================================================
// Deterministic seed-based selection
// =============================================================================

function seededIndex(timestamp: string, eventIndex: number, max: number): number {
  const date = new Date(timestamp);
  const daySeed = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  const combined = daySeed * 31 + eventIndex * 7;
  return Math.abs(combined) % max;
}

// =============================================================================
// generateAvatarNarrative
// =============================================================================

export function generateAvatarNarrative(
  events: AvatarEvent[],
): NarrativeEntry[] {
  return events.map((event, index) => {
    const templates = NARRATIVES[event.type];
    if (!templates || templates.length === 0) {
      return {
        time: "不明",
        icon: "\u2728",
        text: "何かを感じています",
      };
    }

    const templateIndex = seededIndex(event.timestamp, index, templates.length);
    let text = templates[templateIndex];

    // Replace {count} placeholder
    const count = event.count ?? 0;
    text = text.replace(/\{count\}/g, String(count));

    const timeInfo = getTimeOfDay(event.timestamp);

    return {
      time: timeInfo.label,
      icon: timeInfo.icon,
      text,
    };
  });
}
