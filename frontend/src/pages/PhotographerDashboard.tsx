import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import AffiliateManager from '../components/AffiliateManager';
import './PhotographerDashboard.css';

type Range = '7d' | '30d' | '90d';

interface Dashboard {
  photographer: {
    rating: number;
    totalReviews: number;
    totalPhotos: number;
    totalGalleries: number;
    lifetimeSales: number;
    lifetimeEarnings: number;
  };
  range: Range;
  summary: {
    salesCount: number;
    earnings: number;
    gross: number;
    platformFee: number;
  };
  salesByDay: Array<{ day: string; sales: number; earnings: number }>;
  topPhotos: Array<{
    id: string;
    thumbnail_url: string;
    sales: number;
    price: number;
    gallery_title: string;
  }>;
  recentGalleries: Array<{
    id: string;
    title: string;
    event_date: string;
    photo_count: number;
    is_published: boolean;
    cover_photo_url: string | null;
    total_sales: number;
    earnings: number;
    scheduled_publish_at?: string | null;
  }>;
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function PhotographerDashboard() {
  const navigate = useNavigate();
  const [range, setRange] = useState<Range>('30d');
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    async function load() {
      setLoading(true);
      try {
        const res = await axios.get(`/api/photographers/me/dashboard?range=${range}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setData(res.data);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Erro ao carregar dashboard');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [range, navigate]);

  if (loading) return <div className="loading">Carregando dashboard...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!data) return null;

  const maxEarnings = Math.max(...data.salesByDay.map((d) => d.earnings), 1);

  const galleryStatus = (g: Dashboard['recentGalleries'][0]) => {
    if (g.scheduled_publish_at && new Date(g.scheduled_publish_at) > new Date()) return 'scheduled';
    return g.is_published ? 'published' : 'draft';
  };

  const statusLabel = { published: 'Publicado', draft: 'Rascunho', scheduled: 'Agendado' };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p>Resumo das suas vendas e galerias</p>
        </div>
        <div className="range-tabs">
          {(['7d', '30d', '90d'] as Range[]).map((r) => (
            <button
              key={r}
              className={`range-tab ${range === r ? 'active' : ''}`}
              onClick={() => setRange(r)}
            >
              {r === '7d' ? '7 dias' : r === '30d' ? '30 dias' : '90 dias'}
            </button>
          ))}
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card featured">
          <div className="stat-label">💰 Ganhos no período</div>
          <div className="stat-value">{fmtBRL(data.summary.earnings)}</div>
          <div className="stat-meta">
            Bruto: {fmtBRL(data.summary.gross)} · Plataforma: {fmtBRL(data.summary.platformFee)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">🛒 Vendas</div>
          <div className="stat-value">{data.summary.salesCount}</div>
          <div className="stat-meta">no período selecionado</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">⭐ Avaliação</div>
          <div className="stat-value">{data.photographer.rating.toFixed(1)}</div>
          <div className="stat-meta">{data.photographer.totalReviews} avaliações</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">📸 Galerias</div>
          <div className="stat-value">{data.photographer.totalGalleries}</div>
          <div className="stat-meta">{data.photographer.totalPhotos} fotos no total</div>
        </div>
      </div>

      <div className="dashboard-section">
        <div className="section-title">
          <h2>Receita diária</h2>
          <div className="dashboard-cta">
            <button className="btn-secondary" onClick={() => navigate('/galleries/new')}>
              + Nova galeria
            </button>
          </div>
        </div>
        {data.salesByDay.length === 0 ? (
          <div className="chart-empty">📊 Sem vendas no período</div>
        ) : (
          <div className="chart-container">
            {data.salesByDay.map((d) => {
              const height = Math.max((d.earnings / maxEarnings) * 100, 2);
              const dateLabel = new Date(d.day).toLocaleDateString('pt-BR', {
                day: '2-digit', month: '2-digit'
              });
              return (
                <div
                  key={d.day}
                  className="chart-bar"
                  style={{ height: `${height}%` }}
                  data-tooltip={`${dateLabel}: ${fmtBRL(d.earnings)} (${d.sales} venda${d.sales !== 1 ? 's' : ''})`}
                />
              );
            })}
          </div>
        )}
      </div>

      {data.topPhotos.length > 0 && (
        <div className="dashboard-section">
          <div className="section-title">
            <h2>🏆 Fotos mais vendidas</h2>
          </div>
          <div className="top-photos-grid">
            {data.topPhotos.map((p, idx) => (
              <div key={p.id} className="top-photo">
                <span className="top-photo-badge">#{idx + 1} · {p.sales} venda{p.sales !== 1 ? 's' : ''}</span>
                <img src={`/api/photos/${p.id}/preview`} alt={p.gallery_title} />
                <div className="top-photo-overlay">
                  <h5>{p.gallery_title}</h5>
                  <p>{fmtBRL(Number(p.price))}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="dashboard-section">
        <div className="section-title">
          <h2>Suas galerias</h2>
          <button className="btn-primary" onClick={() => navigate('/galleries/new')}>
            + Nova galeria
          </button>
        </div>
        {data.recentGalleries.length === 0 ? (
          <div className="chart-empty">📁 Você ainda não criou galerias</div>
        ) : (
          <div className="galleries-list">
            {data.recentGalleries.map((g) => {
              const status = galleryStatus(g);
              return (
                <div
                  key={g.id}
                  className="gallery-row"
                  onClick={() => navigate(`/galleries/${g.id}/manage`)}
                  style={{ cursor: 'pointer' }}
                >
                  {g.cover_photo_url ? (
                    <img className="gallery-cover" src={g.cover_photo_url} alt={g.title} />
                  ) : (
                    <div className="gallery-cover-placeholder">📷</div>
                  )}
                  <div className="gallery-info">
                    <h4>{g.title}</h4>
                    <p>{new Date(g.event_date).toLocaleDateString('pt-BR')} · {g.photo_count} fotos</p>
                  </div>
                  <div className="gallery-stat">
                    <strong>{g.total_sales}</strong>
                    <span>vendas</span>
                  </div>
                  <div className="gallery-stat">
                    <strong>{fmtBRL(g.earnings)}</strong>
                    <span>ganhos</span>
                  </div>
                  <span className={`gallery-status ${status}`}>
                    {statusLabel[status]}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AffiliateManager />
    </div>
  );
}
