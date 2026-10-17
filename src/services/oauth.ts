import type { ClientCredentialsTokenRequest, OAuthTokenExchangeResponse } from "../models/generated/index.js";
import type { CheqiApiClient, RequestOptions } from "../types.js";

/**
 * Obtains short-lived Company access tokens with the OAuth client-credentials grant.
 *
 * Each token is bound to one Grant, so request one per connected company. The SDK does not
 * cache or refresh tokens: store each token with its `expires_in` in your own token store,
 * request a new one before it expires, and pass it per call as `{ accessToken }`.
 *
 * @example
 * ```ts
 * const token = await sdk.oauthService.requestAccessToken({
 *   client_id: clientId,
 *   client_secret: clientSecret,
 *   grant_id: grantId,
 *   scope: "receipt:issue"
 * });
 * ```
 */
export class OAuthService {
  constructor(private readonly apiClient: Pick<CheqiApiClient, "requestAccessToken">) {}

  /** Requests an access token for one Grant. `grant_type` defaults to `client_credentials`. */
  requestAccessToken(
    request: ClientCredentialsTokenRequest,
    options?: RequestOptions | null
  ): Promise<OAuthTokenExchangeResponse> {
    return this.apiClient.requestAccessToken(request, options);
  }
}
