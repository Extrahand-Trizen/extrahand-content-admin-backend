const mongoose = require('mongoose');
const dns = require('dns');

// Configure DNS fallback servers for reliable Atlas SRV resolution
const DNS_FALLBACK_SERVERS = ['1.1.1.1', '8.8.8.8', '8.8.4.4', '1.0.0.1'];

try {
  dns.setServers(DNS_FALLBACK_SERVERS);
} catch (error) {
  console.warn('Unable to configure DNS servers:', error.message);
}

try {
  dns.setDefaultResultOrder?.('ipv4first');
} catch (error) {
  console.warn('Unable to set IPv4-first DNS result order:', error.message);
}

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      bufferCommands: false,
      family: 4, // Force IPv4
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 5000,
      maxPoolSize: 25,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      autoIndex: true,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);

    conn.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });

    conn.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected');
    });

    conn.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
    });

    return conn;
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;