import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "ghost" | "sun";
type Size = "md" | "lg" | "sm";

interface CommonProps {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  block?: boolean;
  children: ReactNode;
}

const cls = (variant: Variant, size: Size, block?: boolean, extra?: string) =>
  [styles.btn, styles[variant], styles[size], block ? styles.block : "", extra ?? ""].join(" ");

export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  block,
  children,
  className,
  ...rest
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={cls(variant, size, block, className)} {...rest}>
      {icon && <Icon name={icon} size={size === "lg" ? 22 : 18} />}
      <span>{children}</span>
      {iconRight && <Icon name={iconRight} size={size === "lg" ? 22 : 18} />}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  block,
  children,
  className,
  onClick,
}: CommonProps & { href: string; className?: string; onClick?: () => void }) {
  return (
    <Link href={href} className={cls(variant, size, block, className)} onClick={onClick}>
      {icon && <Icon name={icon} size={size === "lg" ? 22 : 18} />}
      <span>{children}</span>
      {iconRight && <Icon name={iconRight} size={size === "lg" ? 22 : 18} />}
    </Link>
  );
}
