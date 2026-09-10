import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import { ArrowRight, Check, Copy, LoaderCircle, X } from 'lucide-react';
import {
  MAX_BOTTLES,
  MAX_SHAPES,
  nicknameSchema,
  SHAPES,
  WANTED_HEADS,
  WANTED_LEVELS,
  WANTED_PACES,
  type GameId,
  type Player,
  type RoomSettings,
  type SortingSettings,
  type WantedSettings,
} from '@ensemble/shared';
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
function SortingFields({
  value,
  onChange,
  disabled = false,
  minimumPlayers = 2,
}: {
  value: SortingSettings;
  onChange: (value: SortingSettings) => void;
  disabled?: boolean;
  minimumPlayers?: number;
}) {
  return (
    <div className="settings-fields">
      <label>
        Objets à ranger <strong>{value.bottleCount}</strong>
        <input
          aria-label="Objets à ranger"
          type="range"
          min="6"
          max={MAX_BOTTLES}
          step="1"
          value={value.bottleCount}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, bottleCount: Number(e.target.value) })}
        />
      </label>
      <div className="preset-row">
        {[20, 40, 80, 150, MAX_BOTTLES].map((count) => (
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
            aria-label="Nombre de couleurs"
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
      <label>
        Variété d’objets
        <select
          aria-label="Variété d’objets"
          disabled={disabled}
          value={value.shapeCount}
          onChange={(e) => onChange({ ...value, shapeCount: Number(e.target.value) })}
        >
          {Array.from({ length: MAX_SHAPES }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n === 1 ? 'Seulement des bouteilles' : n + ' formes différentes'}
            </option>
          ))}
        </select>
      </label>
      <p className="form-hint">
        {SHAPES.slice(0, value.shapeCount)
          .map((shape) => shape.label)
          .join(', ')}
        .
      </p>
    </div>
  );
}
const PACE_LABELS: Record<(typeof WANTED_PACES)[number], string> = {
  douce: 'Douce — on prend le temps',
  normale: 'Normale — ça monte bien',
  corsee: 'Corsée — pour les yeux aiguisés',
};

function WantedFields({
  value,
  onChange,
  disabled = false,
  minimumPlayers = 2,
}: {
  value: WantedSettings;
  onChange: (value: WantedSettings) => void;
  disabled?: boolean;
  minimumPlayers?: number;
}) {
  return (
    <div className="settings-fields">
      <label>
        Têtes au premier niveau <strong>{value.startHeads}</strong>
        <input
          aria-label="Têtes au premier niveau"
          type="range"
          min={WANTED_HEADS.min}
          max={40}
          step="1"
          value={value.startHeads}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, startHeads: Number(e.target.value) })}
        />
      </label>
      <label>
        Niveaux à franchir <strong>{value.levels}</strong>
        <input
          aria-label="Niveaux à franchir"
          type="range"
          min={WANTED_LEVELS.min}
          max={WANTED_LEVELS.max}
          step="1"
          value={value.levels}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, levels: Number(e.target.value) })}
        />
      </label>
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
          Montée en difficulté
          <select
            aria-label="Montée en difficulté"
            disabled={disabled}
            value={value.pace}
            onChange={(e) => onChange({ ...value, pace: e.target.value as WantedSettings['pace'] })}
          >
            {WANTED_PACES.map((pace) => (
              <option key={pace} value={pace}>
                {PACE_LABELS[pace]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="form-hint">
        La foule grossit, se divise en plus de groupes, et l’intruse finit par ne se distinguer que
        par un seul détail.
      </p>
    </div>
  );
}

/** Aiguillage : chaque jeu a ses réglages, le lobby n’a pas à les connaître. */
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
  return value.game === 'wanted' ? (
    <WantedFields
      value={value}
      onChange={onChange}
      disabled={disabled}
      minimumPlayers={minimumPlayers}
    />
  ) : (
    <SortingFields
      value={value}
      onChange={onChange}
      disabled={disabled}
      minimumPlayers={minimumPlayers}
    />
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
export function CopyInvite({ code, gameId }: { code: string; gameId: GameId }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const url = window.location.origin + '/games/' + gameId + '/rooms/' + code;
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
