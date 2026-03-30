// components/rendezvous/AvatarStoryTypes.ts
// Rendezvous Phase 2: Daily Touchpoint shared types

export type RendezvousCategory = "romantic" | "friendship" | "cocreation" | "community" | "partner";

export type ReactionEmoji = "\uD83D\uDD25" | "\uD83D\uDC8E" | "\uD83D\uDE02" | "\uD83C\uDFAF" | "\uD83E\uDD14" | "\uD83D\uDE24";

export const REACTION_EMOJIS: ReactionEmoji[] = [
  "\uD83D\uDD25", "\uD83D\uDC8E", "\uD83D\uDE02", "\uD83C\uDFAF", "\uD83E\uDD14", "\uD83D\uDE24",
];

export const CATEGORY_LABELS: Record<RendezvousCategory, string> = {
  romantic: "\uD83D\uDC95\u604B\u611B",
  friendship: "\uD83D\uDC65\u53CB\u9054",
  cocreation: "\uD83D\uDCA1\u5171\u5275",
  community: "\uD83C\uDF0D\u30B3\u30DF\u30E5\u30CB\u30C6\u30A3",
  partner: "\uD83E\uDD1D\u30D1\u30FC\u30C8\u30CA\u30FC",
};

export const CATEGORY_COLORS: Record<RendezvousCategory, string> = {
  romantic: "from-pink-500 to-rose-400",
  friendship: "from-sky-500 to-blue-400",
  cocreation: "from-amber-500 to-yellow-400",
  community: "from-emerald-500 to-green-400",
  partner: "from-orange-400 to-amber-500",
};

export const CATEGORY_TEXT_COLORS: Record<RendezvousCategory, string> = {
  romantic: "text-pink-600",
  friendship: "text-sky-600",
  cocreation: "text-amber-600",
  community: "text-emerald-600",
  partner: "text-orange-600",
};

export const CATEGORY_BG_COLORS: Record<RendezvousCategory, string> = {
  romantic: "bg-pink-50 border-pink-200",
  friendship: "bg-sky-50 border-sky-200",
  cocreation: "bg-amber-50 border-amber-200",
  community: "bg-emerald-50 border-emerald-200",
  partner: "bg-orange-50 border-orange-200",
};

// ---------------------------------------------------------------------------
// AvatarStory (Morning story viewer)
// ---------------------------------------------------------------------------

export interface ChatBubble {
  sender: "my_avatar" | "their_avatar";
  text: string;
}

export interface AvatarStory {
  id: string;
  candidatePhoto?: string;
  candidateName: string;
  corePhrase: string;
  conversationHighlight: ChatBubble[];
  summary: string;
  category: RendezvousCategory;
}

// ---------------------------------------------------------------------------
// ConversationLog (Commute reader)
// ---------------------------------------------------------------------------

export interface ConversationMessage {
  id: string;
  sender: "my_avatar" | "their_avatar" | "system_insight";
  text: string;
  timestamp: string;
  reactions?: ReactionEmoji[];
}

export interface ConversationLog {
  id: string;
  messages: ConversationMessage[];
}

export interface CandidateInfo {
  id: string;
  name: string;
  photo?: string;
  corePhrase: string;
  category: RendezvousCategory;
}

// ---------------------------------------------------------------------------
// FlashEncounter (Lunch flash)
// ---------------------------------------------------------------------------

export type FlashEventStatus = "upcoming" | "active" | "expired";

export interface FlashParticipant {
  id: string;
  name: string;
  photo?: string;
  corePhrase: string;
  snippet: string;
}

export interface FlashEvent {
  id: string;
  type: "lunch" | "evening";
  endsAt: Date;
  status: FlashEventStatus;
  participantsPreview: FlashParticipant[];
}

// ---------------------------------------------------------------------------
// LiveConversation (Afternoon real-time)
// ---------------------------------------------------------------------------

export type LiveConversationState = "streaming" | "paused" | "ended";

export interface LiveConversation {
  id: string;
  state: LiveConversationState;
  messages: ConversationMessage[];
  isTyping?: boolean;
  typingSender?: "my_avatar" | "their_avatar";
}

// ---------------------------------------------------------------------------
// UniverseFeed (Evening feed)
// ---------------------------------------------------------------------------

export type FeedItemType =
  | "new_encounter"
  | "relationship_update"
  | "group_activity"
  | "cocreation_match"
  | "baton_ready"
  | "milestone";

export interface FeedItem {
  id: string;
  category: RendezvousCategory | "all";
  type: FeedItemType;
  title: string;
  subtitle: string;
  candidateInfo?: CandidateInfo;
  groupIcon?: string;
  timestamp: string;
  actionUrl?: string;
}

// ---------------------------------------------------------------------------
// BatonChange (Night handoff)
// ---------------------------------------------------------------------------

export interface PinnedHighlight {
  id: string;
  text: string;
  fromMessage: string;
}

export interface SyncQuestion {
  id: string;
  question: string;
  type: "text" | "choice";
  choices?: string[];
}

export interface BatonChangeContext {
  conversationId: string;
  candidateInfo: CandidateInfo;
  avatarConversation: ConversationMessage[];
  pinnedHighlights: PinnedHighlight[];
  syncQuestion: SyncQuestion;
}

// ---------------------------------------------------------------------------
// AnimaDailyReflection (Before bed)
// ---------------------------------------------------------------------------

export interface SkillGrowthItem {
  label: string;
  before: number; // 0-100
  after: number;  // 0-100
}

export interface AnimaInsight {
  text: string;
  mood: "warm" | "reflective" | "encouraging";
}

export interface DailyReflectionData {
  stats: {
    newEncounters: number;
    deepenedRelationships: number;
    avatarGrowth: number; // percentage
  };
  animaInsight: AnimaInsight;
  skillGrowth: SkillGrowthItem[];
}
