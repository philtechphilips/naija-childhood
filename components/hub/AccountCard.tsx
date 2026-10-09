"use client";

import { useState, type FormEvent } from "react";
import { ApiError, apiEnabled } from "@/lib/api";
import { useAccount } from "@/stores/account-store";
import { useSync } from "@/stores/sync-store";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/bits";
import page from "./page.module.css";
import styles from "./AccountCard.module.css";

const TIME = new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" });

/**
 * Optional account. Guests keep playing on the phone; an account saves scores
 * online, puts you on the global leaderboards and restores progress on a new phone.
 */
export function AccountCard() {
  const user = useAccount((s) => s.user);
  const queued = useSync((s) => s.queue.length);
  const lastSyncAt = useSync((s) => s.lastSyncAt);
  const syncing = useSync((s) => s.syncing);
  const [mode, setMode] = useState<"register" | "login">("register");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!apiEnabled) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const a = useAccount.getState();
      await (mode === "register" ? a.register({ email, password }) : a.login({ email, password }));
      setPassword("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? (err.issues?.[0]?.message ?? err.message) : "Couldn't reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  if (user) {
    return (
      <section className={`${page.card} ${styles.card}`} aria-label="Account">
        <div className={styles.row}>
          <span className={styles.icon}>
            <Icon name="check" size={18} />
          </span>
          <div className={styles.text}>
            <strong>Signed in</strong>
            <span className={styles.email}>{user.email}</span>
            <span>
              {syncing ? "Saving your scores…" : queued > 0 ? `${queued} game${queued === 1 ? "" : "s"} waiting to sync` : lastSyncAt ? `Scores saved · ${TIME.format(lastSyncAt)}` : "Your scores save to your account"}
            </span>
          </div>
        </div>
        <div className={styles.actions}>
          <Button size="sm" variant="secondary" onClick={() => void useAccount.getState().logout()}>
            Log out
          </Button>
          {confirmDelete ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => void useAccount.getState().deleteAccount().catch(() => setError("Couldn't delete right now."))}>
                Yes, delete my account
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
              Delete account
            </Button>
          )}
        </div>
        {error && <p className={styles.error}>{error}</p>}
      </section>
    );
  }

  return (
    <section className={`${page.card} ${styles.card} ${styles.guest}`} aria-label="Account">
      <div className={styles.row}>
        <span className={styles.icon}>
          <Icon name="trophy" size={18} />
        </span>
        <div className={styles.text}>
          <strong>Playing as a guest</strong>
          <span>Create a free account to save your scores, enter the global leaderboards and keep your progress on a new phone.</span>
        </div>
      </div>
      {!open ? (
        <div className={styles.actions}>
          <Button size="sm" variant="sun" onClick={() => (setMode("register"), setOpen(true))}>
            Create account
          </Button>
          <Button size="sm" variant="secondary" onClick={() => (setMode("login"), setOpen(true))}>
            Log in
          </Button>
        </div>
      ) : (
        <form className={styles.form} onSubmit={submit}>
          <Segmented
            label="Account"
            value={mode}
            onChange={(v) => setMode(v)}
            options={[
              { value: "register", label: "Create account" },
              { value: "login", label: "Log in" },
            ]}
          />
          <label className={styles.field}>
            <span>Email</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Password</span>
            <input
              type="password"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              required
              minLength={mode === "register" ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {mode === "register" && queued > 0 && <p className={styles.note}>Your last {queued} game{queued === 1 ? "" : "s"} on this phone will be added to your account.</p>}
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            <Button type="submit" size="sm" variant="sun" disabled={busy}>
              {busy ? "One moment…" : mode === "register" ? "Create account" : "Log in"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Not now
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
