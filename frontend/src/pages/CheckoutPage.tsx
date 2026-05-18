import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCart } from '../context/CartContext';
import Breadcrumb from '../components/Breadcrumb';
import './CheckoutPage.css';

type PaymentMethod = 'card' | 'pix';

interface PixPayment {
  id: string;
  pixCopyPaste: string;
  qrCodeUrl: string;
  expiresAt: string;
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { items, total, clearCart } = useCart();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [pixData, setPixData] = useState<PixPayment[] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!cardNumber && window.location.search.includes('autofill')) {
      setCardNumber('4242424242424242');
      setExpiry('12/25');
      setCvc('123');
    }
  }, [cardNumber]);

  if (items.length === 0 && !pixData) {
    return (
      <div className="checkout-empty">
        <p>Carrinho vazio</p>
        <button onClick={() => navigate('/')}>Voltar</button>
      </div>
    );
  }

  async function getAuthToken(): Promise<string> {
    let token = localStorage.getItem('token');
    if (!token) {
      const testEmail = `test-${Date.now()}@fotoexpress.local`;
      const registerRes = await axios.post('/api/auth/register', {
        email: testEmail,
        password: 'test123456',
        first_name: 'Test',
        last_name: 'User',
        role: 'customer'
      });
      token = registerRes.data.token as string;
      localStorage.setItem('token', token);
    }
    return token;
  }

  const handleCardPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const token = await getAuthToken();
      const headers = { Authorization: `Bearer ${token}` };

      const purchaseResponses = await Promise.all(
        items.map(item =>
          axios.post(`/api/purchases/photos/${item.photoId}`,
            { paymentMethod: 'card' },
            { headers }
          )
        )
      );

      if (cardNumber !== '4242424242424242') {
        throw new Error('Número do cartão inválido (use 4242 4242 4242 4242 para teste)');
      }

      await Promise.all(
        items.map((item, idx) =>
          axios.post(`/api/purchases/photos/${item.photoId}/confirm`,
            {
              paymentMethod: 'card',
              clientSecret: purchaseResponses[idx].data.payment.clientSecret
            },
            { headers }
          )
        )
      );

      clearCart();
      navigate('/downloads');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Erro no pagamento');
    } finally {
      setLoading(false);
    }
  };

  const handlePixPayment = async () => {
    setLoading(true);
    setError('');

    try {
      const token = await getAuthToken();
      const headers = { Authorization: `Bearer ${token}` };

      const purchaseResponses = await Promise.all(
        items.map(item =>
          axios.post(`/api/purchases/photos/${item.photoId}`,
            { paymentMethod: 'pix' },
            { headers }
          )
        )
      );

      setPixData(purchaseResponses.map(r => r.data.payment));
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Erro ao gerar Pix');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPix = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      await Promise.all(
        items.map(item =>
          axios.post(`/api/purchases/photos/${item.photoId}/confirm`,
            { paymentMethod: 'pix' },
            { headers }
          )
        )
      );

      clearCart();
      navigate('/downloads');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Erro ao confirmar Pix');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPix = () => {
    if (pixData && pixData[0]) {
      navigator.clipboard.writeText(pixData[0].pixCopyPaste);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const commission = Math.round(total * 7) / 100;
  const subtotal = total - commission;

  return (
    <div className="checkout-container">
      <Breadcrumb />
      <h1>Pagamento</h1>

      <div className="checkout-content">
        <div className="checkout-form">
          <div className="payment-methods">
            <button
              type="button"
              className={`method-btn ${paymentMethod === 'card' ? 'active' : ''}`}
              onClick={() => { setPaymentMethod('card'); setPixData(null); }}
              disabled={loading}
            >
              💳 Cartão
            </button>
            <button
              type="button"
              className={`method-btn ${paymentMethod === 'pix' ? 'active' : ''}`}
              onClick={() => { setPaymentMethod('pix'); setPixData(null); }}
              disabled={loading}
            >
              ⚡ Pix
            </button>
          </div>

          {paymentMethod === 'card' && (
            <form onSubmit={handleCardPayment}>
              <div className="form-group">
                <label>Número do Cartão *</label>
                <input
                  type="text"
                  placeholder="4242 4242 4242 4242"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, ''))}
                  maxLength={16}
                  required
                />
                <small>Para teste, use: 4242 4242 4242 4242</small>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Validade *</label>
                  <input
                    type="text"
                    placeholder="MM/AA"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                    maxLength={5}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>CVC *</label>
                  <input
                    type="text"
                    placeholder="123"
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value.replace(/\D/g, ''))}
                    maxLength={4}
                    required
                  />
                </div>
              </div>

              {error && <div className="error-message">{error}</div>}

              <button type="submit" className="btn-pay" disabled={loading}>
                {loading ? 'Processando...' : `Pagar R$ ${subtotal.toFixed(2)}`}
              </button>
            </form>
          )}

          {paymentMethod === 'pix' && !pixData && (
            <div className="pix-intro">
              <p>Pague via Pix com QR Code ou Copia-e-Cola.</p>
              <p className="pix-info">Aprovação instantânea, sem taxas adicionais.</p>
              {error && <div className="error-message">{error}</div>}
              <button onClick={handlePixPayment} className="btn-pay" disabled={loading}>
                {loading ? 'Gerando Pix...' : `Gerar Pix de R$ ${subtotal.toFixed(2)}`}
              </button>
            </div>
          )}

          {paymentMethod === 'pix' && pixData && (
            <div className="pix-display">
              <h3>Escaneie o QR Code</h3>
              <img src={pixData[0].qrCodeUrl} alt="QR Code Pix" className="pix-qrcode" />
              <p className="pix-amount">Valor: R$ {subtotal.toFixed(2)}</p>

              <div className="pix-copy-section">
                <label>Ou copie o código Pix:</label>
                <div className="pix-code-box">
                  <code>{pixData[0].pixCopyPaste}</code>
                </div>
                <button onClick={handleCopyPix} className="btn-copy">
                  {copied ? '✓ Copiado!' : '📋 Copiar código'}
                </button>
              </div>

              {error && <div className="error-message">{error}</div>}

              <button onClick={handleConfirmPix} className="btn-pay" disabled={loading}>
                {loading ? 'Confirmando...' : 'Já paguei — confirmar'}
              </button>
              <small className="pix-expire">Expira em 30 minutos</small>
            </div>
          )}
        </div>

        <div className="checkout-summary">
          <h2>Resumo do Pedido</h2>
          <div className="summary-items">
            {items.map(item => (
              <div key={item.photoId} className="summary-item">
                <img src={item.thumbnailUrl} alt="Foto" />
                <span>R$ {item.price.toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="summary-totals">
            <div className="summary-line">
              <span>{items.length} foto(s)</span>
              <span>R$ {total.toFixed(2)}</span>
            </div>
            <div className="summary-line commission">
              <span>Comissão (7%)</span>
              <span>-R$ {commission.toFixed(2)}</span>
            </div>
            <div className="summary-line total">
              <strong>Total</strong>
              <strong>R$ {subtotal.toFixed(2)}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
