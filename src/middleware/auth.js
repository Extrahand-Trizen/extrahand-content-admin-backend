const { verifyAccessToken } = require('../utils/jwt');
const User = require('../models/User');

const AUTH_USER_SELECT = 'name email role status banned suspendedUntil';
const AUTH_CACHE_TTL_MS = 45_000;
const AUTH_CACHE_MAX = 500;

/** @type {Map<string, { user: object, expiresAt: number }>} */
const authUserCache = new Map();

function getCachedAuthUser(sub) {
  const entry = authUserCache.get(sub);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    authUserCache.delete(sub);
    return null;
  }
  return entry.user;
}

function setCachedAuthUser(sub, user) {
  authUserCache.set(String(sub), {
    user,
    expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
  });
  if (authUserCache.size > AUTH_CACHE_MAX) {
    const now = Date.now();
    for (const [key, value] of authUserCache) {
      if (now > value.expiresAt) authUserCache.delete(key);
    }
  }
}

/** Drop cached auth user (call after role/ban/suspend changes). */
function invalidateAuthUserCache(userId) {
  if (userId == null) return;
  authUserCache.delete(String(userId));
}

async function loadAuthUser(sub) {
  const cached = getCachedAuthUser(sub);
  if (cached) return cached;

  const user = await User.findById(sub).select(AUTH_USER_SELECT).lean();
  if (!user) return null;

  setCachedAuthUser(sub, user);
  return user;
}

// Validates JWT and attaches user to request
module.exports = async function auth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const payload = verifyAccessToken(token);
    const user = await loadAuthUser(payload.sub);

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
    const user = await loadAuthUser(payload.sub);
    if (user) req.user = user;
    return next();
  } catch (_err) {
    return next();
  }
};

module.exports.invalidateAuthUserCache = invalidateAuthUserCache;
module.exports.AUTH_USER_SELECT = AUTH_USER_SELECT;
