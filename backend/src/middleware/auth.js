const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
};

// Autenticação opcional: popula req.user quando há token válido,
// mas não bloqueia a requisição quando o token está ausente ou inválido.
// Usado em endpoints públicos que entregam conteúdo diferente para o dono
// do recurso (ex.: original sem marca d'água para quem já comprou).
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      req.user = undefined;
    }
  }

  next();
};

const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autorizado' });
    }

    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    next();
  };
};

module.exports = { authenticate, optionalAuth, authorize };
