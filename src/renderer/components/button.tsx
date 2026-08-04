import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "compact";
};

export function Button({ children, className = "", variant = "primary", ...props }: ButtonProps) {
  const variantClass =
    variant === "secondary"
      ? "border border-[#1b1c1a] bg-[#323331] text-[#d9d9d4] hover:bg-[#3d3f3c]"
      : variant === "compact"
        ? "border border-[#1b1c1a] bg-[#444642] text-[#eeeeea] hover:bg-[#51534f]"
        : "bg-[#b0ddeb] text-[#151515] hover:bg-[#c3e8f3]";

  return (
    <button
      className={`inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-[4px] px-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${variantClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

