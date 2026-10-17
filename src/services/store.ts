import { CheqiSDKError, ErrorCodes } from "../errors.js";
import type { CheqiApiClient, CreateStoreRequest, RequestOptions, StoreDTO, UpdateStoreRequest } from "../types.js";
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
    options?: RequestOptions | null
  ): Promise<StoreDTO> {
    this.validateCompanyId(companyId);

    const validationErrors = getCreateStoreRequestValidationErrors(request);
    if (validationErrors.length > 0) {
      throw new CheqiSDKError(`Invalid store request: ${validationErrors.join(", ")}`, {
        errorCode: ErrorCodes.VALIDATION_ERROR,
        httpStatusCode: 400
      });
    }

    return this.apiClient.createStore(companyId, request, options);
  }

  getStores(
    companyId: string,
    activeOnly?: boolean,
    options?: RequestOptions | null
  ): Promise<StoreDTO[]> {
    this.validateCompanyId(companyId);
    return this.apiClient.getStores(companyId, activeOnly, options);
  }

  getActiveStores(
    companyId: string,
    options?: RequestOptions | null
  ): Promise<StoreDTO[]> {
    return this.getStores(companyId, true, options);
  }

  getStore(
    companyId: string,
    storeId: string,
    options?: RequestOptions | null
  ): Promise<StoreDTO> {
    this.validateCompanyId(companyId);
    this.validateStoreId(storeId);
    return this.apiClient.getStore(companyId, storeId, options);
  }

  updateStore(
    companyId: string,
    storeId: string,
    request: UpdateStoreRequest | null | undefined,
    options?: RequestOptions | null
  ): Promise<StoreDTO> {
    this.validateCompanyId(companyId);
    this.validateStoreId(storeId);
    if (!request) {
      throw new CheqiSDKError("Store request cannot be null", {
        errorCode: ErrorCodes.VALIDATION_ERROR,
        httpStatusCode: 400
      });
    }
    return this.apiClient.updateStore(companyId, storeId, request, options);
  }

  deleteStore(
    companyId: string,
    storeId: string,
    options?: RequestOptions | null
  ): Promise<void> {
    this.validateCompanyId(companyId);
    this.validateStoreId(storeId);
    return this.apiClient.deleteStore(companyId, storeId, options);
  }

  activateStore(
    companyId: string,
    storeId: string,
    options?: RequestOptions | null
  ): Promise<void> {
    this.validateCompanyId(companyId);
    this.validateStoreId(storeId);
    return this.apiClient.activateStore(companyId, storeId, options);
  }

  deactivateStore(
    companyId: string,
    storeId: string,
    options?: RequestOptions | null
  ): Promise<void> {
    this.validateCompanyId(companyId);
    this.validateStoreId(storeId);
    return this.apiClient.deactivateStore(companyId, storeId, options);
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
}
