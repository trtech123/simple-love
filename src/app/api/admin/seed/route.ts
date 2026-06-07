import { assertAdminRole } from "@/domain/admin/auth";
import { seedOperationalData } from "@/data/seeds/database";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST() {
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  try {
    assertAdminRole({
      userId: user?.id ?? "",
      role: user?.app_metadata?.role as string | undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "נדרשת הרשאת מנהל." },
      { status: 403 },
    );
  }

  const result = await seedOperationalData(createServiceRoleClient());
  return NextResponse.json(result);
}
