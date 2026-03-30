import { supabaseServer } from "@/lib/supabase/server";

/**
 * Get authenticated user from request.
 * Returns { user, supabase } or null if unauthenticated.
 *
 * Uses the project's existing supabaseServer() pattern from lib/supabase/server.ts.
 */
export async function getAuthUser() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return { user, supabase };
}
