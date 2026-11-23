import { useEffect, useRef, useState } from "react";

import { Avatar } from "@/components/avatar";

type Props = {
  local: MediaStream | null;
  remote: MediaStream | null;
  video: boolean;
  name: string;
};

function bind(
  node: HTMLMediaElement | null,
  stream: MediaStream | null,
  hooks?: { onBlocked?: () => void; onStarted?: () => void },
) {
  if (!node) return;
  if (node.srcObject !== stream) node.srcObject = stream;
  if (!stream || stream.getTracks().length === 0) return;
  const start = () => {
    void node.play?.().then(() => hooks?.onStarted?.()).catch(() => hooks?.onBlocked?.());
  };
  start();
  stream.getTracks().forEach((track) => {
    track.onunmute = start;
  });
}

export function MediaStage({ local, remote, video, name }: Props) {
  const remoteVideo = useRef<HTMLVideoElement | null>(null);
  const localVideo = useRef<HTMLVideoElement | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);
  const [hearBlocked, setHearBlocked] = useState(false);

  useEffect(() => {
    bind(remoteVideo.current, video ? remote : null);
    bind(remoteAudio.current, remote, {
      onBlocked: () => setHearBlocked(true),
      onStarted: () => setHearBlocked(false),
    });
    bind(localVideo.current, video ? local : null);
  }, [local, remote, video]);

  const remoteHasVideo = video && (remote?.getVideoTracks().length ?? 0) > 0;
  const localHasVideo = video && (local?.getVideoTracks().length ?? 0) > 0;

  return (
    <div className="stage">
      {remoteHasVideo ? (
        <video
          ref={(node) => {
            if (node) node.muted = true;
            remoteVideo.current = node;
            bind(node, remote);
          }}
          className="remote"
          autoPlay
          playsInline
          muted
        />
      ) : (
        <div className="audio-stage">
          <Avatar name={name} size={148} dark />
        </div>
      )}
      <audio
        ref={(node) => {
          remoteAudio.current = node;
          bind(node, remote, {
            onBlocked: () => setHearBlocked(true),
            onStarted: () => setHearBlocked(false),
          });
        }}
        autoPlay
      />
      {hearBlocked ? (
        <button
          type="button"
          className="hear"
          onClick={() => {
            void remoteAudio.current
              ?.play()
              .then(() => setHearBlocked(false))
              .catch(() => setHearBlocked(true));
          }}
        >
          Click to hear
        </button>
      ) : null}
      {localHasVideo ? (
        <video
          ref={(node) => {
            if (node) node.muted = true;
            localVideo.current = node;
            bind(node, local);
          }}
          className="pip"
          autoPlay
          playsInline
          muted
        />
      ) : null}
    </div>
  );
}
