import { createSupabaseMatchingSessionRepository } from "@/domain/quiz/supabase-repository";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export function createMatchingRepository() {
  return createSupabaseMatchingSessionRepository(createServiceRoleClient());
}
