import { createHmac, timingSafeEqual } from "node:crypto";

export type CreatePaymentInput = {
  paymentId: string;
  quizSessionId?: string;
  amountMinor: number;
  currency: "ILS";
  notifyUrl: string;
  successUrl: string;
  failureUrl: string;
  itemName?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
};

export type CreatedPayment = {
  providerReference: string;
  redirectUrl: string;
  customerId?: string;
  checkoutRequest?: Record<string, unknown>;
  checkoutResponse?: unknown;
};

export interface ChingAdapter {
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>;
  getChargesByCustomer?(customerId: string): Promise<unknown>;
}

export class MockChingAdapter implements ChingAdapter {
  async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
    const redirectUrl = new URL("/payment/mock", input.successUrl);
    redirectUrl.searchParams.set("payment", input.paymentId);

    return {
      providerReference: `mock-${input.paymentId}`,
      redirectUrl: redirectUrl.toString(),
    };
  }
}

export class RealChingAdapter implements ChingAdapter {
  constructor(
    private readonly config: {
      apiKey: string;
      endpointUrl: string;
    },
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatedPayment> {
    const customerId = await this.upsertCustomer(input);

    const checkoutRequest = {
      customer: customerId,
      line_items: [
        {
          name: input.itemName ?? "Paid relationship report",
          amount_agorot: input.amountMinor,
          quantity: 1,
        },
      ],
      success_url: input.successUrl,
      cancel_url: input.failureUrl,
      create_document: true,
      metadata: {
        paymentId: input.paymentId,
        ...(input.quizSessionId ? { quizSessionId: input.quizSessionId } : {}),
      },
    };

    const data = await this.request("/checkout_sessions", checkoutRequest);
    const session = isRecord(data?.data) ? data.data : data;

    if (typeof session?.url !== "string" || !session.url || typeof session?.id !== "string") {
      throw new Error("CHING checkout creation failed");
    }

    return {
      providerReference: session.id,
      redirectUrl: session.url,
      customerId,
      checkoutRequest,
      checkoutResponse: data,
    };
  }

  async getChargesByCustomer(customerId: string): Promise<unknown> {
    const response = await this.fetcher(
      `${this.baseUrl()}/charges?customer=${encodeURIComponent(customerId)}`,
      {
        method: "GET",
        headers: this.headers(),
      },
    );
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error("CHING charge lookup failed");
    }

    return data;
  }

  private async upsertCustomer(input: CreatePaymentInput): Promise<string> {
    const email = input.customerEmail?.trim() || `${sanitizeEmailLocalPart(input.paymentId)}@lovlov.me`;
    const data = await this.request("/customers/upsert", {
      identifyBy: "email",
      email,
      name: input.customerName?.trim() || "Guest",
      ...(input.customerPhone?.trim() ? { phone: input.customerPhone.trim() } : {}),
    });
    const customer = isRecord(data?.data) ? data.data : data;

    if (typeof customer?.id !== "string" || !customer.id) {
      throw new Error("CHING customer upsert failed");
    }

    return customer.id;
  }

  private async request(path: string, body: Record<string, unknown>) {
    const response = await this.fetcher(`${this.baseUrl()}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || data?.success === false) {
      const message = isRecord(data?.error) && typeof data.error.message === "string" ? data.error.message : null;
      throw new Error(message ?? `CHING ${response.status}`);
    }

    return data as { success?: boolean; data?: unknown; url?: string; id?: string } | null;
  }

  private baseUrl() {
    return `${this.config.endpointUrl.replace(/\/$/, "")}/ching/v1`;
  }

  private headers() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
    };
  }
}

export function verifyChingSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string | undefined,
): boolean {
  if (!header || !secret) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(header, "hex");

  return (
    expectedBuffer.length === actualBuffer.length &&
    actualBuffer.length > 0 &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function sanitizeEmailLocalPart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function createChingAdapter(source: NodeJS.ProcessEnv = process.env): ChingAdapter {
  if (source.CHING_API_BASE && source.CHING_API_KEY) {
    return new RealChingAdapter({
      endpointUrl: source.CHING_API_BASE,
      apiKey: source.CHING_API_KEY,
    });
  }

  return new MockChingAdapter();
}
