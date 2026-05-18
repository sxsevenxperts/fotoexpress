const redisClient = require('../config/redis');

const cacheGet = async (key) => {
  try {
    const value = await redisClient.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error('Erro ao obter cache:', error);
    return null;
  }
};

const cacheSet = async (key, value, ttl = 300) => {
  try {
    await redisClient.setEx(key, ttl, JSON.stringify(value));
  } catch (error) {
    console.error('Erro ao definir cache:', error);
  }
};

const cacheDel = async (key) => {
  try {
    await redisClient.del(key);
  } catch (error) {
    console.error('Erro ao deletar cache:', error);
  }
};

const cachePattern = async (pattern) => {
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (error) {
    console.error('Erro ao deletar cache por padrão:', error);
  }
};

const withCache = (ttl = 300) => {
  return async (req, res, next) => {
    // Inclui o usuário autenticado na chave para que respostas específicas
    // de um usuário nunca sejam servidas a outro a partir do cache.
    const scope = req.user?.userId ? `u${req.user.userId}:` : '';
    const cacheKey = `${req.method}:${scope}${req.originalUrl}`;

    try {
      const cached = await cacheGet(cacheKey);
      if (cached) {
        res.set('X-Cache', 'HIT');
        return res.json(cached);
      }
    } catch (error) {
      console.error('Erro ao verificar cache:', error);
    }

    const originalJson = res.json;
    res.json = function(data) {
      cacheSet(cacheKey, data, ttl);
      res.set('X-Cache', 'MISS');
      return originalJson.call(this, data);
    };

    next();
  };
};

module.exports = { cacheGet, cacheSet, cacheDel, cachePattern, withCache };
