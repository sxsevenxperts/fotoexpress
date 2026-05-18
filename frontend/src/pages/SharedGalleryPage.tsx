import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCart } from '../context/CartContext';
import Toast from '../components/Toast';
import './SharedGalleryPage.css';

interface Photo {
  id: string;
  thumbnail_url: string;
  price: number;
  width: number;
  height: number;
  uploaded_at: string;
}

interface Gallery {
  id: string;
  title: string;
  description: string;
  photographerName: string;
  is_live?: boolean;
  share_token?: string;
}

interface BundlePreview {
  photoCount: number;
  originalTotal: number;
  discountRate: number;
  discountAmount: number;
  finalPrice: number;
}

export default function SharedGalleryPage() {
  const { shareToken } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();

  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const [bibQuery, setBibQuery] = useState('');
  const [filteredPhotos, setFilteredPhotos] = useState<Photo[] | null>(null);
  const [bundle, setBundle] = useState<BundlePreview | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [newPhotoCount, setNewPhotoCount] = useState(0);

  const lastPollRef = useRef<string>(new Date().toISOString());
  const [wishlistMap, setWishlistMap] = useState<Record<string, boolean>>({});
  const [presale, setPresale] = useState<{
    isActive: boolean;
    isUpcoming: boolean;
    discountRate: number;
    timeLeftSeconds: number | null;
    startsAt: string | null;
    endsAt: string | null;
  } | null>(null);
  const [presaleNow, setPresaleNow] = useState(Date.now());

  useEffect(() => {
    async function loadGallery() {
      try {
        const res = await axios.get(`/api/galleries/share/${shareToken}`);
        setGallery(res.data.gallery);
        const photosWithNumbers = res.data.photos.map((p: any) => ({
          ...p,
          price: typeof p.price === 'string' ? parseFloat(p.price) : p.price
        }));
        setPhotos(photosWithNumbers);
        setIsLive(res.data.gallery.is_live === true);

        if (res.data.gallery?.id) {
          axios.get(`/api/purchases/bundles/galleries/${res.data.gallery.id}/preview`)
            .then((b) => setBundle(b.data))
            .catch(() => {});
          axios.get(`/api/presale/galleries/${res.data.gallery.id}/status`)
            .then((p) => setPresale(p.data.presale))
            .catch(() => {});
        }
      } catch (err) {
        setError('Álbum não encontrado ou expirado');
      } finally {
        setLoading(false);
      }
    }
    loadGallery();
  }, [shareToken]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || photos.length === 0) return;
    const ids = photos.map((p) => p.id).join(',');
    axios.get(`/api/wishlist/check?ids=${ids}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then((res) => setWishlistMap(res.data)).catch(() => {});
  }, [photos]);

  const toggleWishlist = async (photoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }
    const isLiked = wishlistMap[photoId];
    setWishlistMap((m) => ({ ...m, [photoId]: !isLiked }));
    try {
      if (isLiked) {
        await axios.delete(`/api/wishlist/${photoId}`, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.post(`/api/wishlist/${photoId}`, {}, { headers: { Authorization: `Bearer ${token}` } });
      }
    } catch {
      setWishlistMap((m) => ({ ...m, [photoId]: isLiked }));
    }
  };

  useEffect(() => {
    if (!presale?.isActive) return;
    const id = setInterval(() => setPresaleNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [presale?.isActive]);

  useEffect(() => {
    if (!isLive || !shareToken) return;
    const id = setInterval(async () => {
      try {
        const res = await axios.get(`/api/galleries/share/${shareToken}/since`, {
          params: { after: lastPollRef.current }
        });
        if (res.data.newPhotos?.length > 0) {
          const fresh = res.data.newPhotos.map((p: any) => ({
            ...p,
            price: typeof p.price === 'string' ? parseFloat(p.price) : p.price
          }));
          setPhotos((prev) => [...fresh, ...prev]);
          setNewPhotoCount((n) => n + fresh.length);
        }
        lastPollRef.current = res.data.serverTime;
      } catch {}
    }, 15_000);
    return () => clearInterval(id);
  }, [isLive, shareToken]);

  const handleBibSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gallery || !bibQuery.trim()) {
      setFilteredPhotos(null);
      return;
    }
    try {
      const res = await axios.get('/api/photos/search/bib', {
        params: { gallery_id: gallery.id, number: bibQuery }
      });
      const found: Photo[] = res.data.photos.map((p: any) => ({
        ...p,
        price: typeof p.price === 'string' ? parseFloat(p.price) : p.price
      }));
      setFilteredPhotos(found);
      setToast({
        message: found.length > 0
          ? `${found.length} foto(s) com o número ${bibQuery}`
          : `Nenhuma foto encontrada para o número ${bibQuery}`,
        type: found.length > 0 ? 'success' : 'info'
      });
    } catch {
      setToast({ message: 'Erro na busca por número', type: 'error' });
    }
  };

  const clearFilter = () => {
    setBibQuery('');
    setFilteredPhotos(null);
  };

  const togglePhoto = (photoId: string) => {
    const next = new Set(selectedPhotos);
    next.has(photoId) ? next.delete(photoId) : next.add(photoId);
    setSelectedPhotos(next);
  };

  const handleAddToCart = () => {
    selectedPhotos.forEach((photoId) => {
      const photo = photos.find((p) => p.id === photoId);
      if (photo && gallery) {
        addItem({
          photoId: photo.id,
          thumbnailUrl: `/api/photos/${photo.id}/preview`,
          price: photo.price,
          galleryId: gallery.id
        });
      }
    });
    navigate('/cart');
  };

  const handleBuyAll = () => {
    photos.forEach((photo) => {
      if (gallery) {
        addItem({
          photoId: photo.id,
          thumbnailUrl: `/api/photos/${photo.id}/preview`,
          price: photo.price,
          galleryId: gallery.id
        });
      }
    });
    setToast({ message: 'Álbum completo adicionado ao carrinho!', type: 'success' });
    setTimeout(() => navigate('/cart'), 600);
  };

  const handleShare = async () => {
    const url = window.location.href;
    const text = gallery ? `Olha o álbum "${gallery.title}" no FotoExpress!` : 'Álbum no FotoExpress';
    if (navigator.share) {
      try {
        await navigator.share({ title: gallery?.title || 'FotoExpress', text, url });
      } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      setToast({ message: 'Link copiado para a área de transferência!', type: 'success' });
    }
  };

  if (loading) return <div className="loading">Carregando álbum...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!gallery) return <div className="error">Álbum não encontrado</div>;

  const displayPhotos = filteredPhotos ?? photos;
  const selectedCount = selectedPhotos.size;
  const selectedPrice = Array.from(selectedPhotos).reduce((sum, id) => {
    const p = photos.find((x) => x.id === id);
    return sum + (p?.price || 0);
  }, 0);

  return (
    <div className="shared-gallery-container">
      <div className="gallery-header">
        {isLive && (
          <div className="live-badge">
            <span className="live-dot" /> AO VIVO
            {newPhotoCount > 0 && <span className="live-new">+{newPhotoCount} novas</span>}
          </div>
        )}
        <h1>{gallery.title}</h1>
        <p className="photographer-name">por {gallery.photographerName}</p>
        {gallery.description && <p className="description">{gallery.description}</p>}

        <div className="gallery-actions">
          <button
            className="action-pill primary"
            onClick={() => navigate(`/scan/${gallery.id}`)}
          >
            ✨ Encontrar com selfie
          </button>
          <button className="action-pill" onClick={handleShare}>
            🔗 Compartilhar
          </button>
        </div>

        <form className="bib-search" onSubmit={handleBibSearch}>
          <input
            type="text"
            placeholder="Digite o número do peito (BIB)..."
            value={bibQuery}
            onChange={(e) => setBibQuery(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
          />
          <button type="submit" className="bib-search-btn">🔍</button>
          {filteredPhotos && (
            <button type="button" className="bib-clear" onClick={clearFilter}>
              ✕ Limpar
            </button>
          )}
        </form>
      </div>

      {presale?.isActive && presale.endsAt && (() => {
        const remaining = Math.max(0, Math.floor((new Date(presale.endsAt).getTime() - presaleNow) / 1000));
        const hours = Math.floor(remaining / 3600);
        const mins = Math.floor((remaining % 3600) / 60);
        const secs = remaining % 60;
        return (
          <div className="presale-banner">
            <div>
              <h3>🔥 Pré-venda ativa — {Math.round(presale.discountRate * 100)}% OFF em todas as fotos</h3>
              <p>
                Compre agora e economize. Termina em{' '}
                <strong>{hours}h {String(mins).padStart(2, '0')}m {String(secs).padStart(2, '0')}s</strong>
              </p>
            </div>
            <span className="presale-discount-pill">-{Math.round(presale.discountRate * 100)}%</span>
          </div>
        );
      })()}

      {presale?.isUpcoming && presale.startsAt && (
        <div className="presale-banner upcoming">
          <div>
            <h3>⏰ Pré-venda em breve — {Math.round(presale.discountRate * 100)}% OFF</h3>
            <p>Comece a partir de {new Date(presale.startsAt).toLocaleString('pt-BR')}</p>
          </div>
        </div>
      )}

      {bundle && bundle.photoCount >= 5 && !filteredPhotos && (
        <div className="bundle-banner">
          <div className="bundle-info">
            <h3>💎 Leve o álbum completo</h3>
            <p>
              {bundle.photoCount} fotos por{' '}
              <strong>R$ {bundle.finalPrice.toFixed(2)}</strong>{' '}
              <s>R$ {bundle.originalTotal.toFixed(2)}</s>
            </p>
            <span className="bundle-save">
              Economize R$ {bundle.discountAmount.toFixed(2)} ({Math.round(bundle.discountRate * 100)}% OFF)
            </span>
          </div>
          <button className="bundle-cta" onClick={handleBuyAll}>
            Comprar tudo →
          </button>
        </div>
      )}

      <div className="photos-grid">
        {displayPhotos.map((photo) => (
          <div
            key={photo.id}
            className={`photo-card ${selectedPhotos.has(photo.id) ? 'selected' : ''}`}
            onClick={() => togglePhoto(photo.id)}
          >
            <img src={`/api/photos/${photo.id}/preview`} alt="Foto com marca d'água" />
            <button
              className={`photo-heart ${wishlistMap[photo.id] ? 'active' : ''}`}
              onClick={(e) => toggleWishlist(photo.id, e)}
              aria-label="Favoritar"
            >
              {wishlistMap[photo.id] ? '❤️' : '🤍'}
            </button>
            <div className="photo-overlay">
              <div className="checkbox">
                {selectedPhotos.has(photo.id) && '✓'}
              </div>
              <p className="price">R$ {photo.price.toFixed(2)}</p>
            </div>
          </div>
        ))}
      </div>

      {selectedCount > 0 && (
        <div className="selection-summary">
          <div className="summary-content">
            <span>{selectedCount} foto(s) selecionada(s)</span>
            <span className="total-price">Total: R$ {selectedPrice.toFixed(2)}</span>
          </div>
          <button className="btn-add-cart" onClick={handleAddToCart}>
            Adicionar ao carrinho
          </button>
        </div>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
