import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | null;
};

export function TextField({ label, error, id, ...props }: Props) {
  const fieldId = id ?? props.name ?? label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      <input id={fieldId} aria-invalid={Boolean(error)} {...props} />
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}
