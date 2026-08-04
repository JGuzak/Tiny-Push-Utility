import type { HTMLAttributes, ReactNode } from "react";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  variant?: "default" | "muted" | "success" | "danger";
};

export function Badge({ children, className = "", variant = "default", ...props }: BadgeProps) {
  const variantClasses = {
    danger: "bg-[#9b3a34] text-[#f2e6e2]",
    default: "border border-[#1b1c1a] bg-[#4b4d49] text-[#eeeeea]",
    muted: "border border-[#1b1c1a] bg-[#3b3d3a] text-[#d4d4ce]",
    success: "bg-[#5f7d4f] text-[#f0f4ec]"
  };

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-[4px] px-1.5 py-0.5 text-[11px] font-bold ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

