export const Endpoints = {
  CUSTOMER_MATCH_ENDPOINT: "/recipient/resolve",
  MATCH_STATUS_ENDPOINT: (matchId: string): string => `/recipient/matches/${encodeURIComponent(matchId)}`,
  ENCRYPTED_RECEIPT_ENDPOINT: "/receipt/encrypted",
  CLIENT_RECEIPT_DOWNLOAD_ENDPOINT: "/receipt/download",
  ENCRYPTED_CREDIT_NOTE_ENDPOINT: "/credit-note/encrypted",
  EMAIL_RECEIPT_ENDPOINT: "/receipt/email",
  RECEIPT_DESTINATIONS_ENDPOINT: "/company/receipt-destinations",
  RECEIPT_DESTINATION_ENDPOINT: (id: string): string => `/company/receipt-destinations/${encodeURIComponent(id)}`,
  RECEIPT_DESTINATION_QUEUE_ENDPOINT: (id: string): string => `/company/receipt-destinations/${encodeURIComponent(id)}/receipts/queue`,
  RECEIPT_DESTINATION_ACKNOWLEDGE_ENDPOINT: (id: string): string => `/company/receipt-destinations/${encodeURIComponent(id)}/receipts/queue/acknowledge`,
  WEBHOOK_SUBSCRIPTION_ENDPOINT: (id: string): string => `/webhook/subscription/${encodeURIComponent(id)}`,
  COMPANY_INVITE_EMPLOYEES_ENDPOINT: (companyId: string): string => `/company/${encodeURIComponent(companyId)}/invite/employees`,
  COMPANY_STORES_ENDPOINT: (companyId: string): string => `/company/${companyId}/stores`,
  COMPANY_STORE_ENDPOINT: (companyId: string, storeId: string): string => `/company/${companyId}/stores/${storeId}`,
  COMPANY_STORE_ACTIVATE_ENDPOINT: (companyId: string, storeId: string): string => `/company/${companyId}/stores/${storeId}/activate`,
  COMPANY_STORE_DEACTIVATE_ENDPOINT: (companyId: string, storeId: string): string => `/company/${companyId}/stores/${storeId}/deactivate`
} as const;
