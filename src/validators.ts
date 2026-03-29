import type { AddressDTO, CompanyDTO } from "./types.js";
import type { CreateStoreRequest } from "./models/generated/index.js";
import { Company } from "./models/domain.js";
import { isNonEmptyString, isValidEmail } from "./utils.js";

export function getAddressValidationErrors(address?: Partial<AddressDTO> | { streetName?: string; cityName?: string; postalZone?: string; countryIsoCode?: string }): string[] {
  const errors: string[] = [];
  if (!address) {
    errors.push("address is required");
    return errors;
  }

  if (!isNonEmptyString(address.streetName)) {
    errors.push("streetName is required");
  }
  if (!isNonEmptyString(address.cityName)) {
    errors.push("cityName is required");
  }
  if (!isNonEmptyString(address.postalZone)) {
    errors.push("postalZone is required");
  }

  const countryIsoCode = address.countryIsoCode;
  if (!isNonEmptyString(countryIsoCode)) {
    errors.push("countryIsoCode is required");
  } else if (countryIsoCode.trim().length !== 2) {
    errors.push("countryIsoCode must be a 2-letter ISO code");
  }

  return errors;
}

export function getCompanyValidationErrors(company?: Company | CompanyDTO | Record<string, any>): string[] {
  const errors: string[] = [];

  if (!isNonEmptyString(company?.companyName)) {
    errors.push("companyName is required");
  }

  const companyEmail = company?.companyEmail;
  if (!isNonEmptyString(companyEmail)) {
    errors.push("companyEmail is required");
  } else if (!isValidEmail(companyEmail)) {
    errors.push("companyEmail must be a valid email address");
  }

  const address = company instanceof Company ? company.address : (company as any)?.addressDto;
  for (const error of getAddressValidationErrors(address)) {
    errors.push(`address.${error}`);
  }

  return errors;
}

export function getCreateStoreRequestValidationErrors(request?: CreateStoreRequest | Record<string, any>): string[] {
  const errors: string[] = [];

  if (!isNonEmptyString(request?.storeName)) {
    errors.push("storeName is required");
  }

  const address = (request as any)?.addressDto ?? (request as any)?.address;
  for (const error of getAddressValidationErrors(address)) {
    errors.push(`address.${error}`);
  }

  return errors;
}
