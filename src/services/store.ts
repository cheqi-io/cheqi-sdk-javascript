import { CheqiSDKError, ErrorCodes } from "../errors.js";
import type { CheqiApiClient, CreateStoreRequest } from "../types.js";
import { getCreateStoreRequestValidationErrors } from "../validators.js";

export class StoreService {
  constructor(
    private readonly apiClient: Pick<
      CheqiApiClient,
      | "createStore"
      | "getStores"
      | "getStore"
      | "updateStore"
      | "deleteStore"
      | "activateStore"
      | "deactivateStore"
    >
  ) {}

  createStore(
    companyId: string,
    request: CreateStoreRequest,
    accessToken: string | null = null
  ): Promise<Record<string, unknown>> {
    this.validateCompanyId(companyId);
    this.validateAccessToken(accessToken);

    const validationErrors = getCreateStoreRequestValidationErrors(request);
    if (validationErrors.length > 0) {
      throw new CheqiSDKError(`Invalid store request: ${validationErrors.join(", ")}`, {
        errorCode: ErrorCodes.VALIDATION_ERROR,
        httpStatusCode: 400
      });
    }

    return this.apiClient.createStore(companyId, request, accessToken);
  }

  getStores(
    companyId: string,
    activeOnly: boolean | undefined = undefined,
    accessToken: string | null = null
  ): Promise<Record<string, unknown>> {
    this.validateCompanyId(companyId);
    this.validateAccessToken(accessToken);
    return this.apiClient.getStores(companyId, activeOnly, accessToken);
  }

  getActiveStores(
    companyId: string,
    accessToken: string | null = null
  ): Promise<Record<string, unknown>> {
    return this.getStores(companyId, true, accessToken);
  }

  getStore(
    companyId: string,
    storeId: string,
    accessToken: string | null = null
  ): Promise<Record<string, unknown>> {
    this.validateCompanyId(companyId);
    this.validateStoreId(storeId);
    this.validateAccessToken(accessToken);
    return this.apiClient.getStore(companyId, storeId, accessToken);
  }

  updateStore(
    companyId: string,
    storeId: string,
    request: CreateStoreRequest | null | undefined,
    accessToken: string | null = null
  ): Promise<Record<string, unknown>> {
    this.validateCompanyId(companyId);
    this.validateStoreId(storeId);
    this.validateAccessToken(accessToken);
    if (!request) {
      throw new CheqiSDKError("Store request cannot be null", {
        errorCode: ErrorCodes.VALIDATION_ERROR,
        httpStatusCode: 400
      });
    }
    return this.apiClient.updateStore(companyId, storeId, request, accessToken);
  }

  deleteStore(
    companyId: string,
    storeId: string,
    accessToken: string | null = null
  ): Promise<void> {
    this.validateCompanyId(companyId);
    this.validateStoreId(storeId);
    this.validateAccessToken(accessToken);
    return this.apiClient.deleteStore(companyId, storeId, accessToken);
  }

  activateStore(
    companyId: string,
    storeId: string,
    accessToken: string | null = null
  ): Promise<void> {
    this.validateCompanyId(companyId);
    this.validateStoreId(storeId);
    this.validateAccessToken(accessToken);
    return this.apiClient.activateStore(companyId, storeId, accessToken);
  }

  deactivateStore(
    companyId: string,
    storeId: string,
    accessToken: string | null = null
  ): Promise<void> {
    this.validateCompanyId(companyId);
    this.validateStoreId(storeId);
    this.validateAccessToken(accessToken);
    return this.apiClient.deactivateStore(companyId, storeId, accessToken);
  }

  private validateCompanyId(companyId: string | null | undefined): void {
    if (!companyId) {
      throw new CheqiSDKError("Company ID cannot be null", {
        errorCode: ErrorCodes.VALIDATION_ERROR,
        httpStatusCode: 400
      });
    }
  }

  private validateStoreId(storeId: string | null | undefined): void {
    if (!storeId) {
      throw new CheqiSDKError("Store ID cannot be null", {
        errorCode: ErrorCodes.VALIDATION_ERROR,
        httpStatusCode: 400
      });
    }
  }

  private validateAccessToken(accessToken: string | null | undefined): void {
    if (!accessToken?.trim()) {
      throw new CheqiSDKError("Access token cannot be null or empty", {
        errorCode: ErrorCodes.AUTHENTICATION_FAILED,
        httpStatusCode: 401
      });
    }
  }
}
