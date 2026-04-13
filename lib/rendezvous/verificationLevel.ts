// ============================================================
// Verification Level 計算・チェック ユーティリティ
//
// Level 定義:
//   L0: 未確認
//   L1: メール確認済み（Supabase Auth email_confirmed_at）
//   L2: L1 + 年齢確認 + 写真レビュー承認
//   L3: L2 + 身分証レビュー承認（review_status='approved'）
//   L4: L3 + 追加証明承認
// ============================================================

// ── Partner 書類定義（結婚相談所水準） ──

export type PartnerDocumentType =
  | "identity"        // 本人確認書類（L2-L3 で既存）
  | "single_status"   // 独身証明書
  | "income"          // 収入証明書
  | "education"       // 学歴証明書
  | "employment";     // 勤務先証明

export type PartnerDocumentStatus = "not_submitted" | "pending" | "approved" | "rejected";

export type DocumentRequirement = {
  type: PartnerDocumentType;
  label: string;
  description: string;
  required: boolean; // true = 必須, false = 任意
};

export const PARTNER_DOCUMENTS: DocumentRequirement[] = [
  {
    type: "identity",
    label: "本人確認書類",
    description: "運転免許証・パスポート・マイナンバーカード",
    required: true,
  },
  {
    type: "single_status",
    label: "独身証明書",
    description: "市区町村発行の独身証明書（3ヶ月以内）",
    required: true,
  },
  {
    type: "income",
    label: "収入証明書",
    description: "源泉徴収票・確定申告書・給与明細",
    required: false,
  },
  {
    type: "education",
    label: "学歴証明書",
    description: "卒業証明書・学位記",
    required: false,
  },
  {
    type: "employment",
    label: "勤務先証明",
    description: "在職証明書・社員証コピー",
    required: false,
  },
];

/** Partner 書類ステータスの JSONB 型（rendezvous_profiles.partner_document_statuses） */
export type PartnerDocumentStatuses = Partial<Record<PartnerDocumentType, PartnerDocumentStatus>>;

/** 書類ステータスから信頼スコア（0-5）を算出 */
export function computePartnerTrustScore(
  identityReviewStatus: ReviewStatus,
  documentStatuses: PartnerDocumentStatuses,
): number {
  let score = 0;
  // 本人確認書類 = 1点
  if (identityReviewStatus === "approved") score += 1;
  // 独身証明書 = 1点
  if (documentStatuses.single_status === "approved") score += 1;
  // 収入証明書 = 1点
  if (documentStatuses.income === "approved") score += 1;
  // 学歴証明書 = 1点
  if (documentStatuses.education === "approved") score += 1;
  // 勤務先証明 = 1点
  if (documentStatuses.employment === "approved") score += 1;
  return score;
}

/** 必須書類が全て承認済みかチェック */
export function areRequiredDocumentsApproved(
  identityReviewStatus: ReviewStatus,
  documentStatuses: PartnerDocumentStatuses,
): boolean {
  // 本人確認書類（identity）= reviewStatus で管理
  if (identityReviewStatus !== "approved") return false;
  // 独身証明書 = 必須
  if (documentStatuses.single_status !== "approved") return false;
  return true;
}

/**
 * 本人確認フロー全体の到達状態（ユーザー向け）。
 * - unverified: 未確認（未提出）
 * - pending:    確認中（書類提出済み、審査待ち）
 * - verified:   確認済み（承認完了）
 * - rejected:   却下
 * - expired:    有効期限切れ（過去に承認されたが再確認が必要）
 */
export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected" | "expired";

/**
 * 提出済み証憑に対する審査状態（管理側）。
 * - not_submitted: 未提出
 * - pending:       審査中
 * - approved:      承認
 * - rejected:      却下
 *
 * verification_status とは独立。
 * 例: verification_status=expired かつ review_status=approved（過去に承認済みだが期限切れ）
 */
export type ReviewStatus = "not_submitted" | "pending" | "approved" | "rejected";

export type VerificationProfile = {
  emailConfirmedAt: string | null;
  ageVerifiedAt: string | null;
  /** rendezvous_verification.status（写真審査結果） */
  photoReviewStatus: ReviewStatus;
  /** rendezvous_profiles.verification_status（ユーザー向け到達状態） */
  verificationStatus: VerificationStatus;
  /** rendezvous_profiles.review_status（管理側審査状態） */
  reviewStatus: ReviewStatus;
  /** rendezvous_profiles.verification_level（DB キャッシュ値 0-4） */
  verificationLevel: number;
  /** rendezvous_profiles.additional_document_status */
  additionalDocumentStatus: ReviewStatus;
  /** 凍結状態 */
  frozenAt: string | null;
};

/**
 * 各種ステータスから verification_level を算出する
 */
