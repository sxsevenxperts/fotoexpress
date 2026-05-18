import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCart } from '../context/CartContext';
import './SelfieScanPage.css';

interface MatchedPhoto {
  id: string;
  thumbnail_url: string;
  price: number;
  similarity: number;
}

export default function SelfieScanPage() {
  const { galleryId } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<MatchedPhoto[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Selecione uma imagem (JPG ou PNG).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setSelfieDataUrl(reader.result as string);
    reader.readAsDataURL(file);
    setError('');
  };

  const handleScan = async () => {
    if (!selfieDataUrl || !galleryId) return;
    setScanning(true);
    setError('');
    try {
      const res = await axios.post(`/api/faces/scan/${galleryId}`, {
        selfie: selfieDataUrl
      });
      const photos: MatchedPhoto[] = res.data.photos.map((p: any) => ({
        ...p,
        price: typeof p.price === 'string' ? parseFloat(p.price) : p.price
      }));
      setResults(photos);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao escanear');
    } finally {
      setScanning(false);
    }
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const handleAddSelected = () => {
    if (!results) return;
    selected.forEach((id) => {
      const photo = results.find((p) => p.id === id);
      if (photo && galleryId) {
        addItem({
          photoId: photo.id,
          thumbnailUrl: `/api/photos/${photo.id}/preview`,
          price: photo.price,
          galleryId
        });
      }
    });
    navigate('/cart');
  };

  if (scanning) {
    return (
      <div className="scan-container">
        <div className="scan-card">
          <div className="scan-loading">
            <div className="scan-spinner" />
            <h3>Buscando você nas fotos...</h3>
            <p>Estamos comparando seu rosto com todas as fotos da galeria.</p>
          </div>
        </div>
      </div>
    );
  }

  if (results) {
    return (
      <div className="scan-container">
        <div className="scan-results-header">
          <span className="scan-stat-pill">
            ✨ {results.length} foto{results.length !== 1 ? 's' : ''} com você
          </span>
          <h2 style={{ marginTop: 16 }}>Resultados do reconhecimento</h2>
          <p>Selecione as fotos que deseja comprar</p>
        </div>

        {results.length === 0 ? (
          <div className="scan-no-matches">
            <h3>Não encontramos você nessa galeria</h3>
            <p>Tente uma selfie mais nítida ou veja todas as fotos do álbum.</p>
            <button className="scan-btn primary" onClick={() => navigate(-1)}>
              ← Voltar para o álbum
            </button>
          </div>
        ) : (
          <>
            <div className="scan-results-grid">
              {results.map((photo) => (
                <div
                  key={photo.id}
                  className={`scan-result-card ${selected.has(photo.id) ? 'selected' : ''}`}
                  onClick={() => toggle(photo.id)}
                >
                  <span className="scan-result-match">
                    {Math.round(photo.similarity * 100)}% match
                  </span>
                  <img src={`/api/photos/${photo.id}/preview`} alt="Foto" />
                  <div className="scan-result-overlay">
                    <span className="scan-result-price">R$ {photo.price.toFixed(2)}</span>
                    <span className="scan-result-check">
                      {selected.has(photo.id) ? '✓' : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {selected.size > 0 && (
              <div className="selection-summary">
                <div className="summary-content">
                  <span>{selected.size} foto(s)</span>
                  <span className="total-price">
                    R$ {Array.from(selected).reduce((sum, id) => {
                      const p = results.find((r) => r.id === id);
                      return sum + (p?.price || 0);
                    }, 0).toFixed(2)}
                  </span>
                </div>
                <button className="btn-add-cart" onClick={handleAddSelected}>
                  Adicionar ao carrinho
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="scan-container">
      <div className="scan-hero">
        <h1>✨ Encontre você nas fotos</h1>
        <p>
          Faça uma selfie e nossa IA encontra automaticamente todas as fotos
          do evento em que você aparece.
        </p>
      </div>

      <div className="scan-card">
        <div className={`scan-preview ${selfieDataUrl ? 'has-image' : ''}`}>
          {selfieDataUrl ? (
            <img src={selfieDataUrl} alt="Selfie" />
          ) : (
            <>
              <span className="scan-preview-placeholder">😊</span>
              <span className="scan-preview-hint">Sua selfie aqui</span>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="user"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        <div className="scan-tips">
          <h4>💡 Dicas para melhor resultado:</h4>
          <ul>
            <li>Use uma foto de frente, com boa iluminação</li>
            <li>Apenas você no enquadramento</li>
            <li>Sem óculos escuros ou máscara</li>
          </ul>
        </div>

        {error && <div className="error-message" style={{ marginBottom: 16 }}>{error}</div>}

        <div className="scan-actions">
          <button
            className="scan-btn primary"
            onClick={() => fileInputRef.current?.click()}
          >
            📷 {selfieDataUrl ? 'Trocar selfie' : 'Tirar selfie'}
          </button>

          {selfieDataUrl && (
            <button className="scan-btn primary" onClick={handleScan}>
              🔍 Buscar minhas fotos
            </button>
          )}

          <button className="scan-btn secondary" onClick={() => navigate(-1)}>
            Voltar ao álbum
          </button>
        </div>
      </div>
    </div>
  );
}
