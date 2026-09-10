import { createId } from './id';
import { apiBase, httpMessage, networkMessage, parseGuest, readJson } from './http';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientEvents,
  CommandInput,
  GuestSession,
  Reply,
  RoomState,
  RoomSummary,
  ServerEvents,
} from '@ensemble/shared';

export type GameSocket = Socket<ServerEvents, ClientEvents>;
type Connection = 'guest' | 'connecting' | 'connected' | 'offline' | 'expired' | 'replaced';
interface RealtimeContextValue {
  session: GuestSession | null;
  status: Connection;
  socket: GameSocket | null;
  rooms: RoomSummary[];
  room: RoomState | null;
  notice: string | null;
  register: (nickname: string) => Promise<void>;
  command: (command: CommandInput) => Promise<{ code?: string }>;
  clearRoom: () => void;
  notify: (message: string | null) => void;
  resetSession: () => void;
}
const Context = createContext<RealtimeContextValue | null>(null);
const storageKey = 'ensemble.guest';
function storedSession(): GuestSession | null {
  try {
    return parseGuest(JSON.parse(sessionStorage.getItem(storageKey) ?? 'null'));
  } catch {
    return null; /* Storage may be unavailable or hold stale text. */
  }
}
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(storedSession);
  const [status, setStatus] = useState<Connection>(session ? 'connecting' : 'guest');
  const [socket, setSocket] = useState<GameSocket | null>(null);
  const socketRef = useRef<GameSocket | null>(null);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [notice, notify] = useState<string | null>(null);
  useEffect(() => {
    if (session) return;
    const controller = new AbortController();
    const fetchRooms = () => {
      void fetch(apiBase + '/api/rooms', { signal: controller.signal })
        .then((r) => {
          if (!r.ok) throw new Error();
          return r.json() as Promise<{ rooms: RoomSummary[] }>;
        })
        .then((data) => setRooms(data.rooms))
        .catch(() => {});
    };
    fetchRooms();
    const interval = setInterval(fetchRooms, 5000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [session]);
  useEffect(() => {
    if (!session) {
      setStatus('guest');
      setSocket(null);
      return;
    }
    const client: GameSocket = io(import.meta.env.VITE_WS_URL || undefined, {
      auth: { token: session.token },
      autoConnect: false,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      timeout: 5000,
    });
    setSocket(client);
    socketRef.current = client;
    setStatus('connecting');
    client.on('session:ready', (player) => {
      setRoom((previous) => (previous?.code === player.roomCode ? previous : null));
      setStatus('connected');
    });
    client.on('disconnect', () =>
      setStatus((current) => (current === 'replaced' ? current : 'offline')),
    );
    client.on('connect_error', (error) => {
      if (error.message === 'SESSION_EXPIRED') {
        setStatus('expired');
        client.disconnect();
      } else setStatus('offline');
    });
    client.on('session:replaced', () => {
      setStatus('replaced');
      client.disconnect();
    });
    client.on('rooms:list', setRooms);
    client.on('room:state', setRoom);
    client.on('bottle:state', (update) => {
      setRoom((previous) => {
        if (
          !previous?.game ||
          previous.code !== update.code ||
          previous.game.roundId !== update.roundId
        )
          return previous;
        if (previous.game.game !== 'sorting') return previous;
        const game = previous.game;
        return {
          ...previous,
          players: update.players,
          game: {
            ...game,
            bottles: game.bottles.map((bottle) =>
              bottle.id === update.bottle.id ? update.bottle : bottle,
            ),
          },
        };
      });
    });
    client.on('room:closed', (error) => {
      setRoom(null);
      notify(error.message);
    });
    client.connect();
    return () => {
      client.removeAllListeners();
      client.disconnect();
      socketRef.current = null;
    };
  }, [session]);
  const command = useCallback(
    (input: CommandInput) =>
      new Promise<{ code?: string }>((resolve, reject) => {
        const client = socketRef.current;
        if (!client?.connected) {
          reject(new Error('La connexion revient… Patientez un instant.'));
          return;
        }
        const payload = { ...input, requestId: createId() };
        const send = (attempt: number) => {
          client.timeout(5000).emit('command', payload, (error: Error | null, reply: Reply) => {
            if (error) {
              if (attempt === 0 && client.connected) send(1);
              else reject(new Error('Le serveur ne répond pas. Réessayez dans un instant.'));
            } else if (!reply.ok) reject(new Error(reply.error.message));
            else resolve(reply.data);
          });
        };
        send(0);
      }),
    [],
  );
  const register = useCallback(async (nickname: string) => {
    let response: Response;
    try {
      response = await fetch(apiBase + '/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname }),
        signal: AbortSignal.timeout(8000),
      });
    } catch (error) {
      throw new Error(networkMessage(error));
    }
    const body = await readJson(response);
    if (!response.ok) throw new Error(httpMessage(response.status, body));
    const guest = parseGuest(body);
    if (!guest) throw new Error('Réponse inattendue du serveur. Réessayez dans un instant.');
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(guest));
    } catch {
      /* Optional storage. */
    }
    setSession(guest);
    notify(null);
  }, []);
  const resetSession = () => {
    socketRef.current?.disconnect();
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* Optional storage. */
    }
    setSession(null);
    setRoom(null);
    notify(null);
  };
  return (
    <Context.Provider
      value={{
        session,
        status,
        socket,
        rooms,
        room,
        notice,
        register,
        command,
        clearRoom: () => setRoom(null),
        notify,
        resetSession,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useRealtime() {
  const context = useContext(Context);
  if (!context) throw new Error('RealtimeProvider manquant');
  return context;
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Une petite interruption. Réessayez.';
}
