import { createCheqiIssuer, createReceiptPayload, Environment, PaymentType, UnitCode } from "@cheqi/sdk/issuer";

/** Minimal POS-style consumer: no platform APIs or Node shims. */
export async function runIssuerFixture(publicKey: string) {
  const requests: Array<{ path: string; body: unknown; authorization: string | null }> = [];
  const issuer = createCheqiIssuer({
    apiEndpoint: Environment.TEST,
    accessTokenProvider: async () => "short-lived-oauth-token",
    maxRetries: 0,
    fetch: async (url, init) => {
      const path = new URL(String(url)).pathname;
      const body = JSON.parse(String(init?.body));
      requests.push({ path, body, authorization: new Headers(init?.headers).get("authorization") });
      if (path === "/recipient/resolve") return Response.json({
        routeFound: true, deliveryRouteType: "DIGITAL", matchId: "browser-match",
        recipients: [{ id: "device", publicKey }]
      });
      if (path === "/receipt/encrypted") return Response.json({
        cheqiReceiptId: "browser-receipt", matchId: "browser-match", status: "PENDING",
        createdAt: "2026-10-03T10:00:00Z"
      });
      throw new Error(`Unexpected path: ${path}`);
    }
  });
  const payload = createReceiptPayload({
    documentNumber: "POS-1", issueDate: new Date("2026-10-03T10:00:00Z"),
    currency: "EUR", receiptSubtotal: "10.00", totalBeforeTax: "10.00",
    totalTaxAmount: "2.10", totalAmount: "12.10", taxesApplied: true,
    products: [{ name: "Coffee", identifier: "SKU-1", quantity: 1,
      unitCode: UnitCode.C62, unitPrice: "10.00", subtotal: "10.00", total: "12.10" }]
  });
  const result = await issuer.issueReceipt({ paymentType: PaymentType.CASH }, payload);
  return { result, requests, payload };
}
