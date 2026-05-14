import { useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import axios from 'axios';

export default function PhotographerDetailPage() {
  const { id } = useParams();
  const [photographer, setPhotographer] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`/api/photographers/${id}`)
      .then(res => {
        setPhotographer(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error:', err);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <p>Carregando...</p>;
  if (!photographer) return <p>Fotógrafo não encontrado</p>;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '3rem' }}>
        <div>
          <img
            src={photographer.avatar_url || 'https://via.placeholder.com/300'}
            alt={photographer.name}
            style={{ width: '100%', borderRadius: '8px', marginBottom: '1rem' }}
          />
          <button style={{ width: '100%', padding: '1rem', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' }}>
            Agendar Sessão
          </button>
        </div>
        <div>
          <h1>{photographer.name}</h1>
          <p style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>⭐ {photographer.rating} • R$ {photographer.hourly_rate}/hora</p>
          <h3>Sobre</h3>
          <p>{photographer.bio}</p>
          <h3>Localização</h3>
          <p>{photographer.location}</p>
          <h3>Experiência</h3>
          <p>{photographer.experience_years} anos de experiência</p>
        </div>
      </div>
    </div>
  );
}
