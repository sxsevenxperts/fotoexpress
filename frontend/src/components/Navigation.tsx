import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import './Navigation.css';

export default function Navigation() {
  const { items } = useCart();
  const { pathname } = useLocation();
  const itemCount = items.length;

  const isActive = (path: string) =>
    path === '/' ? pathname === '/' : pathname.startsWith(path);

  return (
    <>
      <header className="nav-header">
        <div className="nav-inner">
          <Link to="/" className="nav-brand">
            <span className="nav-brand-logo">📸</span>
            FotoExpress
          </Link>

          <nav className="nav-links">
            <Link to="/photographers" className={`nav-link ${isActive('/photographers') ? 'active' : ''}`}>
              Fotógrafos
            </Link>
            <Link to="/downloads" className={`nav-link ${isActive('/downloads') ? 'active' : ''}`}>
              Downloads
            </Link>
            <Link to="/wishlist" className={`nav-link ${isActive('/wishlist') ? 'active' : ''}`}>
              ❤️ Favoritos
            </Link>
            <Link to="/dashboard" className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}>
              Dashboard
            </Link>
            <Link to="/messages" className={`nav-link ${isActive('/messages') ? 'active' : ''}`}>
              💬 Mensagens
            </Link>
            <Link to="/profile" className={`nav-link ${isActive('/profile') ? 'active' : ''}`}>
              Perfil
            </Link>
            <Link to="/cart" className="nav-cart">
              🛒 Carrinho
              {itemCount > 0 && <span className="nav-cart-badge">{itemCount}</span>}
            </Link>
            <Link to="/login" className="nav-cta">Entrar</Link>
          </nav>

          <Link to="/cart" className="nav-mobile-toggle" aria-label="Carrinho">
            <span style={{ fontSize: '1.25rem', position: 'relative' }}>
              🛒
              {itemCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-6px',
                  right: '-8px',
                  background: 'var(--color-danger)',
                  color: 'white',
                  borderRadius: 'var(--radius-full)',
                  minWidth: '18px',
                  height: '18px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '0 4px'
                }}>{itemCount}</span>
              )}
            </span>
          </Link>
        </div>
      </header>

      <nav className="nav-bottom" aria-label="Navegação principal">
        <Link to="/" className={`nav-bottom-item ${isActive('/') ? 'active' : ''}`}>
          <span className="nav-bottom-icon">🏠</span>
          Início
        </Link>
        <Link to="/photographers" className={`nav-bottom-item ${isActive('/photographers') ? 'active' : ''}`}>
          <span className="nav-bottom-icon">🔍</span>
          Buscar
        </Link>
        <Link to="/cart" className={`nav-bottom-item ${isActive('/cart') ? 'active' : ''}`}>
          <span className="nav-bottom-icon">🛒</span>
          Carrinho
          {itemCount > 0 && <span className="nav-bottom-badge">{itemCount}</span>}
        </Link>
        <Link to="/wishlist" className={`nav-bottom-item ${isActive('/wishlist') ? 'active' : ''}`}>
          <span className="nav-bottom-icon">❤️</span>
          Favoritos
        </Link>
        <Link to="/messages" className={`nav-bottom-item ${isActive('/messages') ? 'active' : ''}`}>
          <span className="nav-bottom-icon">💬</span>
          Mensagens
        </Link>
        <Link to="/profile" className={`nav-bottom-item ${isActive('/profile') ? 'active' : ''}`}>
          <span className="nav-bottom-icon">👤</span>
          Perfil
        </Link>
      </nav>
    </>
  );
}
