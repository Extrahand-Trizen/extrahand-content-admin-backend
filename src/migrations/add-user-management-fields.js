require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function migrateUserManagementFields() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI;
    
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is required');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all users that are missing the new fields
    const users = await User.find({});
    console.log(`\nFound ${users.length} users to migrate`);

    let updatedCount = 0;
    const updates = [];

    for (const user of users) {
      const updateFields = {};
      let needsUpdate = false;

      // Add suspendedUntil if missing
      if (user.suspendedUntil === undefined) {
        updateFields.suspendedUntil = null;
        needsUpdate = true;
      }

      // Add suspendedBy if missing
      if (user.suspendedBy === undefined) {
        updateFields.suspendedBy = null;
        needsUpdate = true;
      }

      // Add suspendedReason if missing
      if (user.suspendedReason === undefined) {
        updateFields.suspendedReason = null;
        needsUpdate = true;
      }

      // Add banned if missing
      if (user.banned === undefined) {
        updateFields.banned = false;
        needsUpdate = true;
      }

      // Add bannedAt if missing
      if (user.bannedAt === undefined) {
        updateFields.bannedAt = null;
        needsUpdate = true;
      }

      // Add bannedBy if missing
      if (user.bannedBy === undefined) {
        updateFields.bannedBy = null;
        needsUpdate = true;
      }

      // Add bannedReason if missing
      if (user.bannedReason === undefined) {
        updateFields.bannedReason = null;
        needsUpdate = true;
      }

      if (needsUpdate) {
        updates.push({
          updateOne: {
            filter: { _id: user._id },
            update: { $set: updateFields }
          }
        });
        updatedCount++;
      }
    }

    if (updates.length > 0) {
      console.log(`\nUpdating ${updates.length} users...`);
      await User.bulkWrite(updates);
      console.log(`✅ Successfully updated ${updatedCount} users`);
    } else {
      console.log('\n✅ All users already have the required fields');
    }

    console.log('\n=================================');
    console.log('Migration completed successfully!');
    console.log('=================================\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run migration
migrateUserManagementFields();
