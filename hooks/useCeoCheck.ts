"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { isCeoEmail } from "@/lib/auth/isCeo";

/** クライアント側でCEOかどうかを判定するhook */
export function useCeoCheck() {
  const [isCeo, setIsCeo] = useState(false);

  useEffect(() => {
    supabaseBrowser()
      .auth.getUser()
      .then(({ data: { user } }: { data: { user: { email?: string | null } | null } }) => {
        setIsCeo(isCeoEmail(user?.email));
      });
  }, []);

  return isCeo;
}