export function computeVerificationLevel(profile: {
  emailConfirmedAt: string | null;
  ageVerifiedAt: string | null;
  photoReviewStatus: ReviewStatus;
  reviewStatus: ReviewStatus;
  additionalDocumentStatus: ReviewStatus;
}): number {
  // L1: メール確認
  if (!profile.emailConfirmedAt) return 0;
  const l1 = true;

  // L2: 年齢確認 + 写真承認
  if (!profile.ageVerifiedAt || profile.photoReviewStatus !== "approved") return 1;
  const l2 = true;

  // L3: 身分証承認
  if (profile.reviewStatus !== "approved") return 2;
  const l3 = true;

  // L4: 追加証明承認
  if (profile.additionalDocumentStatus !== "approved") return 3;

  return 4;
}

// ── カテゴリ別の最低レベル定義 ──

type PartnerAction =
  | "view_candidates"
  | "like"
  | "match"
  | "chat"
  | "contact_exchange"
  | "schedule"
  | "first_meeting";

type RomanceAction = "view_candidates" | "like" | "match" | "chat" | "meeting";
type ConnectionAction = "view_candidates" | "chat";

const PARTNER_ACTION_LEVEL: Record<PartnerAction, number> = {
  view_candidates: 2,
  like: 3,
  match: 3,
  chat: 3,
  contact_exchange: 3,
  schedule: 3,
  first_meeting: 3,
};

/** Partner の連絡先交換・日程調整・初回面会は review_status=approved も必須 */
const PARTNER_REQUIRES_APPROVED_REVIEW: Set<PartnerAction> = new Set([
  "like",
  "match",
  "chat",
  "contact_exchange",
  "schedule",
  "first_meeting",
]);

const ROMANCE_ACTION_LEVEL: Record<RomanceAction, number> = {
  view_candidates: 2,
  like: 2,
  match: 2,
  chat: 2,
  meeting: 3,
};

const CONNECTION_ACTION_LEVEL: Record<ConnectionAction, number> = {
  view_candidates: 1,
  chat: 2,
};

export type GateCheckResult = {
  allowed: boolean;
  reason?: string;
  requiredLevel?: number;
  currentLevel: number;
};

/**
 * Partner アクションのゲートチェック
 */
export function checkPartnerGate(
  action: PartnerAction,
  profile: VerificationProfile,
): GateCheckResult {
  const currentLevel = profile.verificationLevel;
  const requiredLevel = PARTNER_ACTION_LEVEL[action];

  // 凍結チェック
  if (profile.frozenAt) {
    return {
      allowed: false,
      reason: "アカウントが一時停止されています",
      requiredLevel,
      currentLevel,
    };
  }

  // レベルチェック
  if (currentLevel < requiredLevel) {
    const msgs: Record<number, string> = {
      2: "写真の確認が必要です",
      3: "身分証の確認が必要です",
    };
    return {
      allowed: false,
      reason: msgs[requiredLevel] ?? `確認レベル ${requiredLevel} が必要です`,
      requiredLevel,
      currentLevel,
    };
  }

  // review_status=approved 必須チェック（not_submitted / pending / rejected で拒否）
  if (PARTNER_REQUIRES_APPROVED_REVIEW.has(action) && profile.reviewStatus !== "approved") {
    return {
      allowed: false,
      reason: profile.reviewStatus === "pending"
        ? "本人確認の審査中です。通常24時間以内に完了します"
        : profile.reviewStatus === "not_submitted"
          ? "本人確認書類の提出が必要です"
          : "本人確認が必要です",
      requiredLevel,
      currentLevel,
    };
  }

  return { allowed: true, currentLevel };
}

/**
 * Romance アクションのゲートチェック
 */
export function checkRomanceGate(
  action: RomanceAction,
  profile: VerificationProfile,
): GateCheckResult {
  const currentLevel = profile.verificationLevel;
  const requiredLevel = ROMANCE_ACTION_LEVEL[action];

  if (profile.frozenAt) {
    return { allowed: false, reason: "アカウントが一時停止されています", requiredLevel, currentLevel };
  }

  if (currentLevel < requiredLevel) {
    return {
      allowed: false,
      reason: requiredLevel === 2 ? "写真の確認が必要です" : "身分証の確認が必要です",
      requiredLevel,
      currentLevel,
    };
  }

  return { allowed: true, currentLevel };
}

/**
 * Connection アクションのゲートチェック
 */
export function checkConnectionGate(
  action: ConnectionAction,
  profile: VerificationProfile,
): GateCheckResult {
  const currentLevel = profile.verificationLevel;
  const requiredLevel = CONNECTION_ACTION_LEVEL[action];

  if (profile.frozenAt) {
    return { allowed: false, reason: "アカウントが一時停止されています", requiredLevel, currentLevel };
  }

  if (currentLevel < requiredLevel) {
    return {
      allowed: false,
      reason: requiredLevel === 2 ? "写真の確認が必要です" : "メールの確認が必要です",
      requiredLevel,
      currentLevel,
    };
  }

  return { allowed: true, currentLevel };
}
