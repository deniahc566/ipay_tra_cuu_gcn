import "iron-session";

declare module "iron-session" {
  interface IronSessionData {
    user?: {
      email: string;
      loginAt: number;
    };
  }
}
