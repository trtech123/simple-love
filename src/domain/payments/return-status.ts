import type { QuizSessionStatus } from "@/domain/quiz/types";
import { isE2eTestMode } from "@/lib/e2e-mode";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { PaymentProductKey } from "./products";
import type { PaymentStatus } from "./types";

export type PaymentReturnStatus =
  | { state: "not_found" }
  | { state: "payment_pending" }
  | { state: "payment_failed"; retryQuizUrl: string }
  | { state: "payment_cancelled"; retryQuizUrl: string }
  | { state: "report_generating" }
  | { state: "report_failed" }
  | { state: "report_ready"; claimToken: string }
  | { state: "matching_unlocked" };

export type PaymentReturnStatusRepository = {
  getPayment(paymentId: string): Promise<PaymentReturnPayment | null>;
  getQuizSession(sessionId: string): Promise<PaymentReturnQuizSession | null>;
  getReportByQuizSession(sessionId: string): Promise<PaymentReturnReport | null>;
};

export type PaymentReturnStatusOptions = {
  browserCancelled?: boolean;
};

type PaymentReturnPayment = {
  id: string;
  quizSessionId: string | null;
  productKey?: PaymentProductKey;
  status: PaymentStatus;
  rawPayload: Record<string, unknown>;
};

type PaymentReturnQuizSession = {
  id: string;
  publicToken: string;
  status: QuizSessionStatus;
};

type PaymentReturnReport = {
  id: string;
  quizSessionId: string;
  status: "pending" | "generating" | "completed" | "failed";
};

type DbPayment = {
  id: string;
  quiz_session_id: string | null;
  product_key: PaymentProductKey | null;
  status: PaymentStatus;
  raw_payload: Record<string, unknown> | null;
};

type DbQuizSession = {
  id: string;
  public_token: string;
  status: QuizSessionStatus;
};

type DbReport = {
  id: string;
  quiz_session_id: string;
  status: "pending" | "generating" | "completed" | "failed";
};

export async function getPaymentReturnStatus(
  paymentId: string,
  options: PaymentReturnStatusOptions = {},
): Promise<PaymentReturnStatus> {
  const e2eStatus = getE2ePaymentReturnStatus(paymentId);
  if (e2eStatus) {
    return e2eStatus;
  }

  return resolvePaymentReturnStatus(createSupabasePaymentReturnStatusRepository(), paymentId, options);
}

export async function resolvePaymentReturnStatus(
  repository: PaymentReturnStatusRepository,
  paymentId: string,
  options: PaymentReturnStatusOptions = {},
): Promise<PaymentReturnStatus> {
  const payment = await repository.getPayment(paymentId);
  if (!payment) {
    return { state: "not_found" };
  }

  const session = payment.quizSessionId ? await repository.getQuizSession(payment.quizSessionId) : null;
  const productKey = payment.productKey ?? "paid_report";
  const retryQuizUrl = productKey === "matching_unlock" ? "/matches" : buildRetryQuizUrl(session);

  if (payment.status === "failed") {
    return { state: "payment_failed", retryQuizUrl };
  }

  if (payment.status === "cancelled" || (options.browserCancelled && payment.status !== "paid")) {
    return { state: "payment_cancelled", retryQuizUrl };
  }

  if (payment.status === "created" || payment.status === "pending") {
    return { state: "payment_pending" };
  }

  if (productKey === "matching_unlock") {
    return { state: "matching_unlocked" };
  }

  if (!session) {
    return { state: "not_found" };
  }

  const report = await repository.getReportByQuizSession(session.id);
  if (session.status === "report_failed" || report?.status === "failed") {
    return { state: "report_failed" };
  }

  const claimToken = readClaimToken(payment.rawPayload);
  if ((session.status === "report_ready" || report?.status === "completed") && claimToken) {
    return { state: "report_ready", claimToken };
  }

  if (session.status === "report_ready" || report?.status === "completed") {
    return { state: "report_failed" };
  }

  return { state: "report_generating" };
}

function createSupabasePaymentReturnStatusRepository(): PaymentReturnStatusRepository {
  const supabase = createServiceRoleClient();

  return {
    async getPayment(paymentId) {
      const { data, error } = await supabase
        .from("payments")
        .select("id, quiz_session_id, product_key, status, raw_payload")
        .eq("id", paymentId)
        .maybeSingle<DbPayment>();

      if (error) {
        throw new Error(error.message);
      }

      return data
        ? {
            id: data.id,
            quizSessionId: data.quiz_session_id,
            productKey: data.product_key ?? "paid_report",
            status: data.status,
            rawPayload: normalizeRawPayload(data.raw_payload),
          }
        : null;
    },
    async getQuizSession(sessionId) {
      const { data, error } = await supabase
        .from("quiz_sessions")
        .select("id, public_token, status")
        .eq("id", sessionId)
        .maybeSingle<DbQuizSession>();

      if (error) {
        throw new Error(error.message);
      }

      return data
        ? {
            id: data.id,
            publicToken: data.public_token,
            status: data.status,
          }
        : null;
    },
    async getReportByQuizSession(sessionId) {
      const { data, error } = await supabase
        .from("reports")
        .select("id, quiz_session_id, status")
        .eq("quiz_session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .returns<DbReport[]>();

      if (error) {
        throw new Error(error.message);
      }

      const report = data?.[0];
      return report
        ? {
            id: report.id,
            quizSessionId: report.quiz_session_id,
            status: report.status,
          }
        : null;
    },
  };
}

function getE2ePaymentReturnStatus(paymentId: string): PaymentReturnStatus | null {
  if (!isE2eTestMode()) {
    return null;
  }

  if (paymentId === "e2e-pending-payment") {
    return { state: "payment_pending" };
  }
  if (paymentId === "e2e-failed-payment") {
    return { state: "payment_failed", retryQuizUrl: "/quiz?session=e2e-public-token" };
  }
  if (paymentId === "e2e-cancelled-payment") {
    return { state: "payment_cancelled", retryQuizUrl: "/quiz?session=e2e-public-token" };
  }

  return null;
}

function buildRetryQuizUrl(session: PaymentReturnQuizSession | null) {
  return session ? `/quiz?session=${encodeURIComponent(session.publicToken)}` : "/quiz";
}

export function readClaimToken(rawPayload: Record<string, unknown> | null | undefined) {
  if (!rawPayload) {
    return null;
  }

  const value = rawPayload.claimToken ?? rawPayload.claim_token;
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function normalizeRawPayload(rawPayload: Record<string, unknown> | null | undefined) {
  return rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload) ? rawPayload : {};
}
