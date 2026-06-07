import { getPaymentReturnStatus } from "@/domain/payments/return-status";
import { NextResponse } from "next/server";
import { reconcileReturnedPayment } from "../reconcile-return";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const paymentId = new URL(request.url).searchParams.get("payment")?.trim();

  if (!paymentId) {
    return NextResponse.json({ error: "payment is required" }, { status: 400 });
  }

  let status = await getPaymentReturnStatus(paymentId);
  if (status.state === "payment_pending") {
    await reconcileReturnedPayment(paymentId);
    status = await getPaymentReturnStatus(paymentId);
  }

  return NextResponse.json(status);
}
