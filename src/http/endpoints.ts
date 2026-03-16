export const Endpoints = {
  TEMPLATE_ENDPOINT: "/receipt/template",
  CUSTOMER_MATCH_ENDPOINT: "/recipient/resolve",
  ENCRYPTED_RECEIPT_ENDPOINT: "/receipt/encrypted",
  ENCRYPTED_CREDIT_NOTE_ENDPOINT: "/credit-note/encrypted",
  CREDIT_NOTE_TEMPLATE_ENDPOINT: "/credit-note/template",
  EMAIL_RECEIPT_ENDPOINT: "/receipt/email",
  COMPANY_PROVISION_ENDPOINT: "/company/provision",
  COMPANY_STORES_ENDPOINT: (companyId: string): string => `/company/${companyId}/stores`,
  COMPANY_STORE_ENDPOINT: (companyId: string, storeId: string): string => `/company/${companyId}/stores/${storeId}`,
  COMPANY_STORE_ACTIVATE_ENDPOINT: (companyId: string, storeId: string): string => `/company/${companyId}/stores/${storeId}/activate`,
  COMPANY_STORE_DEACTIVATE_ENDPOINT: (companyId: string, storeId: string): string => `/company/${companyId}/stores/${storeId}/deactivate`
} as const;
