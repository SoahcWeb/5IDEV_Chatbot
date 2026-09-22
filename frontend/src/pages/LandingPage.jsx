import { Link } from 'react-router-dom'

export default function LandingPage() {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="logo">💬 Chatbot 5IDEV</div>
        <div className="actions">
          <Link to="/login" className="btn btn-ghost">Connexion</Link>
          <Link to="/register" className="btn">S'inscrire</Link>
        </div>
      </nav>

      <section className="hero">
        <div>
          <h1>Discutez en temps réel, simplement.</h1>
          <p>
            Messagerie instantanée, conversations privées et de groupe,
            notifications en direct.
          </p>
          <div className="cta">
            <Link to="/register" className="btn">Commencer gratuitement</Link>
            <Link to="/login" className="btn btn-ghost">J'ai déjà un compte</Link>
          </div>
        </div>
      </section>

      <section className="pricing">
        <h2>Tarifs</h2>
        <div className="pricing-grid">
          <div className="plan">
            <h3>Gratuit</h3>
            <div className="price">0€ <span>/ mois</span></div>
            <ul>
              <li>Conversations privées</li>
              <li>Messagerie temps réel</li>
              <li>Jusqu'à 3 groupes</li>
            </ul>
            <Link to="/register" className="btn btn-ghost">Commencer</Link>
          </div>
          <div className="plan featured">
            <h3>Pro</h3>
            <div className="price">9€ <span>/ mois</span></div>
            <ul>
              <li>Tout le plan Gratuit</li>
              <li>Groupes illimités</li>
              <li>Notifications avancées</li>
            </ul>
            <Link to="/register" className="btn">Choisir Pro</Link>
          </div>
          <div className="plan">
            <h3>Équipe</h3>
            <div className="price">29€ <span>/ mois</span></div>
            <ul>
              <li>Tout le plan Pro</li>
              <li>Rôles admin/membre</li>
              <li>Statistiques d'équipe</li>
            </ul>
            <Link to="/register" className="btn btn-ghost">Nous contacter</Link>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        © {new Date().getFullYear()} Chatbot 5IDEV
      </footer>
    </div>
  )
}