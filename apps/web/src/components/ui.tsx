import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import { ArrowRight, Check, Copy, LoaderCircle, X } from 'lucide-react';
import { nicknameSchema, type Player, type RoomSettings } from '@ensemble/shared';
import { errorMessage, useRealtime } from '../lib/realtime';

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button className="icon-button modal-close" onClick={onClose} aria-label="Fermer">
        <X size={20} />
      </button>
      <p className="eyebrow">UNE PLACE POUR VOUS</p>
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}
export function NicknameForm({ onDone }: { onDone?: () => void }) {
  const { register } = useRealtime();
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = nicknameSchema.safeParse(nickname);
    if (!result.success) {
      setError(result.error.issues[0]!.message);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await register(result.data);
      onDone?.();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)} className="stack">
      <p className="muted">Juste un petit nom, et on joue. Aucun compte à créer.</p>
      <label>
        Votre pseudo
        <input
          autoFocus
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Ex. Camille"
          minLength={2}
          maxLength={20}
          autoComplete="nickname"
          required
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button" disabled={busy}>
        {busy ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <>
            C’est parti <ArrowRight size={18} />
          </>
        )}
      </button>
    </form>
  );
}
export function SettingsFields({
  value,
  onChange,
  disabled = false,
  minimumPlayers = 2,
}: {
  value: RoomSettings;
  onChange: (value: RoomSettings) => void;
  disabled?: boolean;
  minimumPlayers?: number;
}) {
  return (
    <div className="settings-fields">
      <label>
        Bouteilles à ranger <strong>{value.bottleCount}</strong>
        <input
          aria-label="Bouteilles à ranger"
          type="range"
          min="6"
          max="60"
          step="1"
          value={value.bottleCount}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, bottleCount: Number(e.target.value) })}
        />
      </label>
      <div className="preset-row">
        {[10, 20, 30, 50].map((count) => (
          <button
            key={count}
            type="button"
            disabled={disabled}
            className={value.bottleCount === count ? 'preset selected' : 'preset'}
            onClick={() => onChange({ ...value, bottleCount: count })}
          >
            {count}
          </button>
        ))}
      </div>
      <div className="field-pair">
        <label>
          Places à la table
          <select
            aria-label="Nombre maximal de joueurs"
            disabled={disabled}
            value={value.maxPlayers}
            onChange={(e) => onChange({ ...value, maxPlayers: Number(e.target.value) })}
          >
            {[2, 3, 4, 5, 6, 7, 8]
              .filter((n) => n >= minimumPlayers)
              .map((n) => (
                <option key={n} value={n}>
                  {n} joueurs
                </option>
              ))}
          </select>
        </label>
        <label>
          Couleurs
          <select
            disabled={disabled}
            value={value.colorCount}
            onChange={(e) => onChange({ ...value, colorCount: Number(e.target.value) })}
          >
            {[3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} couleurs
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
export function Avatar({
  player,
  small = false,
}: {
  player: Pick<Player, 'nickname' | 'color'>;
  small?: boolean;
}) {
  return (
    <span
      className={'avatar' + (small ? ' small' : '')}
      style={{ '--player-color': player.color } as CSSProperties}
      title={player.nickname}
    >
      {player.nickname.slice(0, 1).toUpperCase()}
    </span>
  );
}
export function CopyInvite({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const url = window.location.origin + '/games/sorting/rooms/' + code;
  return (
    <div className="invite-box">
      <div>
        <span className="eyebrow">LE CODE DE VOTRE TABLE</span>
        <strong>{code}</strong>
      </div>
      <button
        className="button secondary compact"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(url)
            .then(() => {
              setCopied(true);
              clearTimeout(timer.current);
              timer.current = setTimeout(() => setCopied(false), 2500);
            })
            .catch(() => setError(true));
          if (!navigator.clipboard) setError(true);
        }}
      >
        {copied ? <Check size={17} /> : <Copy size={17} />}
        {copied ? 'Copié !' : 'Copier le lien'}
      </button>
      {error && (
        <input
          aria-label="Lien à copier"
          readOnly
          value={url}
          onFocus={(event) => event.target.select()}
        />
      )}
    </div>
  );
}
