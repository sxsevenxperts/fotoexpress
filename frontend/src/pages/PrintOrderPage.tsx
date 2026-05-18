import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './PrintOrderPage.css';

interface Size {
  code: string;
  label: string;
  price: number;
}

interface Product {
  name: string;
  description: string;
  sizes: Size[];
}

type Catalog = Record<string, Product>;

const PRODUCT_ICONS: Record<string, string> = {
  photo_print: '🖼️',
  canvas: '🎨',
  polaroid: '📸',
  framed: '🏞️'
};

export default function PrintOrderPage() {
  const { photoId } = useParams();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [shippingFlat, setShippingFlat] = useState(14.9);
  const [product, setProduct] = useState<keyof Catalog>('photo_print');
  const [sizeCode, setSizeCode] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [address, setAddress] = useState({
    name: '',
    street: '',
    number: '',
    city: '',
    state: '',
    zip: ''
  });

  useEffect(() => {
    axios.get('/api/prints/catalog').then((res) => {
      setCatalog(res.data.products);
      setShippingFlat(res.data.shippingFlatRate);
      const firstSize = res.data.products.photo_print.sizes[0]?.code;
      if (firstSize) setSizeCode(firstSize);
    });
  }, []);

  useEffect(() => {
    if (catalog && catalog[product]) {
      setSizeCode(catalog[product].sizes[0].code);
    }
  }, [product, catalog]);

  if (!catalog || !photoId) return <div className="loading">Carregando catálogo...</div>;

  const currentProduct = catalog[product];
  const currentSize = currentProduct.sizes.find((s) => s.code === sizeCode);
  const productTotal = (currentSize?.price || 0) * quantity;
  const total = productTotal + shippingFlat;

  const handleSubmit = async () => {
    if (!address.street || !address.zip) {
      alert('Preencha o endereço completo');
      return;
    }
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        '/api/prints',
        {
          photoId,
          product,
          size: sizeCode,
          quantity,
          shippingAddress: address
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert('Pedido realizado! Você receberá o rastreio em até 2 dias úteis.');
      navigate('/downloads');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao criar pedido');
    } finally {
      setSubmitting(false);
    }
  };

  const previewClass = product === 'canvas' ? 'canvas' :
                       product === 'framed' ? 'framed' :
                       product === 'polaroid' ? 'polaroid' : '';

  return (
    <div className="print-container">
      <h1>🖨️ Imprimir sua foto</h1>
      <p className="print-subtitle">
        Receba sua memória em formato físico — entrega para todo o Brasil.
      </p>

      <div className="print-layout">
        <div className="print-preview">
          <div className={`print-preview-photo ${previewClass}`}>
            <img src={`/api/photos/${photoId}/download`} alt="Foto" />
          </div>
          <h3 style={{ margin: '8px 0 4px' }}>{currentProduct.name}</h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', margin: 0 }}>
            {currentProduct.description}
          </p>
        </div>

        <div>
          <div className="print-form">
            <div className="print-form-title">1. Escolha o produto</div>
            <div className="print-product-tabs">
              {Object.entries(catalog).map(([key, p]) => (
                <button
                  key={key}
                  className={`product-tab ${product === key ? 'active' : ''}`}
                  onClick={() => setProduct(key)}
                >
                  <div className="product-tab-icon">{PRODUCT_ICONS[key]}</div>
                  <div className="product-tab-name">{p.name}</div>
                  <div className="product-tab-desc">a partir de R$ {p.sizes[0].price.toFixed(2)}</div>
                </button>
              ))}
            </div>

            <div className="print-form-title">2. Tamanho</div>
            <div className="size-options">
              {currentProduct.sizes.map((s) => (
                <button
                  key={s.code}
                  className={`size-option ${sizeCode === s.code ? 'active' : ''}`}
                  onClick={() => setSizeCode(s.code)}
                >
                  <div className="size-label">{s.label}</div>
                  <div className="size-price">R$ {s.price.toFixed(2)}</div>
                </button>
              ))}
            </div>

            <div className="print-form-title">3. Quantidade</div>
            <div className="quantity-row">
              <button className="qty-btn" onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button>
              <span className="qty-value">{quantity}</span>
              <button className="qty-btn" onClick={() => setQuantity(quantity + 1)}>+</button>
            </div>

            <div className="print-form-title">4. Endereço de entrega</div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Nome do destinatário</label>
              <input value={address.name} onChange={(e) => setAddress({ ...address, name: e.target.value })} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>CEP</label>
                <input
                  value={address.zip}
                  onChange={(e) => setAddress({ ...address, zip: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                  placeholder="00000-000"
                />
              </div>
              <div className="field">
                <label>Número</label>
                <input value={address.number} onChange={(e) => setAddress({ ...address, number: e.target.value })} />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Rua</label>
              <input value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Cidade</label>
                <input value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
              </div>
              <div className="field">
                <label>UF</label>
                <input
                  value={address.state}
                  onChange={(e) => setAddress({ ...address, state: e.target.value.toUpperCase().slice(0, 2) })}
                  placeholder="SP"
                />
              </div>
            </div>

            <div className="totals-box">
              <div className="totals-row">
                <span>{currentSize?.label} × {quantity}</span>
                <span>R$ {productTotal.toFixed(2)}</span>
              </div>
              <div className="totals-row">
                <span>Frete (todo Brasil)</span>
                <span>R$ {shippingFlat.toFixed(2)}</span>
              </div>
              <div className="totals-row total">
                <span>Total</span>
                <span>R$ {total.toFixed(2)}</span>
              </div>
            </div>

            <button className="confirm-btn" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Processando...' : `Confirmar pedido — R$ ${total.toFixed(2)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
