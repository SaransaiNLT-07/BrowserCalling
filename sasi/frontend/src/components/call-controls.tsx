type Props = {
  muted: boolean;
  cameraEnabled: boolean;
  video: boolean;
  onMute: () => void;
  onCamera: () => void;
  onSwitch: () => void;
  onHangUp: () => void;
};

function Round({
  label,
  active,
  danger,
  onClick,
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`round${active ? " active" : ""}${danger ? " danger" : ""}`}
      aria-label={label}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function CallControls({ muted, cameraEnabled, video, onMute, onCamera, onSwitch, onHangUp }: Props) {
  return (
    <div className="round-row">
      <Round label={muted ? "Unmute" : "Mute"} active={muted} onClick={onMute} />
      {video ? <Round label={cameraEnabled ? "Camera" : "Cam off"} active={!cameraEnabled} onClick={onCamera} /> : null}
      {video ? <Round label="Flip" onClick={onSwitch} /> : null}
      <Round label="End" danger onClick={onHangUp} />
    </div>
  );
}
