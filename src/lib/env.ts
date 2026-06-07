import { z } from "zod";

const envSchema = z.object({
  APP_BASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  CHING_API_BASE: z.string().url(),
  CHING_API_KEY: z.string().min(1),
  CHING_WEBHOOK_SECRET: z.string().min(1),
});

export type AppEnv = ReturnType<typeof readEnv>;

export function readEnv(source: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const key = first.path.join(".");
    throw new Error(`Missing environment variable: ${key}`);
  }

  return {
    appBaseUrl: parsed.data.APP_BASE_URL,
    supabase: {
      url: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      serviceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
    },
    openai: {
      apiKey: parsed.data.OPENAI_API_KEY,
    },
    ching: {
      apiBase: parsed.data.CHING_API_BASE,
      apiKey: parsed.data.CHING_API_KEY,
      webhookSecret: parsed.data.CHING_WEBHOOK_SECRET,
    },
  };
}
