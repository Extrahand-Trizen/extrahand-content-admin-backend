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
const authRouter = require('./routes/auth');
const articlesRouter = require('./routes/articles');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(morgan('dev'));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
});

// Routes
app.use('/auth', authRouter);
app.use('/api/pages', pagesRouter);
app.use('/api/task-categories', taskCategoriesRouter);
app.use('/api/task-subcategories', taskSubcategoriesRouter);
app.use('/api/articles', articlesRouter);

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

