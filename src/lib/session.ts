import { SessionOptions } from "iron-session";

export interface SessionData {
  user?: {
    email: string;
    loginAt: number;
  };
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_PASSWORD!,
  cookieName: "ipay_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 8, // 8-hour session
  },
};
