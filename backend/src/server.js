const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const redisClient = require('./config/redis');
const app = express();

// Conectar ao Redis
redisClient.connect().catch(err => {
  console.error('Falha ao conectar ao Redis:', err);
});

// Middleware
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Muitas requisições neste IP, tente novamente mais tarde.'
});
app.use('/api/', limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
console.log('🔧 Registering API routes...');
app.use('/api/auth', require('./routes/auth'));
console.log('✅ /api/auth');
app.use('/api/photographers', require('./routes/photographers'));
console.log('✅ /api/photographers');
app.use('/api/users', require('./routes/users'));
console.log('✅ /api/users');
app.use('/api/galleries', require('./routes/galleries'));
console.log('✅ /api/galleries');
app.use('/api/photos', require('./routes/photos'));
console.log('✅ /api/photos');
app.use('/api/videos', require('./routes/videos'));
console.log('✅ /api/videos');
app.use('/api/bookings', require('./routes/bookings'));
console.log('✅ /api/bookings');
app.use('/api/payments', require('./routes/payments'));
console.log('✅ /api/payments');
app.use('/api/reviews', require('./routes/reviews'));
console.log('✅ /api/reviews');
app.use('/api/categories', require('./routes/categories'));
console.log('✅ /api/categories');
app.use('/api/events', require('./routes/events'));
console.log('✅ /api/events');
app.use('/api/purchases', require('./routes/purchases'));
console.log('✅ /api/purchases');
app.use('/api/faces', require('./routes/faces'));
console.log('✅ /api/faces');
app.use('/api/notifications', require('./routes/notifications'));
console.log('✅ /api/notifications');
app.use('/api/uploads', require('./routes/uploads'));
console.log('✅ /api/uploads');
app.use('/api/wishlist', require('./routes/wishlist'));
console.log('✅ /api/wishlist');
app.use('/api/presale', require('./routes/presale'));
console.log('✅ /api/presale');
app.use('/api/prints', require('./routes/prints'));
console.log('✅ /api/prints');
app.use('/api/messages', require('./routes/messages'));
console.log('✅ /api/messages');
app.use('/api/stories', require('./routes/stories'));
console.log('✅ /api/stories');
app.use('/api/affiliate', require('./routes/affiliate'));
console.log('✅ /api/affiliate');
app.use('/uploads', express.static(require('path').join(__dirname, '..', 'uploads'), { maxAge: '1d' }));
app.use('/api/search', require('./routes/search'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: `Rota não encontrada: ${req.method} ${req.originalUrl}`,
      status: 404
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: {
      message: err.message,
      status: err.status || 500
    }
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
