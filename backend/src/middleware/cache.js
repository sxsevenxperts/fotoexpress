const cache = (durationSeconds) => {
  return (req, res, next) => {
    res.set('Cache-Control', `public, max-age=${durationSeconds}`);
    next();
  };
};

module.exports = { cache };
