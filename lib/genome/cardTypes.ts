// lib/genome/cardTypes.ts
// Genome Card 型定義

import type { PersonaGenome, GenomeVisualizationData } from "@/lib/aneurasync/personaGenome";

/** 公開レベル: 1=基本, 2=レーダー, 3=全詳細 */
export type VisibilityLevel = 1 | 2 | 3;

/** 接続ステータス */
export type ConnectionStatus = "pending" | "accepted" | "declined" | "blocked";

/** Genome Card データ（全レベル統合型、visibility で表示制御） */
export interface GenomeCardData {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  // Lv1: 基本情報
  archetypeLabel: string | null;     // アーキタイプ名
  summaryLine: string | null;        // 一行サマリー
  completeness: number;              // 0-100
  // Lv2: レーダー + 特性
  layerCompleteness: {
    physical: number;
    personality: number;
    behavioral: number;
    social: number;
  } | null;
  topTraits: Array<{ id: string; label: string; score: number }> | null;
  pcSeason: string | null;           // パーソナルカラー季節
  topStyleLanes: string[] | null;    // スタイル上位3レーン
  // Lv3: 全詳細
  genome: PersonaGenome | null;
  visualization: GenomeVisualizationData | null;

  // ─── パーソナル洞察（次元矛盾から動的生成）───
  personalInsights?: Array<{
    insight: string;
    question: string;
  }> | null;

  // ─── ジャーニー統計（感情設計用）───
  journeyStats?: {
    totalObservations: number;   // 総観測回数
    currentStreak: number;       // 現在の連続日数
    bestStreak: number;          // 最長連続日数
    dimensionsCovered: number;   // カバーした次元数（/15）
    stability: number;           // 安定度 0-100
    cardLevel: number;           // カードレベル 1-4
    cardLevelLabel: string;      // レベル名
    daysSinceFirst: number;      // 初回観測からの日数
  } | null;

  // ─── カード表面（相手に見せる面）───
  cardFront?: {
    coreValue: string | null;        // 「私が最も守っていること」(motto)
    dilemma: string | null;          // 「私が迷うとき」(innerContradiction)
    currentCuriosity: string | null; // 「今、気になっていること」(Daily Observation)
    lastObservedAt: string | null;   // 最終観測日時
    secretDesire: string | null;     // 「本当はこう思ってる」(隠された願い)
    childhoodScene: string | null;   // 「子供の頃の原風景」
  } | null;

  // ─── カード裏面（交換後に見える面）───
  cardBack?: {
    bodyTraits: string | null;       // 顔型・骨格・印象など
    radarAxes: {                     // 5軸レーダー
      analytical: number;
      cautious: number;
      social: number;
      expressive: number;
      independent: number;
    } | null;
    talkSuggestion: string | null;   // 「この人と話してみたいこと」(AI生成)
    lovePattern: string | null;      // 恋愛パターン
    midnightThought: string | null;  // 深夜の独白
    strengths: string[] | null;      // 強み
    blindSpot: string | null;        // 死角
    stressResponse: string | null;   // ストレス時の行動
    quote: { text: string; author: string } | null;  // 体現する名言
  } | null;
}

/** 接続情報 */
export interface GenomeConnection {
  id: string;
  requesterId: string;
  targetId: string;
  status: ConnectionStatus;
  visibilityRequester: VisibilityLevel;
  visibilityTarget: VisibilityLevel;
  createdAt: string;
  respondedAt: string | null;
  // 結合データ
  counterpart: {
    userId: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  threadId: string | null;  // Talk スレッドID（accepted時のみ）
}

/** Talk スレッド一覧アイテム */
export interface TalkThreadItem {
  threadId: string;
  connectionId: string;
  counterpart: {
    userId: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  lastMessage: {
    body: string;
    senderId: string;
    createdAt: string;
  } | null;
  unreadCount: number;
}

/** Genomeリアクションタイプ */
export type GenomeReactionType = "resonance" | "discovery" | "tell_more" | "moved";

/** Talk メッセージ */
export interface TalkMessage {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  mediaUrl?: string | null;
  reactions?: Array<{ type: GenomeReactionType; userId: string }>;
}
