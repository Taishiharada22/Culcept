import type { SupabaseClient } from "@supabase/supabase-js";
import type { VerificationProfile } from "./verificationLevel";

/**
 * rendezvous_profiles + auth.users から VerificationProfile を組み立てる。
 * gate check 用の共通ヘルパー。
 *
 * verification_status = ユーザー向け到達状態（unverified/pending/verified/rejected/expired）
 * review_status       = 管理側審査状態（not_submitted/pending/approved/rejected）
 */
export async function fetchVerificationProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<VerificationProfile> {
  const { data: profile } = await supabase
    .from("rendezvous_profiles")
    .select(
      "verification_level, review_status, verification_status, frozen_at, additional_document_status, age_verified_at",
    )
    .eq("user_id", userId)
    .single();

  // email_confirmed_at は auth.users から（admin client 必須）
  const { data: authUser } = await supabase.auth.admin.getUserById(userId);

  // photo review status は rendezvous_verification テーブルから
  const { data: photoVerification } = await supabase
    .from("rendezvous_verification")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    emailConfirmedAt: authUser?.user?.email_confirmed_at ?? null,
    ageVerifiedAt: profile?.age_verified_at ?? null,
    photoReviewStatus: (photoVerification?.status as VerificationProfile["photoReviewStatus"]) ?? "not_submitted",
    verificationStatus: (profile?.verification_status as VerificationProfile["verificationStatus"]) ?? "unverified",
    reviewStatus: (profile?.review_status as VerificationProfile["reviewStatus"]) ?? "not_submitted",
    verificationLevel: profile?.verification_level ?? 0,
    additionalDocumentStatus:
      (profile?.additional_document_status as VerificationProfile["additionalDocumentStatus"]) ?? "not_submitted",
    frozenAt: profile?.frozen_at ?? null,
  };
}
