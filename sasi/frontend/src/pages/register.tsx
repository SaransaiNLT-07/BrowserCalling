import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { messageFrom, useAuth } from "@/context/auth-context";
import { fieldMessage } from "@/lib/format";
import { ApiError } from "@/services/api-client";

export function RegisterPage() {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await register({
        display_name: displayName,
        username,
        email,
        password,
      });
    } catch (caught) {
      if (caught instanceof ApiError) setFields(caught.fields ?? {});
      setError(messageFrom(caught, "The account could not be created."));
    } finally {
      setSubmitting(false);
    }
  }

  const ready = displayName.trim() && username.trim() && email.trim() && password.length >= 10;

  return (
    <div className="auth-page">
      <form className="form" style={{ width: "min(720px, 100%)" }} onSubmit={(event) => void submit(event)}>
        <p className="kicker">Saran</p>
        <h1 className="title">Create an account</h1>
        <p className="subtitle">A display name, a handle, and a password of at least 10 characters.</p>
        <TextField
          label="Display name"
          autoComplete="name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          error={fieldMessage(fields, "display_name")}
          required
        />
        <TextField
          label="Username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          error={fieldMessage(fields, "username")}
          required
        />
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
          autoComplete="new-password"
          minLength={10}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldMessage(fields, "password")}
          required
        />
        {error ? <p className="error">{error}</p> : null}
        <Button type="submit" disabled={!ready || submitting}>
          {submitting ? "Creating account" : "Create account"}
        </Button>
        <Link className="link" to="/sign-in">
          Already have an account
        </Link>
      </form>
    </div>
  );
}
