import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import './HomePage.css';

const CATEGORIES = [
  { slug: 'casamento', name: 'Casamento', emoji: '💍', description: 'O dia mais especial' },
  { slug: 'esportes', name: 'Esportes', emoji: '🏃', description: 'Maratonas e corridas' },
  { slug: 'aniversario', name: 'Aniversário', emoji: '🎂', description: 'Festas inesquecíveis' },
  { slug: 'formatura', name: 'Formatura', emoji: '🎓', description: 'Conquistas marcantes' },
  { slug: 'corporativo', name: 'Corporativo', emoji: '💼', description: 'Eventos da empresa' },
  { slug: 'familia', name: 'Família', emoji: '👨‍👩‍👧', description: 'Momentos em família' }
];

const FEATURES = [
  { icon: '🎯', title: 'Encontre por evento', text: 'Busque pelo nome do evento ou data e veja todas as suas fotos.' },
  { icon: '✨', title: 'Sem marca d\'água', text: 'Após a compra, baixe sua foto em alta resolução, limpa.' },
  { icon: '⚡', title: 'Pague com Pix', text: 'Pagamento instantâneo via Pix ou cartão de crédito.' },
  { icon: '🔒', title: 'Compra segura', text: 'Transação criptografada e fotógrafos verificados.' }
];

export default function HomePage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/photographers?q=${encodeURIComponent(query.trim())}`);
    } else {
      navigate('/photographers');
    }
  };

  return (
    <div className="home-page">
      <section className="hero">
        <span className="hero-badge">✨ Mais de 50.000 fotos disponíveis</span>
        <h1>
          Encontre suas <span>fotos perfeitas</span><br />em qualquer evento
        </h1>
        <p className="hero-subtitle">
          Conectamos você aos fotógrafos profissionais dos seus eventos.
          Compre fotos em alta resolução, sem marca d'água, com pagamento via Pix.
        </p>

        <form className="hero-search" onSubmit={handleSearch}>
          <input
            type="text"
            placeholder="Buscar por evento, fotógrafo ou local..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="hero-search-btn">
            🔍 Buscar
          </button>
        </form>

        <div className="hero-stats">
          <div className="hero-stat">
            <div className="hero-stat-value">500+</div>
            <div className="hero-stat-label">Fotógrafos</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-value">50k+</div>
            <div className="hero-stat-label">Fotos vendidas</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-value">4.9★</div>
            <div className="hero-stat-label">Avaliação média</div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2>Explore por categoria</h2>
            <p className="section-subtitle">Encontre fotos do tipo de evento que você procura</p>
          </div>
          <Link to="/photographers" className="section-link">Ver tudo →</Link>
        </div>

        <div className="categories-grid">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.slug}
              to={`/photographers?category=${cat.slug}`}
              className={`category-card ${cat.slug}`}
            >
              <span className="category-emoji">{cat.emoji}</span>
              <div className="category-content">
                <h3>{cat.name}</h3>
                <p>{cat.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="features">
        {FEATURES.map((f) => (
          <div key={f.title} className="feature">
            <div className="feature-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </div>
        ))}
      </section>

      <section className="cta-banner">
        <h2>É fotógrafo profissional?</h2>
        <p>Cadastre-se grátis, faça upload das suas fotos por álbum e ganhe 93% de cada venda. A FotoExpress fica com apenas 7% de comissão.</p>
        <Link to="/register" className="cta-button">Começar a vender →</Link>
      </section>
    </div>
  );
}
