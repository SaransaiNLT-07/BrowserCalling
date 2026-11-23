import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { messageFrom, useAuth } from "@/context/auth-context";
import { fieldMessage } from "@/lib/format";
import { ApiError } from "@/services/api-client";

export function SignInPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setError(null);
    setFields({});
  }, [email, password]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (caught) {
      if (caught instanceof ApiError) setFields(caught.fields ?? {});
      setError(messageFrom(caught, "Sign in failed."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-grid">
        <aside className="auth-panel">
          <p className="kicker">Saran</p>
          <h1 className="title">A direct line between two people.</h1>
          <p className="body-copy">
            Presence shows who can pick up. Audio and video stay one to one. When the call ends, the camera and
            microphone are released.
          </p>
        </aside>
        <form className="form" onSubmit={(event) => void submit(event)}>
          <p className="kicker">Saran</p>
          <h1 className="title">Sign in</h1>
          <p className="subtitle">Use the email and password for your account.</p>
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={fieldMessage(fields, "email")}
            required
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldMessage(fields, "password")}
            required
          />
          {error ? <p className="error">{error}</p> : null}
          <Button type="submit" disabled={submitting || !email || !password}>
            {submitting ? "Signing in" : "Sign in"}
          </Button>
          <Link className="link" to="/register">
            Create an account
          </Link>
        </form>
      </div>
    </div>
  );
}
