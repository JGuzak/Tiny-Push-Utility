declare module "lucide-react" {
  import type { ComponentType, SVGProps } from "react";

  export type LucideIcon = ComponentType<SVGProps<SVGSVGElement>>;

  export const Check: LucideIcon;
  export const ChevronDown: LucideIcon;
  export const ChevronUp: LucideIcon;
  export const Copy: LucideIcon;
  export const Download: LucideIcon;
  export const RefreshCw: LucideIcon;
  export const Upload: LucideIcon;
  export const X: LucideIcon;
}
