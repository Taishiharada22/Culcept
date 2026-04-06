"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * ユーザーが匿名（未登録）かどうかを判定するフック
 * - null: まだ判定中
 * - true: 匿名ユーザー（未登録 or anonymous session）
 * - false: 登録済みユーザー
 */
export function useIsAnonymous(): boolean | null {
  const [isAnonymous, setIsAnonymous] = useState<boolean | null>(null);

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getUser().then(({ data: { user } }: { data: { user: any } }) => {
      setIsAnonymous(!user || user.is_anonymous === true);
    });
  }, []);

  return isAnonymous;
}
