import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowDown,
  ArrowRight,
  Heart,
  Leaf,
  MousePointer2,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { SortingIllustration } from '../components/ObjectArt';
export function Home() {
  const location = useLocation();
  useEffect(() => {
    if (location.hash === '#comment-jouer')
      document.getElementById('comment-jouer')?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      });
  }, [location.hash]);
  return (
    <main className="home-page">
      <section className="hero">
        <div className="hero-copy">
          <div className="pill">
            <span className="presence-dot online" />
            LE BONHEUR SE JOUE À PLUSIEURS
          </div>
          <h1>
            Des petits jeux.
            <br />
            De grands moments
            <br />
            <em>ensemble.</em>
            <span className="hero-spark">✳</span>
          </h1>
          <p>
            Posez le quotidien. Retrouvez vos proches.
            <br />
            Des jeux tout simples pour passer du bon temps,
            <br className="desktop-only" /> à deux, à quatre, ou un peu plus.
          </p>
          <a className="button" href="#collection">
            Trouver notre prochain jeu <ArrowDown size={17} />
          </a>
          <div className="hero-footnote">
            <span className="tiny-avatars">
              <i>C</i>
              <i>M</i>
              <i>A</i>
            </span>
            <span>Sans compte. Sans pression. Juste ensemble.</span>
          </div>
        </div>
        <SortingIllustration />
      </section>
      <div className="benefit-strip">
        <span>
          <UsersRound size={19} />
          Ensemble, même à distance
        </span>
        <span>
          <Leaf size={19} />
          Zéro pression, 100 % plaisir
        </span>
        <span>
          <MousePointer2 size={18} />
          Un lien suffit pour jouer
        </span>
      </div>
      <section id="collection" className="collection">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LA COLLECTION</p>
            <h2>On joue à quoi ?</h2>
          </div>
          <p>Choisissez votre petite parenthèse.</p>
        </div>
        <div className="game-grid">
          <article className="game-card featured">
            <Link to="/games/sorting" className="game-art-link" aria-label="Découvrir À sa place">
              <span className="card-badge">
                <span className="presence-dot online" />
                C’EST PARTI !
              </span>
              <SortingIllustration mini />
              <span className="art-caption">Chaque couleur trouve sa place.</span>
            </Link>
            <div className="game-card-body">
              <div className="game-title-row">
                <h3>À sa place</h3>
                <span className="genre">RANGEMENT</span>
              </div>
              <p>
                Un joyeux petit bazar à ranger. Accordez les couleurs,
                <br className="desktop-only" /> partagez les gestes et savourez le résultat.
              </p>
              <div className="game-card-bottom">
                <div className="game-tags">
                  <span>
                    <UsersRound size={15} />
                    2–8 joueurs
                  </span>
                  <span>
                    <Heart size={15} />
                    Coopératif
                  </span>
                </div>
                <Link className="button compact" to="/games/sorting">
                  Jouer <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </article>
          <article className="game-card coming-card">
            <div className="coming-art">
              <span className="card-badge muted-badge">ÇA MIJOTE…</span>
              <div className="plant-art">
                <span className="plant-leaf leaf-a" />
                <span className="plant-leaf leaf-b" />
                <span className="plant-leaf leaf-c" />
                <span className="plant-stem" />
                <span className="plant-pot" />
                <span className="plant-spark">✧</span>
              </div>
              <span className="art-caption">Les bonnes idées prennent racine.</span>
            </div>
            <div className="game-card-body">
              <div className="game-title-row">
                <h3>La suite pousse…</h3>
                <Sparkles size={19} />
              </div>
              <p>
                De nouvelles façons de s’amuser ensemble
                <br className="desktop-only" /> arrivent doucement, mais sûrement.
              </p>
              <div className="game-card-bottom">
                <span className="coming-label">Un peu de patience, beaucoup de surprises.</span>
                <span className="soon-chip">Bientôt</span>
              </div>
            </div>
          </article>
        </div>
      </section>
      <section id="comment-jouer" className="how-section">
        <div className="how-intro">
          <span className="hand-star">✳</span>
          <p className="eyebrow">LES CHOSES SIMPLES</p>
          <h2>
            Moins de préparation.
            <br />
            <em>Plus de bons moments.</em>
          </h2>
        </div>
        <div className="how-steps">
          <div>
            <span>01</span>
            <h3>Un petit nom</h3>
            <p>
              Choisissez un pseudo.
              <br />
              Vous êtes déjà presque prêts.
            </p>
          </div>
          <div>
            <span>02</span>
            <h3>Une table à partager</h3>
            <p>
              Créez votre partie et envoyez
              <br />
              le lien à vos personnes préférées.
            </p>
          </div>
          <div>
            <span>03</span>
            <h3>Et on joue !</h3>
            <p>
              Chacun chez soi, tous ensemble.
              <br />
              Le reste peut bien attendre.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
