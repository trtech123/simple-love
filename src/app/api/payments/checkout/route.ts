import { randomUUID } from "node:crypto";
import { requireAuthenticatedUserId } from "@/app/api/matching/auth";
import { isMatchingProfileComplete } from "@/domain/matching/profile";
import { createCheckout, createMatchingCheckout } from "@/domain/payments/payment-state";
import {
  isMissingPaymentProductsTableError,
  parsePaymentProductKey,
  resolvePaymentProduct,
  type PaymentProduct,
  type PaymentProductKey,
} from "@/domain/payments/products";
import { createChingAdapter } from "@/domain/payments/ching-adapter";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "JSON body is required" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const adapter = createChingAdapter();
  const baseUrl = process.env.APP_BASE_URL ?? new URL(request.url).origin;
  const productKey = parsePaymentProductKey(body.productKey ?? body.product) ?? "paid_report";
  const product = await resolveSupabasePaymentProduct(supabase, productKey);

  try {
    if (productKey === "matching_unlock") {
      const userId = await requireAuthenticatedUserId();
      if (!userId) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }

      const checkout = await createMatchingCheckout(
        {
          async getMatchingCheckoutUser(userId) {
            const [profile, dealBreakerKeys, entitlement] = await Promise.all([
              getMatchingProfile(supabase, userId),
              getDealBreakerKeys(supabase, userId),
              hasMatchingEntitlement(supabase, userId),
            ]);

            return profile
              ? {
                  userId,
                  matchingProfileComplete: isMatchingProfileComplete({
                    birthYear: profile.birth_year,
                    preferredAgeMin: profile.preferred_age_min,
                    preferredAgeMax: profile.preferred_age_max,
                    preferredDistanceKm: profile.preferred_distance_km,
                    gender: profile.gender,
                    interestedIn: profile.interested_in,
                    locationText: profile.location_text,
                    relationshipIntention: profile.relationship_intention,
                    dealBreakerKeys,
                  }),
                  completedDepthQuestionnaireAt: profile.completed_depth_questionnaire_at,
                  hasMatchingEntitlement: entitlement,
                }
              : null;
          },
          async getActivePaymentByUserId(userId, productKey) {
            const { data, error } = await supabase
              .from("payments")
              .select("id, raw_payload")
              .eq("user_id", userId)
              .eq("product_key", productKey)
              .in("status", ["created", "pending"])
              .order("created_at", { ascending: false })
              .limit(1)
              .returns<{ id: string; raw_payload: Record<string, unknown> | null }[]>();

            if (error) {
              throw new Error(error.message);
            }

            return mapActivePayment(data?.[0]);
          },
          async createPayment(input) {
            return createProviderCheckout({
              supabase,
              adapter,
              baseUrl,
              product,
              productKey: input.productKey,
              userId: input.userId,
              providerReference: input.providerReference,
            });
          },
        },
        {
          userId,
          amountMinor: product.amountMinor,
          currency: product.currency,
          createProviderReference: () => `ching-${randomUUID()}`,
          buildRedirectUrl: () => `${baseUrl}/payment/return`,
        },
      );

      return NextResponse.json(checkout);
    }

    if (typeof body.sessionToken !== "string") {
      return NextResponse.json({ error: "sessionToken is required" }, { status: 400 });
    }

    const checkout = await createCheckout(
      {
        async getCompletedSessionByToken(publicToken) {
          const { data, error } = await supabase
            .from("quiz_sessions")
            .select("id, public_token, status")
            .eq("public_token", publicToken)
            .in("status", ["completed", "payment_pending"])
            .maybeSingle<{ id: string; public_token: string; status: "completed" | "payment_pending" }>();

          if (error) {
            throw new Error(error.message);
          }

          return data ? { id: data.id, publicToken: data.public_token, status: data.status } : null;
        },
        async getActivePaymentBySessionId(sessionId) {
          const { data, error } = await supabase
            .from("payments")
            .select("id, raw_payload")
            .eq("quiz_session_id", sessionId)
            .eq("product_key", "paid_report")
            .in("status", ["created", "pending"])
            .order("created_at", { ascending: false })
            .limit(1)
            .returns<{ id: string; raw_payload: Record<string, unknown> | null }[]>();

          if (error) {
            throw new Error(error.message);
          }

          return mapActivePayment(data?.[0]);
        },
        async createPayment(input) {
          return createProviderCheckout({
            supabase,
            adapter,
            baseUrl,
            product,
            productKey: "paid_report",
            quizSessionId: input.quizSessionId,
            providerReference: input.providerReference,
          });
        },
        async markSessionPaymentPending(sessionId) {
          const { error } = await supabase
            .from("quiz_sessions")
            .update({ status: "payment_pending", updated_at: new Date().toISOString() })
            .eq("id", sessionId);

          if (error) {
            throw new Error(error.message);
          }
        },
      },
      {
        sessionToken: body.sessionToken,
        amountMinor: product.amountMinor,
        currency: product.currency,
        createProviderReference: () => `ching-${randomUUID()}`,
        buildRedirectUrl: () => `${baseUrl}/payment/return`,
      },
    );

    return NextResponse.json(checkout);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "לא ניתן ליצור תשלום." },
      { status: 400 },
    );
  }
}

