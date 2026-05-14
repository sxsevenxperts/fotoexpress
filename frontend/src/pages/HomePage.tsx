import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <section style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>Encontre o Fotógrafo Perfeito</h1>
        <p style={{ fontSize: '1.2rem', color: '#666', marginBottom: '2rem' }}>
          Conectamos clientes com fotógrafos profissionais para eventos e esportes
        </p>
        <Link to="/photographers" style={{
          display: 'inline-block',
          padding: '1rem 2rem',
          background: '#007bff',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '5px',
          fontSize: '1.1rem'
        }}>
          Buscar Fotógrafos
        </Link>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem', marginBottom: '3rem' }}>
        {['Eventos', 'Esportes', 'Casamentos'].map((category) => (
          <div key={category} style={{ padding: '2rem', background: '#f9f9f9', borderRadius: '8px', textAlign: 'center' }}>
            <h3>{category}</h3>
            <p>Encontre especialistas em {category.toLowerCase()}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
