const { verifyAccessToken } = require('../utils/jwt');
const User = require('../models/User');

// Validates JWT and attaches user to request
module.exports = async function auth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const payload = verifyAccessToken(token); 
    const user = await User.findById(payload.sub);

    if (!user) {
      return res.status(401).json({ error: 'Invalid token user' });
    }

    req.user = user;
    return next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ error: message });
  }
};

// Optional auth: attaches user when valid token present, never fails with 401
module.exports.optionalAuth = async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return next();
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);
    if (user) req.user = user;
    return next();
  } catch (_err) {
    return next();
  }
};
