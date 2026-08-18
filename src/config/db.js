const mongoose = require('mongoose');
const dns = require('dns');

// Configure DNS fallback
const DNS_FALLBACK_SERVERS = ['8.8.8.8', '8.8.4.4'];

try {
  dns.setServers(DNS_FALLBACK_SERVERS);
  console.log('Using DNS servers:', dns.getServers());
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
      serverSelectionTimeoutMS: 20000,
      socketTimeoutMS: 60000,
      connectTimeoutMS: 20000,
      maxPoolSize: 10,
      minPoolSize: 2,
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