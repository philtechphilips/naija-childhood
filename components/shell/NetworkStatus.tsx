"use client";

import { useUi } from "@/stores/ui-store";
import { Icon } from "@/components/ui/Icon";
import styles from "./NetworkStatus.module.css";

export function NetworkStatus() {
  const online = useUi((s) => s.online);
  if (online) return null;
  return (
    <div className={styles.pill} role="status">
      <Icon name="offline" size={16} />
      Offline — solo games still work
    </div>
  );
}
