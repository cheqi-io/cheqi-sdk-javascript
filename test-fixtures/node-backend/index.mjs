import assert from "node:assert/strict";
import { CheqiSDK, Environment, NoopLogger, VerificationService } from "@cheqi/sdk";
import { createCheqiIssuer } from "@cheqi/sdk/issuer";

const sdk = new CheqiSDK({ apiEndpoint: Environment.TEST, apiKey: "sk_fixture", logger: new NoopLogger(),
  fetch: async (_url, init) => {
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer sk_fixture");
    return Response.json({ routeFound: false });
  } });
assert.equal((await sdk.matchingService.matchCustomer({ recipientEmail: "test@example.com" })).routeFound, false);
assert.equal(typeof sdk.storeService.getStore, "function");
assert.equal(typeof sdk.decryptionService.decryptReceipt, "function");
assert.equal(await new VerificationService().calculateCheqiReceiptHash('{"b":2,"a":1}'),
  await new VerificationService().calculateCheqiReceiptHash('{"a":1,"b":2}'));
assert.equal(typeof createCheqiIssuer, "function");
console.log("Installed Node backend fixture passed");
