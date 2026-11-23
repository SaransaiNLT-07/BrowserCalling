import { monogram } from "@/lib/format";

export function Avatar({ name, size = 48, dark = false }: { name: string; size?: number; dark?: boolean }) {
  return (
    <div
      className={`avatar${dark ? " dark" : ""}`}
      style={{ width: size, height: size, fontSize: size * 0.32 }}
      aria-hidden
    >
      {monogram(name)}
    </div>
  );
}
 
