const dns = require('node:dns');
const mongoose = require('mongoose');

// Temporary workaround for Windows DNS issues.
// Remove this once your DNS/network issue is resolved.
dns.setServers(['8.8.8.8', '8.8.4.4']);

const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('Missing MONGODB_URI');
    }

    // Auto-fix malformed MongoDB URI if needed
    let mongoUri = process.env.MONGODB_URI;

    if (mongoUri.includes('appName=Cluster0w=majority')) {
      mongoUri = mongoUri.replace(
        /appName=Cluster0w=majority&appName=Cluster0/,
        'appName=Cluster0'
      );
      console.warn('⚠️ Detected malformed MongoDB URI, auto-fixed.');
    }

    console.log('🔌 Connecting to MongoDB...');
    console.log(`📊 Database: ${process.env.MONGODB_DB || 'extrahand'}`);

    const conn = await mongoose.connect(mongoUri, {
      dbName: process.env.MONGODB_DB || 'extrahand',
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      maxPoolSize: 10,
      minPoolSize: 2,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(
      `📊 Connected Database: ${
        conn.connection.db?.databaseName || process.env.MONGODB_DB || 'extrahand'
      }`
    );

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });

    return conn;
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    process.exit(1);
  }
};

module.exports = connectDB;