"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import styles from "./Nav.module.css";

const ITEMS: { href: string; label: string; icon: IconName; color: string }[] = [
  { href: "/", label: "Lobby", icon: "home", color: "#2fc77a" },
  { href: "/games", label: "Games", icon: "games", color: "#ffc53d" },
  { href: "/challenges", label: "Quests", icon: "flag", color: "#ff8a4c" },
  { href: "/leaderboard", label: "Ranks", icon: "trophy", color: "#7ec8ff" },
  { href: "/profile", label: "Me", icon: "user", color: "#ff7eb6" },
];

/** Floating game-style tab bar (all screen sizes). */
export function Nav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <nav className={styles.bar} aria-label="Main">
      {ITEMS.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={styles.item}
            aria-current={active ? "page" : undefined}
            style={{ ["--c" as string]: item.color }}
          >
            <span className={styles.bubble}>
              <Icon name={item.icon} size={22} strokeWidth={2.4} />
            </span>
            <span className={styles.label}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
