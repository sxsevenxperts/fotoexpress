const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS print_orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      photo_id INTEGER NOT NULL,
      product TEXT NOT NULL,
      size TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      price NUMERIC(10,2) NOT NULL,
      shipping_price NUMERIC(10,2) NOT NULL DEFAULT 0,
      shipping_address JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      tracking_code TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  tableReady = true;
}

// Catálogo de produtos físicos (em produção, integrar com Printful/Doka API).
const PRINT_PRODUCTS = {
  photo_print: {
    name: 'Foto impressa',
    description: 'Papel fotográfico fosco premium',
    sizes: [
      { code: '10x15', label: '10x15 cm', price: 9.90 },
      { code: '15x21', label: '15x21 cm', price: 14.90 },
      { code: '20x30', label: '20x30 cm', price: 24.90 },
      { code: '30x45', label: '30x45 cm', price: 49.90 }
    ]
  },
  canvas: {
    name: 'Quadro em canvas',
    description: 'Tela canvas esticada em chassi de madeira',
    sizes: [
      { code: '30x40', label: '30x40 cm', price: 119.00 },
      { code: '40x60', label: '40x60 cm', price: 179.00 },
      { code: '60x90', label: '60x90 cm', price: 279.00 }
    ]
  },
  polaroid: {
    name: 'Pack Polaroid',
    description: 'Conjunto de 10 fotos estilo Polaroid',
    sizes: [
      { code: 'pack10', label: 'Pack de 10', price: 39.90 }
    ]
  },
  framed: {
    name: 'Foto emoldurada',
    description: 'Foto + moldura preta com vidro',
    sizes: [
      { code: '20x30', label: '20x30 cm', price: 89.00 },
      { code: '30x45', label: '30x45 cm', price: 139.00 }
    ]
  }
};

const SHIPPING_FLAT_RATE = 14.90;

// GET: catálogo público de produtos físicos.
router.get('/catalog', (req, res) => {
  res.json({ products: PRINT_PRODUCTS, shippingFlatRate: SHIPPING_FLAT_RATE });
});

// POST: cria pedido de impressão (mock — em prod, dispara fulfillment).
router.post('/', authenticate, express.json(), async (req, res) => {
  try {
    await ensureTable();
    const { photoId, product, size, quantity = 1, shippingAddress } = req.body;

    const productDef = PRINT_PRODUCTS[product];
    if (!productDef) return res.status(400).json({ error: 'Produto inválido' });

    const sizeDef = productDef.sizes.find((s) => s.code === size);
    if (!sizeDef) return res.status(400).json({ error: 'Tamanho inválido' });

    if (!shippingAddress?.street || !shippingAddress?.zip) {
      return res.status(400).json({ error: 'Endereço de entrega incompleto' });
    }

    // Verifica que o usuário possui a foto.
    const ownership = await db.query(
      `SELECT id FROM photo_purchases
       WHERE user_id = $1 AND photo_id = $2 AND status = 'completed'`,
      [req.user.userId, photoId]
    );

    if (ownership.rows.length === 0) {
      return res.status(403).json({ error: 'Você precisa comprar a foto digital primeiro' });
    }

    const unitPrice = sizeDef.price;
    const totalPrice = unitPrice * quantity;

    const result = await db.query(
      `INSERT INTO print_orders
         (user_id, photo_id, product, size, quantity, price, shipping_price, shipping_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, status, created_at`,
      [
        req.user.userId, photoId, product, size, quantity,
        totalPrice, SHIPPING_FLAT_RATE, shippingAddress
      ]
    );

    res.status(201).json({
      order: result.rows[0],
      pricing: {
        productPrice: totalPrice,
        shipping: SHIPPING_FLAT_RATE,
        total: totalPrice + SHIPPING_FLAT_RATE
      },
      message: 'Pedido criado. Você receberá o código de rastreio em até 2 dias úteis.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: lista pedidos de impressão do usuário.
router.get('/', authenticate, async (req, res) => {
  try {
    await ensureTable();
    const result = await db.query(
      `SELECT po.*, p.thumbnail_url
       FROM print_orders po
       JOIN photos p ON po.photo_id = p.id
       WHERE po.user_id = $1
       ORDER BY po.created_at DESC`,
      [req.user.userId]
    );
    res.json({ orders: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