async function createProviderCheckout(input: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  adapter: ReturnType<typeof createChingAdapter>;
  baseUrl: string;
  product: PaymentProduct;
  productKey: PaymentProductKey;
  providerReference: string;
  quizSessionId?: string;
  userId?: string;
}) {
  const { data: payment, error } = await input.supabase
    .from("payments")
    .insert({
      quiz_session_id: input.quizSessionId ?? null,
      user_id: input.userId ?? null,
      product_key: input.productKey,
      provider: "ching",
      provider_reference: input.providerReference,
      status: "created",
      amount_minor: input.product.amountMinor,
      currency: input.product.currency,
      raw_payload: { productKey: input.productKey },
    })
    .select("id, provider_reference")
    .single<{ id: string; provider_reference: string }>();

  if (error) {
    throw new Error(error.message);
  }

  const notifyUrl = new URL(`${input.baseUrl}/api/payments/ching/webhook`);
  notifyUrl.searchParams.set("payment", payment.id);

  const created = await input.adapter.createPayment({
    paymentId: payment.id,
    quizSessionId: input.quizSessionId,
    amountMinor: input.product.amountMinor,
    currency: input.product.currency,
    notifyUrl: notifyUrl.toString(),
    successUrl: `${input.baseUrl}/payment/return?payment=${encodeURIComponent(payment.id)}`,
    failureUrl: `${input.baseUrl}/payment/return?payment=${encodeURIComponent(payment.id)}&cancelled=1`,
    itemName: input.product.itemName,
  });

  const { error: updateError } = await input.supabase
    .from("payments")
    .update({
      provider_reference: created.providerReference,
      status: "pending",
      raw_payload: {
        productKey: input.productKey,
        ...(created.customerId ? { customerId: created.customerId } : {}),
        checkoutRequest: created.checkoutRequest ?? null,
        checkoutResponse: created.checkoutResponse ?? null,
        redirectUrl: created.redirectUrl,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return {
    id: payment.id,
    providerReference: created.providerReference,
    redirectUrl: created.redirectUrl,
  };
}

async function resolveSupabasePaymentProduct(
  supabase: ReturnType<typeof createServiceRoleClient>,
  productKey: PaymentProductKey,
) {
  return resolvePaymentProduct(
    {
      async getPaymentProduct(key) {
        const { data, error } = await supabase
          .from("payment_products")
          .select("product_key, amount_minor, currency, item_name, active")
          .eq("product_key", key)
          .maybeSingle<{
            product_key: PaymentProductKey;
            amount_minor: number;
            currency: "ILS";
            item_name: string;
            active: boolean;
          }>();

        if (error) {
          throw new Error(error.message);
        }

        return data
          ? {
              key: data.product_key,
              amountMinor: data.amount_minor,
              currency: data.currency,
              itemName: data.item_name,
              active: data.active,
            }
          : null;
      },
    },
    productKey,
    { shouldFallbackOnLookupError: isMissingPaymentProductsTableError },
  );
}

function mapActivePayment(payment: { id: string; raw_payload: Record<string, unknown> | null } | undefined) {
  if (!payment) {
    return null;
  }

  return {
    id: payment.id,
    redirectUrl:
      payment.raw_payload && typeof payment.raw_payload.redirectUrl === "string"
        ? payment.raw_payload.redirectUrl
        : null,
  };
}

async function getMatchingProfile(supabase: ReturnType<typeof createServiceRoleClient>, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "user_id, birth_year, preferred_age_min, preferred_age_max, preferred_distance_km, gender, interested_in, location_text, relationship_intention, completed_depth_questionnaire_at",
    )
    .eq("user_id", userId)
    .maybeSingle<{
      user_id: string;
      birth_year: number | null;
      preferred_age_min: number | null;
      preferred_age_max: number | null;
      preferred_distance_km: number | null;
      gender: string | null;
      interested_in: string | null;
      location_text: string | null;
      relationship_intention: string | null;
      completed_depth_questionnaire_at: string | null;
    }>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function getDealBreakerKeys(supabase: ReturnType<typeof createServiceRoleClient>, userId: string) {
  const { data, error } = await supabase
    .from("profile_deal_breakers")
    .select("normalized_key")
    .eq("user_id", userId)
    .returns<{ normalized_key: string }[]>();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((item) => item.normalized_key);
}

async function hasMatchingEntitlement(supabase: ReturnType<typeof createServiceRoleClient>, userId: string) {
  const { data, error } = await supabase
    .from("matching_entitlements")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle<{ user_id: string }>();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}
