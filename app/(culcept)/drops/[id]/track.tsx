// app/drops/[id]/track.tsx
"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { logRecoAction, WHERE } from "@/lib/recoLog";

export default function DropDetailTrack({ dropId }: { dropId: string }) {
  const sp = useSearchParams();
  const imp = sp.get("imp");

  React.useEffect(() => {
    if (!imp) return;
    logRecoAction(imp, "click", { where: WHERE.OPEN_DROP_DETAIL, drop_id: dropId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imp, dropId]);

  return null;
}
