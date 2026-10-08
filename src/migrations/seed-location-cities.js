require('dotenv').config();
const mongoose = require('mongoose');
const City = require('../models/City');

const LOCATION_CITIES = [
  { name: 'Mahabubnagar', slug: 'mahabubnagar' },
  { name: 'Siddipet', slug: 'siddipet' },
];

async function seedLocationCities() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is required');
    }

    await mongoose.connect(mongoUri);
    for (const city of LOCATION_CITIES) {
      await City.updateOne(
        { slug: city.slug },
        { $set: { name: city.name, isActive: true } },
        { upsert: true }
      );
      console.log(`Ensured city is available: ${city.name}`);
    }
  } catch (error) {
    console.error('Failed to seed location cities:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seedLocationCities();
