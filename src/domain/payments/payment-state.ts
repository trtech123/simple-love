import type { PaymentEvent, PaymentRecord } from "./types";
import type { PaymentProductKey } from "./products";

export type CheckoutRepository = {
  getCompletedSessionByToken(publicToken: string): Promise<{
    id: string;
    publicToken: string;
    status: "completed" | "payment_pending";
  } | null>;
  getActivePaymentBySessionId?(sessionId: string): Promise<{
    id: string;
    redirectUrl: string | null;
  } | null>;
  createPayment(input: {
    quizSessionId: string;
    productKey?: PaymentProductKey;
    provider: "ching";
    providerReference: string;
    amountMinor: number;
    currency: "ILS";
    redirectUrl: string;
  }): Promise<{ id: string; providerReference: string; redirectUrl: string }>;
  markSessionPaymentPending(sessionId: string): Promise<void>;
};

export type MatchingCheckoutRepository = {
  getMatchingCheckoutUser(userId: string): Promise<{
    userId: string;
    matchingProfileComplete: boolean;
    completedDepthQuestionnaireAt: string | null;
    hasMatchingEntitlement: boolean;
  } | null>;
  getActivePaymentByUserId?(
    userId: string,
    productKey: PaymentProductKey,
  ): Promise<{
    id: string;
    redirectUrl: string | null;
  } | null>;
  createPayment(input: {
    userId: string;
    productKey: PaymentProductKey;
    provider: "ching";
    providerReference: string;
    amountMinor: number;
    currency: "ILS";
    redirectUrl: string;
  }): Promise<{ id: string; providerReference: string; redirectUrl: string }>;
};

export async function createCheckout(
  repository: CheckoutRepository,
  input: {
    sessionToken: string;
    amountMinor: number;
    currency: "ILS";
    createProviderReference: () => string;
    buildRedirectUrl: (paymentId: string) => string;
  },
) {
  const session = await repository.getCompletedSessionByToken(input.sessionToken);

  if (!session) {
    throw new Error("Completed quiz session was not found");
  }

  const activePayment = await repository.getActivePaymentBySessionId?.(session.id);
  if (activePayment?.redirectUrl) {
    return {
      paymentId: activePayment.id,
      redirectUrl: activePayment.redirectUrl,
    };
  }
  if (activePayment && !activePayment.redirectUrl) {
    throw new Error("An active payment already exists without a checkout redirect");
  }
  if (session.status !== "completed") {
    throw new Error("Completed quiz session was not found");
  }

  const providerReference = input.createProviderReference();
  const payment = await repository.createPayment({
    quizSessionId: session.id,
    productKey: "paid_report",
    provider: "ching",
    providerReference,
    amountMinor: input.amountMinor,
    currency: input.currency,
    redirectUrl: input.buildRedirectUrl(providerReference),
  });
  await repository.markSessionPaymentPending(session.id);

  return {
    paymentId: payment.id,
    redirectUrl: payment.redirectUrl,
  };
}

export async function createMatchingCheckout(
  repository: MatchingCheckoutRepository,
  input: {
    userId: string;
    amountMinor: number;
    currency: "ILS";
    createProviderReference: () => string;
    buildRedirectUrl: (paymentId: string) => string;
  },
) {
  const user = await repository.getMatchingCheckoutUser(input.userId);

  if (!user) {
    throw new Error("Matching profile was not found");
  }
  if (!user.matchingProfileComplete) {
    throw new Error("Complete your matching profile before unlocking matches");
  }
  if (!user.completedDepthQuestionnaireAt) {
    throw new Error("Complete the depth questionnaire before unlocking matches");
  }
  if (user.hasMatchingEntitlement) {
    throw new Error("Matching is already unlocked");
  }

  const productKey = "matching_unlock" as const;
  const activePayment = await repository.getActivePaymentByUserId?.(input.userId, productKey);
  if (activePayment?.redirectUrl) {
    return {
      paymentId: activePayment.id,
      redirectUrl: activePayment.redirectUrl,
    };
  }
  if (activePayment && !activePayment.redirectUrl) {
    throw new Error("An active payment already exists without a checkout redirect");
  }

  const providerReference = input.createProviderReference();
  const payment = await repository.createPayment({
    userId: input.userId,
    productKey,
    provider: "ching",
    providerReference,
    amountMinor: input.amountMinor,
    currency: input.currency,
    redirectUrl: input.buildRedirectUrl(providerReference),
  });

  return {
    paymentId: payment.id,
    redirectUrl: payment.redirectUrl,
  };
}

export function applyPaymentEvent(record: PaymentRecord, event: PaymentEvent): PaymentRecord {
  if (record.providerReference !== event.providerReference) {
    throw new Error("Payment reference mismatch");
  }

  if (event.type === "paid") {
    if (record.amountMinor !== event.amountMinor) {
      throw new Error("Payment amount mismatch");
    }
    if (record.currency !== event.currency) {
      throw new Error("Payment currency mismatch");
    }
    return { ...record, status: "paid" };
  }

  if (record.status === "paid") {
    return record;
  }

  return { ...record, status: event.type };
}
