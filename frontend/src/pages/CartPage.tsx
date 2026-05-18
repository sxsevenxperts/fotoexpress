import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import Breadcrumb from '../components/Breadcrumb';
import './CartPage.css';

export default function CartPage() {
  const navigate = useNavigate();
  const { items, removeItem, total } = useCart();

  console.log('[CartPage] Rendered with items:', items);

  if (items.length === 0) {
    return (
      <div className="cart-empty">
        <p>Seu carrinho está vazio</p>
        <button onClick={() => navigate('/')}>Voltar às galerias</button>
      </div>
    );
  }

  const commission = Math.round(total * 7) / 100;
  const subtotal = total - commission;

  return (
    <div className="cart-container">
      <Breadcrumb />
      <h1>Carrinho de Compras</h1>

      <div className="cart-content">
        <div className="cart-items">
          {items.map(item => (
            <div key={item.photoId} className="cart-item">
              <img src={item.thumbnailUrl} alt="Foto" />
              <div className="item-info">
                <p className="item-price">R$ {item.price.toFixed(2)}</p>
              </div>
              <button
                className="btn-remove"
                onClick={() => removeItem(item.photoId)}
              >
                Remover
              </button>
            </div>
          ))}
        </div>

        <div className="cart-summary">
          <h2>Resumo</h2>
          <div className="summary-line">
            <span>{items.length} foto(s)</span>
            <span>R$ {total.toFixed(2)}</span>
          </div>
          <div className="summary-line commission">
            <span>Comissão da plataforma (7%)</span>
            <span>-R$ {commission.toFixed(2)}</span>
          </div>
          <div className="summary-line total">
            <strong>Total</strong>
            <strong>R$ {subtotal.toFixed(2)}</strong>
          </div>

          <button
            className="btn-checkout"
            onClick={() => navigate('/checkout')}
          >
            Proceder ao Pagamento
          </button>
        </div>
      </div>
    </div>
  );
}
