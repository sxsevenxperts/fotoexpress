import { useEffect, useState } from 'react';
import axios from 'axios';
import './Reviews.css';

interface Review {
  id: string;
  rating: number;
  comment: string;
  created_at: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  category_name?: string;
}

interface Stats {
  total: number;
  average_rating: number;
  breakdown: {
    five_star: number;
    four_star: number;
    three_star: number;
    two_star: number;
    one_star: number;
  };
}

interface Props {
  photographerId: string;
  bookingId?: string;
  canReview?: boolean;
}

const renderStars = (rating: number) => {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - (half ? 1 : 0));
};

export default function Reviews({ photographerId, bookingId, canReview = false }: Props) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const res = await axios.get(`/api/reviews/photographer/${photographerId}`);
      setReviews(res.data.reviews);
      setStats(res.data.stats);
    } catch (err) {
      console.error('Failed to load reviews', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [photographerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating || !comment.trim() || !bookingId) return;
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        '/api/reviews',
        {
          photographer_id: photographerId,
          booking_id: bookingId,
          rating,
          comment: comment.trim()
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setShowForm(false);
      setComment('');
      setRating(0);
      load();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao enviar avaliação');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="loading">Carregando avaliações...</div>;
  if (!stats) return null;

  const total = stats.total || 1;
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;

  return (
    <div className="reviews-section">
      <div className="reviews-header">
        <div className="reviews-score">
          <div className="reviews-score-value">{stats.average_rating.toFixed(1)}</div>
          <div className="reviews-stars">{renderStars(stats.average_rating)}</div>
          <div className="reviews-count">{stats.total} avaliações</div>
        </div>
        <div className="reviews-breakdown">
          {[5, 4, 3, 2, 1].map((star) => {
            const key = ['', 'one_star', 'two_star', 'three_star', 'four_star', 'five_star'][star] as keyof Stats['breakdown'];
            const count = stats.breakdown[key];
            return (
              <div className="breakdown-row" key={star}>
                <span>{star} ★</span>
                <div className="breakdown-bar">
                  <div className="breakdown-fill" style={{ width: pct(count) }} />
                </div>
                <span style={{ textAlign: 'right' }}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {canReview && bookingId && !showForm && (
        <button className="review-submit" onClick={() => setShowForm(true)} style={{ marginBottom: 24 }}>
          ✍️ Avaliar fotógrafo
        </button>
      )}

      {showForm && (
        <form className="review-form" onSubmit={handleSubmit}>
          <h4>Como foi sua experiência?</h4>
          <div className="rating-input">
            {[1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                className={`rating-star ${n <= (hoverRating || rating) ? 'active' : ''}`}
                onMouseEnter={() => setHoverRating(n)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(n)}
              >★</span>
            ))}
          </div>
          <textarea
            placeholder="Conte como foi seu evento, qualidade das fotos, atendimento..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            required
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="review-submit" disabled={submitting || !rating || !comment.trim()}>
              {submitting ? 'Enviando...' : 'Publicar avaliação'}
            </button>
            <button
              type="button"
              className="review-submit"
              style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
              onClick={() => setShowForm(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {reviews.length === 0 ? (
        <div className="reviews-empty">
          Ainda não há avaliações. Seja o primeiro!
        </div>
      ) : (
        <div className="reviews-list">
          {reviews.map((r) => (
            <div key={r.id} className="review-card">
              <div className="review-meta">
                <div className="review-avatar">
                  {r.first_name[0]}{r.last_name[0]}
                </div>
                <div className="review-author">
                  <h5>{r.first_name} {r.last_name}</h5>
                  <span>{new Date(r.created_at).toLocaleDateString('pt-BR', {
                    day: 'numeric', month: 'long', year: 'numeric'
                  })}</span>
                </div>
                <div className="review-rating">{renderStars(r.rating)}</div>
              </div>
              <p className="review-body">{r.comment}</p>
              {r.category_name && <span className="review-tag">{r.category_name}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
