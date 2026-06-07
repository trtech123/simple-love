import {
  ClaimRegistrationError,
  claimReportForUser,
  validateClaimForRegistration,
} from "@/domain/claims/claim-registration";
import {
  createSupabaseClaimRegistrationRepository,
  ensureProfileForUser,
} from "@/domain/claims/supabase-claim-registration";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const registerClaimSchema = z.object({
  claimToken: z.string().min(16),
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(120),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerClaimSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "פרטי ההרשמה אינם תקינים." }, { status: 400 });
  }

  const input = parsed.data;
  const supabase = createServiceRoleClient();
  const repository = createSupabaseClaimRegistrationRepository(supabase);
  const now = new Date();

  try {
    await validateClaimForRegistration(repository, input.claimToken, now);

    const { data: created, error: createUserError } = await supabase.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        display_name: input.displayName,
      },
    });

    if (createUserError || !created.user) {
      throw createAuthError(createUserError?.message ?? "לא ניתן ליצור משתמש.");
    }

    await ensureProfileForUser(supabase, {
      userId: created.user.id,
      displayName: input.displayName,
      now,
    });

    const claimed = await claimReportForUser(repository, {
      claimToken: input.claimToken,
      userId: created.user.id,
      now,
    });

    return NextResponse.json({ ok: true, userId: created.user.id, reportId: claimed.reportId });
  } catch (error) {
    if (error instanceof ClaimRegistrationError) {
      return NextResponse.json({ error: error.message }, { status: statusForClaimError(error) });
    }

    if (error instanceof AuthRegistrationError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "לא ניתן להשלים את ההרשמה." },
      { status: 400 },
    );
  }
}

function statusForClaimError(error: ClaimRegistrationError) {
  if (error.code === "expired") {
    return 410;
  }

  if (error.code === "already_claimed") {
    return 409;
  }

  return 404;
}

class AuthRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthRegistrationError";
  }
}

function createAuthError(message: string) {
  if (/already|registered|exists|duplicate/i.test(message)) {
    return new AuthRegistrationError("Email is already registered");
  }

  return new Error(message);
}
