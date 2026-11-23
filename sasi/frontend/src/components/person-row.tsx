import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import type { CallType, PublicUser } from "@/types/models";

type Props = {
  person: PublicUser;
  disabled: boolean;
  onCall: (callType: CallType) => void;
};

export function PersonRow({ person, disabled, onCall }: Props) {
  const online = person.presence.status === "online";
  return (
    <article className="person">
      <Avatar name={person.display_name} />
      <div className="person-copy">
        <h2 className="person-name">{person.display_name}</h2>
        <div className="meta-row">
          <span className={`dot${online ? " on" : ""}`} />
          <span>
            @{person.username} · {online ? "Online" : "Offline"}
          </span>
        </div>
      </div>
      <div className="actions">
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          onClick={() => onCall("audio")}
          aria-label={`Audio call ${person.display_name}`}
        >
          Audio
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={() => onCall("video")}
          aria-label={`Video call ${person.display_name}`}
        >
          Video
        </Button>
      </div>
    </article>
  );
}
