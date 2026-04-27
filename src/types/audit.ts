export type AuditEventType = "login_success" | "login_failed" | "logout" | "lookup" | "cancel" | "admin_view";

interface BaseEvent {
  id: string;
  type: AuditEventType;
  email: string;
  timestamp: number;
  requestId?: string;
  userAgent?: string;
}

export interface LoginSuccessEvent extends BaseEvent {
  type: "login_success";
}

export interface LoginFailedEvent extends BaseEvent {
  type: "login_failed";
  reason: string;
}

export interface LogoutEvent extends BaseEvent {
  type: "logout";
}

export interface LookupEvent extends BaseEvent {
  type: "lookup";
  /** All criteria fields are sha256-hashed (first 8 hex chars) — no raw PII stored */
  criteria: {
    CERT_NO_hash: string;
    ACCOUNT_NO_hash: string;
    IDCARD_hash: string;
    PHONE_hash: string;
  };
  resultCount: number;
  success: boolean;
  error?: string;
}

export interface CancelEvent extends BaseEvent {
  type: "cancel";
  certNo: string;
  success: boolean;
  error?: string;
}

export interface AdminViewEvent extends BaseEvent {
  type: "admin_view";
}

export type AuditEvent =
  | LoginSuccessEvent
  | LoginFailedEvent
  | LogoutEvent
  | LookupEvent
  | CancelEvent
  | AdminViewEvent;
