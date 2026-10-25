import { createCheqiIssuer, createReceiptPayload, Environment, PaymentType, UnitCode } from "@cheqi/sdk/issuer";
import type { CryptoProvider } from "@cheqi/sdk/issuer";

// A Fetch-compatible recorder: no network, real credentials, or platform response constructors.
function response(body: unknown): Response {
  return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify(body) } as unknown as Response;
}

/** Portable consumer: no platform APIs or Node shims. */
export async function runIssuerFixture(publicKey: string, crypto?: CryptoProvider,
  route: "DIGITAL" | "DOWNLOAD_FALLBACK" = "DIGITAL") {
  const requests: Array<{ path: string; body: any; authorization: string | null }> = [];
  const issuer = createCheqiIssuer({
    apiEndpoint: Environment.TEST,
    accessTokenProvider: async () => "short-lived-oauth-token",
    maxRetries: 0,
    crypto,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    fetch: async (url, init) => {
      const path = new URL(String(url)).pathname;
      const body = JSON.parse(String(init?.body));
      requests.push({ path, body, authorization: (init?.headers as Record<string, string>).Authorization ?? null });
      if (path === "/recipient/resolve") return response({
        routeFound: true, deliveryRouteType: route, matchId: "browser-match",
        recipients: route === "DIGITAL" ? [{ id: "device", publicKey }] : undefined
      });
      if (path === "/receipt/encrypted") return response({
        cheqiReceiptId: "browser-receipt", matchId: "browser-match", status: "PENDING",
        createdAt: "2026-10-03T10:00:00Z"
      });
      if (path === "/receipt/download") return response({ cheqiReceiptId: body.downloadId });
      throw new Error(`Unexpected path: ${path}`);
    }
  });
  const payload = createFixturePayload();
  const result = await issuer.issueReceipt({ paymentType: PaymentType.CARD_PAYMENT,
    cardDetails: { paymentAccountReference: "PAR-SYNTHETIC-TEST" } }, payload);
  return { result, requests, payload };
}

export function createFixturePayload() {
  return createReceiptPayload({
    documentNumber: "R-FIXTURE-0001", issueDate: new Date("2026-10-03T10:00:00Z"),
    currency: "EUR", receiptSubtotal: "10.00", totalBeforeTax: "10.00",
    totalTaxAmount: "2.10", totalAmount: "12.10", taxesApplied: true,
    products: [{ name: "Coffee", identifier: "SKU-1", quantity: 1,
      unitCode: UnitCode.C62, unitPrice: "10.00", subtotal: "10.00", total: "12.10" }]
  });
}
