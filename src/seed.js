require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User');

const MONGODB_URI = process.env.MONGODB_URI;
const SALT_ROUNDS = 12;

// Test users to create
const testUsers = [
  {
    name: 'Content Access Manager',
    email: 'contentmanager@extrahand.in',
    password: 'contentmanager@123',
    role: 'content_access_manager',
    status: 'APPROVED',
    emailVerified: true,
  }
];

async function seedDatabase() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing users (optional - comment out if you want to keep existing users)
    // await User.deleteMany({});
    // console.log('Cleared existing users');

    // Create test users
    console.log('\nCreating test users...\n');
    
    for (const userData of testUsers) {
      // Check if user already exists
      const existingUser = await User.findOne({ email: userData.email });
      
      if (existingUser) {
        console.log(`❌ User already exists: ${userData.email} (${userData.role})`);
        continue;
      }

      // Hash password
      const passwordHash = await bcrypt.hash(userData.password, SALT_ROUNDS);
      
      // Create user
      const user = await User.create({
        name: userData.name,
        email: userData.email,
        passwordHash,
        role: userData.role,
        status: userData.status,
        emailVerified: userData.emailVerified,
      });

      console.log(`✅ Created user: ${user.email} (${user.role})`);
      console.log(`   Password: ${userData.password}`);
    }

    console.log('\n=================================');
    console.log('Database seeding completed!');
    console.log('=================================\n');
    console.log('Test Users:');
    console.log('1. Reviewer:');
    console.log('   Email: reviewer@gmail.com');
    console.log('   Password: Reviewer123!');
    console.log('   Role: reviewer\n');
    console.log('2. Writer:');
    console.log('   Email: writer@gmail.com');
    console.log('   Password: Writer123!');
    console.log('   Role: writer\n');
    console.log('3. Content Access Manager:');
    console.log('   Email: contentaccessmanager@extrahand.in');
    console.log('   Password: content@123');
    console.log('   Role: content_access_manager\n');
    console.log('4. Content Access Manager (Production):');
    console.log('   Email: cam@extrahand.in');
    console.log('   Password: cam@123');
    console.log('   Role: content_access_manager\n');

    // Close connection
    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

// Run the seed function
seedDatabase();
