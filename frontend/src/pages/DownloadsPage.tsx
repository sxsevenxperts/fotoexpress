import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import StoryCreator from '../components/StoryCreator';
import './DownloadsPage.css';

interface PurchasedPhoto {
  photo_id: string;
  thumbnail_url: string;
  price: number;
  gallery_title: string;
  completed_at: string;
  gallery_id: string;
}

export default function DownloadsPage() {
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<PurchasedPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }

    async function loadPurchases() {
      try {
        const res = await axios.get('/api/purchases/photos', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPhotos(res.data.photos);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Erro ao carregar downloads');
      } finally {
        setLoading(false);
      }
    }

    loadPurchases();
  }, [token, navigate]);

  const handleDownload = async (photoId: string) => {
    try {
      const response = await axios.get(`/api/photos/${photoId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `foto-${photoId}.jpg`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert('Erro ao baixar foto');
    }
  };

  if (!token) return null;
  if (loading) return <div className="loading">Carregando downloads...</div>;
  if (error) return <div className="error">{error}</div>;

  if (photos.length === 0) {
    return (
      <div className="downloads-empty">
        <p>Você ainda não possui fotos para download</p>
        <button onClick={() => navigate('/')}>Ver galerias</button>
      </div>
    );
  }

  return (
    <div className="downloads-container">
      <h1>Meus Downloads</h1>

      <div className="downloads-grid">
        {photos.map(photo => (
          <div key={photo.photo_id} className="download-card">
            <img src={photo.thumbnail_url} alt="Foto comprada" />
            <div className="card-info">
              <p className="gallery-title">{photo.gallery_title}</p>
              <p className="purchased-date">
                Comprada em {new Date(photo.completed_at).toLocaleDateString('pt-BR')}
              </p>
              <p className="price">R$ {Number(photo.price).toFixed(2)}</p>
            </div>
            <div className="card-actions">
              <button
                className="btn-download"
                onClick={() => handleDownload(photo.photo_id)}
              >
                ⬇️ Baixar
              </button>
              <button
                className="btn-print"
                onClick={() => navigate(`/photos/${photo.photo_id}/print`)}
              >
                🖨️ Imprimir
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="story-section">
        <StoryCreator />
      </div>
    </div>
  );
}
