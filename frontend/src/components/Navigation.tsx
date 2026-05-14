import { Link } from 'react-router-dom';

export default function Navigation() {
  return (
    <nav style={{ padding: '1rem', background: '#f5f5f5', borderBottom: '1px solid #ddd' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', gap: '2rem', alignItems: 'center' }}>
        <Link to="/" style={{ fontSize: '1.5rem', fontWeight: 'bold', textDecoration: 'none', color: '#333' }}>
          📸 FotoExpress
        </Link>
        <div style={{ display: 'flex', gap: '1rem', marginLeft: 'auto' }}>
          <Link to="/photographers" style={{ textDecoration: 'none', color: '#333' }}>Fotógrafos</Link>
          <Link to="/bookings" style={{ textDecoration: 'none', color: '#333' }}>Minhas Reservas</Link>
          <Link to="/profile" style={{ textDecoration: 'none', color: '#333' }}>Perfil</Link>
          <Link to="/login" style={{ textDecoration: 'none', color: '#333' }}>Login</Link>
        </div>
      </div>
    </nav>
  );
}
