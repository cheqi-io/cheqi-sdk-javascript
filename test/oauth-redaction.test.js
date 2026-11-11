import test from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { CheqiSDK, Environment } from "../dist/index.js";
import * as models from "../dist/models/generated/index.js";

for (const [name, field] of [
  ["ClientCredentialsTokenRequest", "client_secret"],
  ["ClientApplicationPublicKeyRequest", "client_secret"],
  ["AuthorizationCodeExchangeRequest", "client_secret"],
  ["AuthorizationCodeExchangeRequest", "code"],
  ["AuthorizationCodeExchangeRequest", "code_verifier"],
  ["OAuthTokenExchangeResponse", "access_token"]
]) {
  test(`${name}.${field} is hidden during inspection but preserved on the wire`, () => {
    const secret = "dummy-secret\nsecond-line";
    const model = models[`${name}FromJSON`]({ [field]: secret });
    for (const output of [String(model), inspect(model)]) {
      assert.ok(!output.includes("dummy-secret"));
      assert.ok(!output.includes("second-line"));
    }
    assert.equal(model[field], secret);
    assert.equal(models[`${name}ToJSON`](model)[field], secret);
    assert.equal(JSON.parse(JSON.stringify(model))[field], secret);
  });
}

test("OAuth HTTP errors and malformed responses never expose echoed credentials", async () => {
  for (const [status, body] of [[400, '{"message":"dummy-secret"}'], [200, '{"access_token":"dummy-secret"']]) {
    const sdk = new CheqiSDK({ apiEndpoint: Environment.SANDBOX, fetch: async () => new Response(body, { status }) });
    await assert.rejects(() => sdk.oauthService.requestAccessToken({ client_id: "client", client_secret: "request-secret", grant_id: "grant" }), error => {
      assert.ok(!inspect(error).includes("dummy-secret"));
      assert.equal(error.cause, undefined);
      assert.equal(error.httpStatusCode, status);
      return true;
    });
  }
});

test("returned access tokens redact console inspection and still authenticate requests", async () => {
  let calls = 0;
  const sdk = new CheqiSDK({ apiEndpoint: Environment.SANDBOX, fetch: async (_url, init) => {
    if (++calls === 1) {
      assert.equal(JSON.parse(init.body).client_secret, "request-secret");
      return Response.json({ access_token: "dummy-token", expires_in: 60 });
    }
    assert.equal(init.headers.Authorization, "Bearer dummy-token");
    return Response.json([]);
  } });
  const token = await sdk.oauthService.requestAccessToken({ client_id: "client", client_secret: "request-secret", grant_id: "grant" });
  assert.ok(!inspect(token).includes("dummy-token"));
  await sdk.companyService.listReceiptDestinations({ accessToken: token.access_token });
});
