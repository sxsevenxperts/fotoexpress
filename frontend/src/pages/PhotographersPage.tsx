import { useState, useEffect } from 'react';
import axios from 'axios';

interface Photographer {
  id: number;
  name: string;
  email: string;
  rating: number;
  hourly_rate: number;
  bio: string;
  avatar_url: string;
}

export default function PhotographersPage() {
  const [photographers, setPhotographers] = useState<Photographer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/photographers')
      .then(res => {
        setPhotographers(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching photographers:', err);
        setLoading(false);
      });
  }, []);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <h1>Nossos Fotógrafos</h1>

      {loading ? (
        <p>Carregando...</p>
      ) : photographers.length === 0 ? (
        <p>Nenhum fotógrafo disponível no momento</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '2rem' }}>
          {photographers.map(photographer => (
            <div key={photographer.id} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1rem' }}>
              <img
                src={photographer.avatar_url || 'https://via.placeholder.com/250'}
                alt={photographer.name}
                style={{ width: '100%', height: '200px', objectFit: 'cover', borderRadius: '8px', marginBottom: '1rem' }}
              />
              <h3>{photographer.name}</h3>
              <p style={{ color: '#666' }}>⭐ {photographer.rating} • R$ {photographer.hourly_rate}/hora</p>
              <p style={{ fontSize: '0.9rem', color: '#888' }}>{photographer.bio}</p>
              <button style={{ width: '100%', padding: '0.5rem', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                Ver Perfil
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
