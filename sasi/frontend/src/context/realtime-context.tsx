import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { env } from "@/config/env";
import { useAuth } from "@/context/auth-context";
import { CallCoordinator, initialCallUi } from "@/services/call-coordinator";
import { getContainer } from "@/services/container";
import { setBeforeSignOut } from "@/services/session-bridge";
import { SignalingSocket, type SocketStatus } from "@/services/signaling-socket";
import type { Call, CallType, CallUiState, PublicUser, ServerEvent } from "@/types/models";

type RealtimeContextValue = {
  socketStatus: SocketStatus;
  people: PublicUser[];
  directoryLoading: boolean;
  directoryError: string | null;
  callState: CallUiState;
  refreshDirectory: (query?: string) => Promise<void>;
  startCall: (calleeId: string, callType: CallType) => Promise<Call>;
  acceptCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  hangUp: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  switchCamera: () => Promise<void>;
  dismissEnded: () => void;
};

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

function sortPeople(people: PublicUser[]) {
  return [...people].sort((left, right) => {
    const rank = Number(left.presence.status !== "online") - Number(right.presence.status !== "online");
    if (rank !== 0) return rank;
    return left.display_name.localeCompare(right.display_name);
  });
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const [socketStatus, setSocketStatus] = useState<SocketStatus>("idle");
  const [people, setPeople] = useState<PublicUser[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [callState, setCallState] = useState<CallUiState>(initialCallUi);
  const coordinatorRef = useRef<CallCoordinator | null>(null);
  const socketRef = useRef<SignalingSocket | null>(null);
  const queryRef = useRef("");

  const refreshDirectory = useCallback(async (query = queryRef.current) => {
    queryRef.current = query;
    setDirectoryLoading(true);
    try {
      const page = await getContainer().directory.list(query);
      setPeople(sortPeople(page.results));
      setDirectoryError(null);
    } catch (error) {
      setDirectoryError(error instanceof Error ? error.message : "The directory could not be loaded.");
    } finally {
      setDirectoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !user) {
      socketRef.current?.stop();
      socketRef.current = null;
      coordinatorRef.current?.dispose();
      coordinatorRef.current = null;
      setBeforeSignOut(null);
      setCallState(initialCallUi);
      setPeople([]);
      setSocketStatus("idle");
      return;
    }

    const coordinator = new CallCoordinator(user.id, getContainer().calls);
    coordinatorRef.current = coordinator;
    const unsubscribe = coordinator.subscribe(setCallState);
    const socket = new SignalingSocket({
      url: env.wsUrl,
      getToken: () => getContainer().tokens.getAccess(),
      refreshToken: () => getContainer().auth.refreshAccess(),
      onStatus: (next) => {
        setSocketStatus(next);
        if (next !== "open") return;
        void refreshDirectory(queryRef.current);
        void getContainer()
          .calls.list(true)
          .then((page) => coordinator.restore(page.results[0] ?? null))
          .catch(() => undefined);
      },
      onEvent: (event: ServerEvent) => {
        if (event.type === "presence.update") {
          setPeople((current) =>
            sortPeople(
              current.map((person) =>
                person.id === event.user_id
                  ? { ...person, presence: { status: event.status, last_seen_at: event.last_seen_at } }
                  : person,
              ),
            ),
          );
          return;
        }
        coordinator.handle(event);
      },
    });
    coordinator.attachSend((action) => socket.send(action));
    socketRef.current = socket;
    socket.start();
    void refreshDirectory("");

    setBeforeSignOut(async () => {
      await coordinator.hangUp().catch(() => undefined);
      socket.stop();
    });

    return () => {
      setBeforeSignOut(null);
      unsubscribe();
      socket.stop();
      coordinator.dispose();
      if (coordinatorRef.current === coordinator) coordinatorRef.current = null;
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [status, user?.id, refreshDirectory]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      socketStatus,
      people,
      directoryLoading,
      directoryError,
      callState,
      refreshDirectory,
      startCall: (calleeId, callType) => {
        const coordinator = coordinatorRef.current;
        if (!coordinator) throw new Error("The call service is not connected.");
        return coordinator.startOutgoing(calleeId, callType);
      },
      acceptCall: async () => {
        await coordinatorRef.current?.accept();
      },
      declineCall: async () => {
        await coordinatorRef.current?.decline();
      },
      hangUp: async () => {
        await coordinatorRef.current?.hangUp();
      },
      toggleMute: () => coordinatorRef.current?.toggleMute(),
      toggleCamera: () => coordinatorRef.current?.toggleCamera(),
      switchCamera: async () => {
        await coordinatorRef.current?.switchCamera();
      },
      dismissEnded: () => {
        if (coordinatorRef.current?.snapshot().phase === "ended") {
          void coordinatorRef.current.hangUp();
        }
      },
    }),
    [socketStatus, people, directoryLoading, directoryError, callState, refreshDirectory],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const value = useContext(RealtimeContext);
  if (!value) throw new Error("useRealtime must be used within RealtimeProvider.");
  return value;
}
