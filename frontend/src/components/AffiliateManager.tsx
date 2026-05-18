import { useEffect, useState } from 'react';
import axios from 'axios';
import './AffiliateManager.css';

interface ReferralCode {
  id: string;
  code: string;
  commission_rate: number;
  is_active: boolean;
  uses_count: number;
  max_uses?: number;
  expires_at?: string;
  created_at: string;
}

interface AffiliateStats {
  total_commissions: number;
  total_earned: number;
  pending_amount: number;
  paid_amount: number;
  referred_customers: number;
  codes: Array<ReferralCode & {
    unique_customers: number;
    earnings: number;
  }>;
}

export default function AffiliateManager() {
  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [codes, setCodes] = useState<ReferralCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    commission_rate: 10,
    max_uses: '',
    expires_at: ''
  });
  const token = localStorage.getItem('token');

  useEffect(() => {
    loadAffiliateData();
  }, []);

  const loadAffiliateData = async () => {
    setLoading(true);
    try {
      const [statsRes, codesRes] = await Promise.all([
        axios.get('/api/affiliate/stats', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get('/api/affiliate/codes', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      setStats(statsRes.data);
      setCodes(codesRes.data.codes);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar dados de afiliados');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCode = async () => {
    if (creating) return;
    setCreating(true);

    try {
      const payload: any = {
        commission_rate: formData.commission_rate / 100
      };
      if (formData.max_uses) payload.max_uses = parseInt(formData.max_uses);
      if (formData.expires_at) payload.expires_at = formData.expires_at;

      const res = await axios.post('/api/affiliate/codes', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setCodes([res.data, ...codes]);
      setShowCreateForm(false);
      setFormData({
        commission_rate: 10,
        max_uses: '',
        expires_at: ''
      });
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao criar código de referência');
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivateCode = async (codeId: string) => {
    try {
      await axios.put(`/api/affiliate/codes/${codeId}/deactivate`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCodes(codes.map(c => c.id === codeId ? { ...c, is_active: false } : c));
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao desativar código');
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  if (loading) return <div className="loading">Carregando programa de afiliados...</div>;

  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="affiliate-manager">
      <div className="affiliate-header">
        <div>
          <h2>💰 Programa de Afiliados</h2>
          <p>Convide clientes e ganhe comissões por cada compra</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          + Novo Código de Referência
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {stats && (
        <div className="affiliate-stats">
          <div className="stat-box">
            <div className="stat-label">💵 Total Ganho</div>
            <div className="stat-value">{fmtBRL(stats.total_earned)}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">⏳ Comissões Pendentes</div>
            <div className="stat-value">{fmtBRL(stats.pending_amount)}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">✅ Comissões Pagas</div>
            <div className="stat-value">{fmtBRL(stats.paid_amount)}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">👥 Clientes Referidos</div>
            <div className="stat-value">{stats.referred_customers}</div>
          </div>
        </div>
      )}

      {showCreateForm && (
        <div className="create-code-form">
          <h3>Criar Novo Código de Referência</h3>
          <div className="form-group">
            <label>Comissão (%)</label>
            <input
              type="number"
              min="1"
              max="50"
              value={formData.commission_rate}
              onChange={(e) => setFormData({ ...formData, commission_rate: parseInt(e.target.value) || 10 })}
            />
            <small>Percentual de comissão por venda: {formData.commission_rate}%</small>
          </div>

          <div className="form-group">
            <label>Limite de Usos (opcional)</label>
            <input
              type="number"
              min="1"
              placeholder="Deixe em branco para ilimitado"
              value={formData.max_uses}
              onChange={(e) => setFormData({ ...formData, max_uses: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Data de Expiração (opcional)</label>
            <input
              type="datetime-local"
              value={formData.expires_at}
              onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
            />
          </div>

          <div className="form-actions">
            <button
              className="btn-primary"
              onClick={handleCreateCode}
              disabled={creating}
            >
              {creating ? 'Criando...' : 'Criar Código'}
            </button>
            <button
              className="btn-secondary"
              onClick={() => setShowCreateForm(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="codes-section">
        <h3>Seus Códigos de Referência</h3>
        {codes.length === 0 ? (
          <div className="empty-state">
            <p>Você ainda não criou nenhum código de referência</p>
            <button className="btn-primary" onClick={() => setShowCreateForm(true)}>
              Criar Primeiro Código
            </button>
          </div>
        ) : (
          <div className="codes-grid">
            {codes.map((code) => (
              <div key={code.id} className={`code-card ${!code.is_active ? 'inactive' : ''}`}>
                <div className="code-header">
                  <div className="code-display">
                    <code className="code-text">{code.code}</code>
                    <button
                      className="btn-copy"
                      onClick={() => copyToClipboard(code.code)}
                      title="Copiar código"
                    >
                      📋
                    </button>
                  </div>
                  <span className={`code-status ${code.is_active ? 'active' : 'inactive'}`}>
                    {code.is_active ? '✓ Ativo' : '✗ Inativo'}
                  </span>
                </div>

                <div className="code-details">
                  <div className="detail">
                    <span className="detail-label">Comissão</span>
                    <span className="detail-value">{(code.commission_rate * 100).toFixed(1)}%</span>
                  </div>
                  <div className="detail">
                    <span className="detail-label">Usos</span>
                    <span className="detail-value">
                      {code.uses_count}
                      {code.max_uses ? ` / ${code.max_uses}` : ''}
                    </span>
                  </div>
                  {code.expires_at && (
                    <div className="detail">
                      <span className="detail-label">Expira em</span>
                      <span className="detail-value">
                        {new Date(code.expires_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  )}
                </div>

                {code.is_active && (
                  <button
                    className="btn-deactivate"
                    onClick={() => handleDeactivateCode(code.id)}
                  >
                    Desativar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
