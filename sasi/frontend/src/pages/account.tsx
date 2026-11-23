import { useState, type FormEvent } from "react";

import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { messageFrom, useAuth } from "@/context/auth-context";

export function AccountPage() {
  const { user, updateDisplayName, signOut } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await updateDisplayName(displayName);
      setMessage("Display name saved.");
    } catch (caught) {
      setError(messageFrom(caught, "The name could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page account">
      <h1 className="title">Account</h1>
      <p>{user?.email}</p>
      <p className="subtitle">@{user?.username}</p>
      <form className="form" onSubmit={(event) => void save(event)}>
        <TextField
          label="Display name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        {message ? <p className="message">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <Button type="submit" disabled={saving || !displayName.trim()}>
          {saving ? "Saving" : "Save name"}
        </Button>
      </form>
      <Button
        type="button"
        variant={confirming ? "danger" : "ghost"}
        onClick={() => {
          if (!confirming) {
            setConfirming(true);
            return;
          }
          void signOut();
        }}
      >
        {confirming ? "Tap again to sign out" : "Sign out"}
      </Button>
    </main>
  );
}
