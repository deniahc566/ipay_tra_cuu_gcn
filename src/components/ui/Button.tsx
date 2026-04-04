import { Spinner } from "./Spinner";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
  children: React.ReactNode;
}

export function Button({
  variant = "primary",
  loading = false,
  children,
  disabled,
  className = "",
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed";

  const variants = {
    primary:
      "bg-[#005BAC] text-white hover:bg-[#004a91] focus-visible:ring-[#005BAC]",
    secondary:
      "border border-[#005BAC] text-[#005BAC] bg-white hover:bg-[#f0f7ff] focus-visible:ring-[#005BAC]",
    ghost:
      "text-[#005BAC] hover:bg-[#f0f7ff] focus-visible:ring-[#005BAC]",
  };

  return (
    <button
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${className}`}
      {...props}
    >
      {loading && <Spinner className="text-current" />}
      {children}
    </button>
  );
}
