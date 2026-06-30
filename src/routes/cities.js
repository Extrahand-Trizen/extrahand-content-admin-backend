const express = require('express');
const router = express.Router();
const City = require('../models/City');
const Area = require('../models/Area');
const authenticate = require('../middleware/auth');
const allowRoles = require('../middleware/roles');

router.get('/', async (req, res) => {
  try {
    const cities = await City.find({ isActive: true }).sort({ name: 1 }).lean();
    return res.status(200).json(cities);
  } catch (error) {
    console.error('Error fetching cities:', error);
    return res.status(500).json({ error: 'Failed to fetch cities' });
  }
});

router.get('/:cityId/areas', async (req, res) => {
  try {
    const areas = await Area.find({ cityId: req.params.cityId, isActive: true }).sort({ name: 1 }).lean();
    return res.status(200).json(areas);
  } catch (error) {
    console.error('Error fetching areas:', error);
    return res.status(500).json({ error: 'Failed to fetch areas' });
  }
});

router.post('/', authenticate, allowRoles('content_access_manager'), async (req, res) => {
  try {
    const { name, slug } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ error: 'Name and slug are required' });
    }
    const existing = await City.findOne({ slug });
    if (existing) {
      return res.status(409).json({ error: 'City with this slug already exists' });
    }
    const city = await City.create({ name, slug });
    return res.status(201).json({ message: 'City created', city });
  } catch (error) {
    console.error('Error creating city:', error);
    return res.status(500).json({ error: 'Failed to create city' });
  }
});

router.post('/:cityId/areas', authenticate, allowRoles('content_access_manager'), async (req, res) => {
  try {
    const { name, slug } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ error: 'Name and slug are required' });
    }
    const city = await City.findById(req.params.cityId);
    if (!city) {
      return res.status(404).json({ error: 'City not found' });
    }
    const existing = await Area.findOne({ slug });
    if (existing) {
      return res.status(409).json({ error: 'Area with this slug already exists' });
    }
    const area = await Area.create({ name, slug, cityId: city._id });
    return res.status(201).json({ message: 'Area created', area });
  } catch (error) {
    console.error('Error creating area:', error);
    return res.status(500).json({ error: 'Failed to create area' });
  }
});

module.exports = router;
