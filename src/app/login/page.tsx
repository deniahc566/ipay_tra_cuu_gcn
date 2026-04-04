import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Đăng nhập | iPay GCN",
};

export default function LoginPage() {
  return <LoginForm />;
}
