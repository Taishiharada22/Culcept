"use client";

/**
 * Client wrapper for GraduationCeremonyView.
 * Handles share action and navigation.
 */

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import GraduationCeremonyView from "@/components/rendezvous/GraduationCeremonyView";
import type { GraduationData } from "@/lib/rendezvous/graduationCeremony";

type Props = {
  graduation: GraduationData;
  story: string[];
  candidateId: string;
};

export default function GraduationCeremonyClient({
  graduation,
  story,
  candidateId,
}: Props) {
  const router = useRouter();

  const handleShare = useCallback(async () => {
    const shareData = {
      title: graduation.shareCard.title,
      text: `${graduation.shareCard.subtitle} - ${graduation.shareCard.daysConnected}日間の物語`,
      url: `${window.location.origin}/rendezvous/graduation/${candidateId}`,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled share or share failed
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(shareData.url);
      } catch {
        // Clipboard access denied
      }
    }
  }, [graduation, candidateId]);

  const handleClose = useCallback(() => {
    router.push("/rendezvous");
  }, [router]);

  return (
    <GraduationCeremonyView
      data={graduation}
      story={story}
      onShare={handleShare}
      onClose={handleClose}
    />
  );
}
