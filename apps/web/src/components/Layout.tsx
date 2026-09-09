import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { ArrowUpRight, CircleHelp, Flower2, UserRound, X } from 'lucide-react';
import { useRealtime } from '../lib/realtime';
import { Modal, NicknameForm } from './ui';
import { ObjectDefs } from './ObjectArt';
export function Layout() {
  const { session, status, notice, notify, room, resetSession } = useRealtime();
  const [profileOpen, setProfileOpen] = useState(false);
  return (
    <div className="app-shell">
      <ObjectDefs />
      <header className="site-header">
        <Link className="brand" to="/">
          <Flower2 strokeWidth={2.2} />
          <span>
            ensemble<span className="brand-dot">.</span>
          </span>
        </Link>
        <nav aria-label="Navigation principale">
          <NavLink to="/" end>
            La collection
          </NavLink>
          <Link to="/#comment-jouer">
            L’esprit Ensemble <ArrowUpRight size={13} />
          </Link>
        </nav>
        <button className="profile-button" onClick={() => setProfileOpen(true)}>
          <span className={'presence-dot ' + (status === 'connected' ? 'online' : '')} />
          {session?.nickname ?? 'Votre petit nom'}
          <UserRound size={16} />
        </button>
      </header>
      {session && ['offline', 'connecting', 'expired', 'replaced'].includes(status) && (
        <div className="connection-banner" role="status">
          {status === 'expired'
            ? 'Votre session a expiré après un redémarrage du serveur.'
            : status === 'replaced'
              ? 'Cette session est ouverte dans une autre fenêtre.'
              : 'Connexion en cours… Votre place est gardée pendant 30 secondes.'}
          {['expired', 'replaced'].includes(status) && (
            <button onClick={resetSession}>Choisir un pseudo</button>
          )}
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button onClick={() => notify(null)} aria-label="Fermer le message">
            <X size={16} />
          </button>
        </div>
      )}
      {room && (
        <Link className="resume-link" to={'/games/sorting/rooms/' + room.code}>
          Votre table {room.code} <ArrowUpRight size={14} />
        </Link>
      )}
      <Outlet />
      <footer className="site-footer">
        <Link className="brand footer-brand" to="/">
          <Flower2 />
          <span>ensemble.</span>
        </Link>
        <p>Un peu de jeu. Un peu de lien. Ça fait du bien.</p>
        <a href="/#comment-jouer">
          <CircleHelp size={15} />
          Comment ça marche ?
        </a>
        <span className="footer-note">Fait pour les petits moments.</span>
      </footer>
      {profileOpen && (
        <Modal
          title={session ? 'Bonjour, ' + session.nickname + ' !' : 'Comment vous appelle-t-on ?'}
          onClose={() => setProfileOpen(false)}
        >
          {session ? (
            <div className="stack">
              <p className="muted">
                Votre pseudo vous accompagne dans toutes vos parties. Invitez vos proches avec le
                lien de votre table.
              </p>
              <button className="button" onClick={() => setProfileOpen(false)}>
                On joue ?
              </button>
              {!room && (
                <button className="text-button" onClick={resetSession}>
                  Changer de pseudo
                </button>
              )}
            </div>
          ) : (
            <NicknameForm onDone={() => setProfileOpen(false)} />
          )}
        </Modal>
      )}
    </div>
  );
}
