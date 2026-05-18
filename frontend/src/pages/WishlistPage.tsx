import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCart } from '../context/CartContext';
import './DownloadsPage.css';

interface WishItem {
  photo_id: string;
  thumbnail_url: string;
  price: number;
  gallery_id: string;
  gallery_title: string;
  share_token: string;
  added_at: string;
}

export default function WishlistPage() {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const [items, setItems] = useState<WishItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }
    async function load() {
      try {
        const res = await axios.get('/api/wishlist', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setItems(res.data.items.map((it: any) => ({
          ...it,
          price: typeof it.price === 'string' ? parseFloat(it.price) : it.price
        })));
      } catch (err: any) {
        setError(err.response?.data?.error || 'Erro ao carregar favoritos');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [navigate]);

  const handleRemove = async (photoId: string) => {
    const token = localStorage.getItem('token');
    await axios.delete(`/api/wishlist/${photoId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setItems((arr) => arr.filter((it) => it.photo_id !== photoId));
  };

  const handleAddToCart = (item: WishItem) => {
    addItem({
      photoId: item.photo_id,
      thumbnailUrl: `/api/photos/${item.photo_id}/preview`,
      price: item.price,
      galleryId: item.gallery_id
    });
    navigate('/cart');
  };

  if (loading) return <div className="loading">Carregando favoritos...</div>;
  if (error) return <div className="error">{error}</div>;

  if (items.length === 0) {
    return (
      <div className="downloads-empty">
        <p>Você ainda não favoritou nenhuma foto</p>
        <button onClick={() => navigate('/')}>Explorar galerias</button>
      </div>
    );
  }

  return (
    <div className="downloads-container">
      <h1>❤️ Meus Favoritos</h1>
      <p className="downloads-subtitle">{items.length} foto{items.length !== 1 ? 's' : ''} salva{items.length !== 1 ? 's' : ''}</p>

      <div className="downloads-grid">
        {items.map((item) => (
          <div key={item.photo_id} className="download-card">
            <img src={`/api/photos/${item.photo_id}/preview`} alt={item.gallery_title} />
            <div className="card-info">
              <p className="gallery-title">{item.gallery_title}</p>
              <p className="purchased-date" style={{ ...({} as any) }}>
                Salvo em {new Date(item.added_at).toLocaleDateString('pt-BR')}
              </p>
              <p className="price">R$ {item.price.toFixed(2)}</p>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '0 16px 16px' }}>
              <button
                className="btn-download"
                style={{ flex: 1, margin: 0, background: 'var(--color-primary)' }}
                onClick={() => handleAddToCart(item)}
              >
                🛒 Comprar
              </button>
              <button
                className="btn-download"
                style={{ margin: 0, background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
                onClick={() => handleRemove(item.photo_id)}
                title="Remover"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
