import { createSupabaseQuizRepository } from "@/domain/quiz/supabase-repository";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export function createQuizRepository() {
  return createSupabaseQuizRepository(createServiceRoleClient());
}
