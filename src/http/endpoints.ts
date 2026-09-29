export const Endpoints = {
  CUSTOMER_MATCH_ENDPOINT: "/recipient/resolve",
  MATCH_STATUS_ENDPOINT: (matchId: string): string => `/recipient/matches/${encodeURIComponent(matchId)}`,
  ENCRYPTED_RECEIPT_ENDPOINT: "/receipt/encrypted",
  CLIENT_RECEIPT_DOWNLOAD_ENDPOINT: "/receipt/download",
  ENCRYPTED_CREDIT_NOTE_ENDPOINT: "/credit-note/encrypted",
  EMAIL_RECEIPT_ENDPOINT: "/receipt/email",
  COMPANY_STORES_ENDPOINT: (companyId: string): string => `/company/${companyId}/stores`,
  COMPANY_STORE_ENDPOINT: (companyId: string, storeId: string): string => `/company/${companyId}/stores/${storeId}`,
  COMPANY_STORE_ACTIVATE_ENDPOINT: (companyId: string, storeId: string): string => `/company/${companyId}/stores/${storeId}/activate`,
  COMPANY_STORE_DEACTIVATE_ENDPOINT: (companyId: string, storeId: string): string => `/company/${companyId}/stores/${storeId}/deactivate`
} as const;
