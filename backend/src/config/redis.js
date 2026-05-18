const redis = require('redis');

const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  database: process.env.REDIS_DB || 0,
  socket: {
    reconnectStrategy: (retries) => {
      const delay = Math.min(retries * 50, 500);
      return delay;
    }
  }
});

redisClient.on('error', (err) => {
  console.error('Redis erro:', err);
});

redisClient.on('connect', () => {
  console.log('Conectado ao Redis');
});

module.exports = redisClient;
