import type { Company, CompanyAddress, CreateStoreRequest } from "./types.js";
import { isNonEmptyString } from "./utils.js";

export function getAddressValidationErrors(address?: CompanyAddress): string[] {
  const errors: string[] = [];
  if (!address) {
    errors.push("address is required");
    return errors;
  }

  if (!isNonEmptyString(address.streetName ?? address.street_name)) {
    errors.push("streetName is required");
  }
  if (!isNonEmptyString(address.cityName ?? address.city_name)) {
    errors.push("cityName is required");
  }
  if (!isNonEmptyString(address.postalZone ?? address.postal_zone)) {
    errors.push("postalZone is required");
  }

  const countryIsoCode = address.countryIsoCode ?? address.country_iso_code;
  if (!isNonEmptyString(countryIsoCode)) {
    errors.push("countryIsoCode is required");
  } else if (countryIsoCode.trim().length !== 2) {
    errors.push("countryIsoCode must be a 2-letter ISO code");
  }

  return errors;
}

export function getCompanyValidationErrors(company?: Company): string[] {
  const errors: string[] = [];

  if (!isNonEmptyString(company?.companyName ?? company?.company_name)) {
    errors.push("companyName is required");
  }

  const companyEmail = company?.companyEmail ?? company?.company_email;
  if (!isNonEmptyString(companyEmail)) {
    errors.push("companyEmail is required");
  } else if (!companyEmail.includes("@")) {
    errors.push("companyEmail must be a valid email address");
  }

  for (const error of getAddressValidationErrors(company?.address)) {
    errors.push(`address.${error}`);
  }

  return errors;
}

export function getCreateStoreRequestValidationErrors(request?: CreateStoreRequest): string[] {
  const errors: string[] = [];

  if (!isNonEmptyString(request?.storeName ?? request?.store_name)) {
    errors.push("storeName is required");
  }

  for (const error of getAddressValidationErrors(request?.address)) {
    errors.push(`address.${error}`);
  }

  return errors;
}
