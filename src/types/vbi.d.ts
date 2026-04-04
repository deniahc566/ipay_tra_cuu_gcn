export interface VbiRecord {
  CERT_NO: string;
  GCN: string;
  TEN_KH: string;
  PROD_CODE: string;
  CAT_CODE: string;
  BOOKING_CODE: string;
  ORG_SALES: string;
  EFF_DATE: string;
  CANCEL_DATE: string;
  CANCEL_REASON: string;
  STATUS: string;
}

export interface VbiApiResponse {
  success: boolean;
  data?: {
    cur_list_0?: unknown[];
  };
  error: string;
  error_code: string | null;
  error_message: string | null;
}
