import { Emblem } from "@/components/brand/Brand";
import styles from "./Splash.module.css";

export function Splash() {
  return (
    <div className={styles.splash} role="status" aria-label="Loading Naija Childhood">
      <div className={styles.mark}>
        <Emblem size={96} />
      </div>
      <div className={styles.dots} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
