const jwt = require('jsonwebtoken');

const {
  JWT_ACCESS_SECRET = 'dev_access_secret',
  JWT_REFRESH_SECRET = 'dev_refresh_secret',
  JWT_EXPIRES_IN = '15m',
  REFRESH_EXPIRES_IN = '7d',
} = process.env;

const signAccessToken = (user) =>
  jwt.sign(
    {
      sub: user._id,
      role: user.role,
      status: user.status,
    },
    JWT_ACCESS_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

const signRefreshToken = (user) =>
  jwt.sign(
    {
      sub: user._id,
      role: user.role,
      status: user.status,
    },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRES_IN }
  );

const verifyAccessToken = (token) => jwt.verify(token, JWT_ACCESS_SECRET);
const verifyRefreshToken = (token) => jwt.verify(token, JWT_REFRESH_SECRET);

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};

