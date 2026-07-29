require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');

// Import routes
const pagesRouter = require('./routes/pages');
const taskCategoriesRouter = require('./routes/task-categories');
const taskSubcategoriesRouter = require('./routes/task-subcategories');
const taskSubSubcategoriesRouter = require('./routes/task-sub-subcategories');
const authRouter = require('./routes/auth');
const articlesRouter = require('./routes/articles');
const adminRouter = require('./routes/admin');
const citiesRouter = require('./routes/cities');
const seoPagesRouter = require('./routes/seo-pages');
const authenticate = require('./middleware/auth');
const allowRoles = require('./middleware/roles');
const analyticsHandler = adminRouter.analyticsHandler;

import {Request, Response, NextFunction} from 'express';
import invitationRouter from './routes/invitations';


const app = express();
const PORT = 5001;

// CORS Configuration
const normalizeOrigin = (origin: string) => origin.replace(/\/+$/, '');

const isOriginAllowed = (origin: string): boolean => {
  const normalizedReqOrigin = normalizeOrigin(origin);

  // Parse allowed origins from environment
  const envOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : process.env.CLIENT_URL 
      ? [process.env.CLIENT_URL]
      : ['http://localhost:3000'];

  // Core production and development origins
  const defaultOrigins = [
    'https://content.extrahand.in',
    'https://extrahand.in',
    'http://localhost:4000',
    'http://localhost:3000'
  ];

  const allOrigins = Array.from(new Set([...envOrigins, ...defaultOrigins])).map(normalizeOrigin);

  if (allOrigins.includes(normalizedReqOrigin)) {
    return true;
  }

  // Allow subdomains of extrahand.in (e.g. https://extrahand.in or https://*.extrahand.in)
  try {
    const url = new URL(normalizedReqOrigin);
    if (url.hostname === 'extrahand.in' || url.hostname.endsWith('.extrahand.in')) {
      return true;
    }
  } catch (e) {
    // Invalid URL format
  }

  return false;
};

const corsOptions = {
  origin: function (origin: string | undefined, callback: any) {
    // Allow requests with no origin (like mobile apps, server-to-server, or curl requests)
    if (!origin) {
      return callback(null, true);
    }
    
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      if (process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(null, false);
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Service-Auth',
    'X-Service-Name',
    'Accept',
    'X-Requested-With',
    'Cache-Control',
    'Pragma'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, // 24 hours
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(morgan('dev'));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
});

// Routes - register /mine before routers so GET /api/task-categories/mine and /api/task-subcategories/mine always match
const taskCategoriesMineHandler = taskCategoriesRouter.mineHandler;
const taskSubcategoriesMineHandler = taskSubcategoriesRouter.mineHandler;
app.get('/api/task-categories/mine', authenticate, allowRoles('writer'), taskCategoriesMineHandler);
app.get('/api/task-subcategories/mine', authenticate, allowRoles('writer'), taskSubcategoriesMineHandler);

app.use('/auth', authRouter);
app.use('/api/pages', pagesRouter);
app.use('/api/task-categories', taskCategoriesRouter);
app.use('/api/task-subcategories', taskSubcategoriesRouter);
app.use('/api/task-sub-subcategories', taskSubSubcategoriesRouter);
app.use('/api/articles', articlesRouter);
// Explicit analytics route so GET /api/admin/analytics always matches (avoids 404)
app.get('/api/admin/analytics', authenticate, allowRoles('content_access_manager'), analyticsHandler);
app.use('/api/admin', adminRouter);
app.use('/api/cities', citiesRouter);
app.use('/api/seo-pages', seoPagesRouter);
app.use('/api/invitation', invitationRouter);

// Health check route
app.get('/health', (req : Request, res : Response) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// 404 handler
app.use((req : Request, res : Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err : any, req : Request, res : Response, next : NextFunction) => {
  // Handle CORS errors
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({
      error: 'CORS policy violation',
      message: 'Origin not allowed by CORS policy',
    });
  }
  
  console.log('Error:', err.message);
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err?.message || 'Something went wrong!',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Connect to MongoDB, then start server (so auth/routes don't run before DB is ready)
const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });
};
startServer();

