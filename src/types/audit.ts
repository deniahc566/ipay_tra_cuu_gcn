export type AuditEventType = "login_success" | "login_failed" | "logout" | "lookup" | "cancel";

interface BaseEvent {
  id: string;
  type: AuditEventType;
  email: string;
  timestamp: number;
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
  criteria: {
    CERT_NO: string;
    ACCOUNT_NO: string;
    IDCARD: string;
    PHONE_NUMBER: string;
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

export type AuditEvent =
  | LoginSuccessEvent
  | LoginFailedEvent
  | LogoutEvent
  | LookupEvent
  | CancelEvent;
