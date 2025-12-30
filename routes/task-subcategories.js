const express = require('express');
const router = express.Router();
const TaskSubcategory = require('../models/TaskSubcategory');
const TaskCategory = require('../models/TaskCategory');

// GET - Fetch all subcategories or a single subcategory by slug
router.get('/', async (req, res) => {
  try {
    const { slug, categorySlug } = req.query;

    if (slug) {
      let subcategory = await TaskSubcategory.findOne({ slug, isPublished: true });
      
      if (!subcategory) {
        subcategory = await TaskSubcategory.findOne({ slug });
      }
      
      if (!subcategory) {
        return res.status(404).json({ error: 'Subcategory not found' });
      }
      return res.status(200).json(subcategory);
    }

    if (categorySlug) {
      const subcategories = await TaskSubcategory.find({ categorySlug }).sort({ createdAt: -1 });
      return res.status(200).json(subcategories);
    }

    const subcategories = await TaskSubcategory.find({}).sort({ createdAt: -1 });
    return res.status(200).json(subcategories);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching subcategories:', error);
    }
    return res.status(500).json({ error: 'Failed to fetch subcategories' });
  }
});

// POST - Create a new subcategory
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const { imageFile, ...cleanBody } = body;
    
    const { name, slug, categorySlug, heroTitle, heroDescription } = cleanBody;

    if (!name || !slug || !categorySlug || !heroTitle || !heroDescription) {
      return res.status(400).json({
        error: 'Name, slug, categorySlug, heroTitle, and heroDescription are required',
      });
    }

    const parentCategory = await TaskCategory.findOne({ slug: categorySlug });
    if (!parentCategory) {
      return res.status(404).json({
        error: 'Parent category not found. Please create the category first.',
      });
    }

    const existingSubcategory = await TaskSubcategory.findOne({ slug });
    if (existingSubcategory) {
      return res.status(409).json({
        error: 'A subcategory with this slug already exists',
      });
    }

    const whyJoinFeatures = (cleanBody.whyJoinFeatures && Array.isArray(cleanBody.whyJoinFeatures) && cleanBody.whyJoinFeatures.length > 0)
      ? cleanBody.whyJoinFeatures
      : [
          {
            title: 'All on your terms',
            description: "See a job that fits your skills and timeframe? Go for it. Extrahand's flexible to your schedule."
          },
          {
            title: 'Get going for free',
            description: 'Check tasks and get going straight away. Services fees occur when you\'ve completed the task.'
          },
          {
            title: 'Secure payments',
            description: 'Nobody likes chasing money, so we secure customer payments upfront. When a task is marked complete, your bank account will know about it.'
          },
          {
            title: 'Skills can thrill',
            description: 'Never thought your knack for crocheting would be useful? Think again. We\'re all about earning from unexpected skills at Extrahand.'
          }
        ];

    let cleanedStaticTasks = [];
    if (cleanBody.staticTasks && Array.isArray(cleanBody.staticTasks)) {
      cleanedStaticTasks = cleanBody.staticTasks.map(task => {
        if (!task || typeof task !== 'object') return task;
        const { profileImageFile, ...cleanTask } = task;
        return cleanTask;
      });
    }

    let cleanedTopTaskers = [];
    if (cleanBody.topTaskers && Array.isArray(cleanBody.topTaskers)) {
      cleanedTopTaskers = cleanBody.topTaskers.map(tasker => {
        if (!tasker || typeof tasker !== 'object') return tasker;
        const { profileImageFile, ...cleanTasker } = tasker;
        return cleanTasker;
      });
    }

    const subcategoryData = {
      name: cleanBody.name,
      slug: cleanBody.slug,
      categorySlug: cleanBody.categorySlug,
      heroTitle: cleanBody.heroTitle,
      heroDescription: cleanBody.heroDescription,
      heroImage: cleanBody.heroImage || '',
      earningsCard: cleanBody.earningsCard || {
        weekly: { '1-2': '₹240', '3-5': '₹600', '5+': '₹840+' },
        monthly: { '1-2': '₹1,039', '3-5': '₹2,598', '5+': '₹3,637+' },
        yearly: { '1-2': '₹12,480', '3-5': '₹31,200', '5+': '₹43,680+' },
      },
      defaultEarnings: cleanBody.defaultEarnings || '₹1,039',
      earningsPeriod: cleanBody.earningsPeriod || 'per month',
      earnings1to2: cleanBody.earnings1to2 || '₹1,039',
      earnings3to5: cleanBody.earnings3to5 || '₹2,598',
      earnings5plus: cleanBody.earnings5plus || '₹3,637',
      taskCount: cleanBody.taskCount || '500',
      location: cleanBody.location || 'India',
      earningsByJobTypes: cleanBody.earningsByJobTypes || {},
      disclaimer: cleanBody.disclaimer || 'Based on average accounting task prices. Actual marketplace earnings may vary',
      whyJoinTitle: cleanBody.whyJoinTitle || 'Why join Extrahand',
      whyJoinFeatures: whyJoinFeatures,
      whyJoinButtonText: cleanBody.whyJoinButtonText || 'Join Extrahand',
      staticTasksSectionTitle: cleanBody.staticTasksSectionTitle || `${cleanBody.name} tasks in India`,
      staticTasksSectionDescription: cleanBody.staticTasksSectionDescription || 'Check out what tasks people want done near you right now...',
      staticTasks: Array.isArray(cleanedStaticTasks) ? cleanedStaticTasks : [],
      browseAllTasksButtonText: cleanBody.browseAllTasksButtonText || 'Browse all tasks',
      lastUpdatedText: cleanBody.lastUpdatedText || 'Last updated on 4th Dec 2025',
      earningPotentialTitle: cleanBody.earningPotentialTitle || 'Discover your earning potential in India',
      earningPotentialDescription: cleanBody.earningPotentialDescription || 'Earn money with every accounting task',
      earningPotentialButtonText: cleanBody.earningPotentialButtonText || 'Join Extrahand',
      earningPotentialData: cleanBody.earningPotentialData || {
        weekly: { '1-2': '₹240', '3-5': '₹600', '5+': '₹840+' },
        monthly: { '1-2': '₹1039', '3-5': '₹2598', '5+': '₹3637+' },
        yearly: { '1-2': '₹12480', '3-5': '₹31200', '5+': '₹43680+' },
      },
      earningPotentialDisclaimer: cleanBody.earningPotentialDisclaimer || '*Based on average accounting task prices in India. Actual marketplace earnings may vary',
      incomeOpportunitiesTitle: cleanBody.incomeOpportunitiesTitle || 'Unlock new income opportunities in India',
      incomeOpportunitiesDescription: cleanBody.incomeOpportunitiesDescription || 'Explore accounting related tasks and discover your financial opportunities',
      incomeOpportunitiesData: cleanBody.incomeOpportunitiesData || {
        weekly: [],
        monthly: [],
        yearly: [],
      },
      incomeOpportunitiesDisclaimer: cleanBody.incomeOpportunitiesDisclaimer || '*Based on average accounting task prices in India. Actual marketplace earnings may vary',
      howToEarnTitle: cleanBody.howToEarnTitle || 'How to earn money on Extrahand',
      howToEarnSteps: cleanBody.howToEarnSteps || [
        {
          image: '',
          subtitle: 'Job opportunities that find you',
          description: 'Set up notifications and be alerted when a nearby, well-matched job is posted. Let customers book you directly by setting up a listing. Provide a great service and work with them again with Contacts.',
        },
        {
          image: '',
          subtitle: 'Set your price',
          description: 'Found a job you\'re up for? Set your price and make an offer. You can adjust and discuss it later if you need to.',
        },
        {
          image: '',
          subtitle: 'Work. Get paid. Quickly.',
          description: 'When tasks are complete, request for payment to be released and money will appear in your account instantly.',
        },
      ],
      howToEarnButtonText: cleanBody.howToEarnButtonText || 'Post a task',
      getInspiredTitle: cleanBody.getInspiredTitle || `Get Inspired: Top ${cleanBody.name} Taskers in India`,
      getInspiredButtonText: cleanBody.getInspiredButtonText || 'Join Extrahand',
      topTaskers: Array.isArray(cleanedTopTaskers) ? cleanedTopTaskers : [],
      insuranceCoverTitle: cleanBody.insuranceCoverTitle || "We've got you covered",
      insuranceCoverDescription: cleanBody.insuranceCoverDescription || "Whether you're a posting a task or completing a task, you can do both with the peace of mind that Extrahand is there to support.",
      insuranceCoverButtonText: cleanBody.insuranceCoverButtonText || "Extrahand's insurance cover",
      insuranceCoverFeatures: cleanBody.insuranceCoverFeatures || [
        {
          icon: "human",
          subtitle: "Public liability insurance",
          subdescription: "Extrahand Insurance covers you for any accidental injury to the customer or property damage whilst performing certain task activities",
        },
        {
          icon: "star",
          subtitle: "Top rated insurance",
          subdescription: "Extrahand Insurance is provided by Chubb Insurance India Limited, one of the world's most reputable, stable and innovative",
        },
      ],
      questionsTitle: cleanBody.questionsTitle || `Top ${cleanBody.name} related questions`,
      questions: cleanBody.questions || [],
      waysToEarnTitle: cleanBody.waysToEarnTitle || `Ways to earn money with ${cleanBody.name} tasks on Extrahand`,
      waysToEarnContent: cleanBody.waysToEarnContent || [],
      exploreOtherWaysTitle: cleanBody.exploreOtherWaysTitle || "Explore other ways to earn money in India",
      exploreOtherWaysImage: cleanBody.exploreOtherWaysImage || "",
      exploreOtherWaysTasks: cleanBody.exploreOtherWaysTasks || [],
      exploreOtherWaysButtonText: cleanBody.exploreOtherWaysButtonText || "Explore more tasks",
      exploreOtherWaysDisclaimer: cleanBody.exploreOtherWaysDisclaimer || "*Based on average prices from 1-2 completed tasks in India. Actual marketplace earnings may vary.",
      topLocationsIcon: cleanBody.topLocationsIcon || "location",
      topLocationsTitle: cleanBody.topLocationsTitle || "Browse our top locations",
      topLocationsHeadings: cleanBody.topLocationsHeadings || [
        "Delhi", "Mumbai", "Kolkata", "Chennai", "Pune", "Surat",
        "Jaipur", "Bangalore", "Hyderabad", "Ahmedabad", "Noida", "Gurugram",
      ],
      browseSimilarTasksIcons: cleanBody.browseSimilarTasksIcons || ["wrench", "brush", "pencil"],
      browseSimilarTasksTitle: cleanBody.browseSimilarTasksTitle || "Browse similar tasks near me",
      browseSimilarTasksHeadings: cleanBody.browseSimilarTasksHeadings || [],
      footer: cleanBody.footer || {
        discoverHeading: "Discover",
        discoverLinks: ["How it works", "Extrahand for business", "Earn money", "Side Hustle Calculator", "Search tasks", "Cost Guides", "Service Guides", "Comparison Guides", "Gift Cards", "Student Discount", "Partners", "New users FAQ"],
        companyHeading: "Company",
        companyLinks: ["About us", "Careers", "Media enquiries", "Community Guidelines", "Tasker Principles", "Terms and Conditions", "Blog", "Contact us", "Privacy policy", "Investors"],
        existingMembersHeading: "Existing Members",
        existingMembersLinks: ["Post a task", "Browse tasks", "Login", "Support centre"],
        popularCategoriesHeading: "Popular Categories",
        popularCategoriesLinks: ["Handyman Services", "Cleaning Services", "Delivery Services", "Removalists", "Gardening Services", "Auto Electricians", "Assembly Services", "All Services"],
        popularLocationsHeading: "Popular Locations",
        popularLocations: ["Chennai", "Pune", "Surat", "Jaipur", "Bangalore", "Hyderabad", "Ahmedabad"],
        copyrightText: "Extrahand Limited 2011-2025 ©, All rights reserved",
        appleStoreImage: "",
        googlePlayImage: "",
      },
      metaTitle: cleanBody.metaTitle || cleanBody.heroTitle,
      metaDescription: cleanBody.metaDescription || cleanBody.heroDescription,
      isPublished: cleanBody.isPublished !== undefined ? cleanBody.isPublished : false,
      tasks: cleanBody.tasks || [],
    };

    const subcategory = await TaskSubcategory.create(subcategoryData);
    const savedSubcategory = await TaskSubcategory.findById(subcategory._id).lean();
    
    return res.status(201).json({
      message: 'Subcategory created successfully',
      subcategory: savedSubcategory,
    });
  } catch (error) {
    console.error('Error creating subcategory:', error);
    return res.status(500).json({
      error: 'Failed to create subcategory',
      details: error.message,
    });
  }
});

// PUT - Update an existing subcategory
router.put('/', async (req, res) => {
  try {
    const body = req.body;
    const { id, imageFile, ...updateData } = body;
    
    if (updateData.footer && typeof updateData.footer === 'object') {
      const { appleStoreImageFile, googlePlayImageFile, ...cleanFooter } = updateData.footer;
      updateData.footer = cleanFooter;
    }
    
    if (!id) {
      return res.status(400).json({ error: 'Subcategory ID is required' });
    }

    if (updateData.slug) {
      const existingSubcategory = await TaskSubcategory.findOne({
        slug: updateData.slug,
        _id: { $ne: id },
      });
      if (existingSubcategory) {
        return res.status(409).json({
          error: 'A subcategory with this slug already exists',
        });
      }
    }

    if (updateData.staticTasks && Array.isArray(updateData.staticTasks)) {
      updateData.staticTasks = updateData.staticTasks.map(task => {
        const { profileImageFile, ...cleanTask } = task;
        return cleanTask;
      });
    }
    
    if (updateData.topTaskers && Array.isArray(updateData.topTaskers)) {
      updateData.topTaskers = updateData.topTaskers.map(tasker => {
        const { profileImageFile, ...cleanTasker } = tasker;
        return cleanTasker;
      });
    }

    const subcategory = await TaskSubcategory.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!subcategory) {
      return res.status(404).json({ error: 'Subcategory not found' });
    }
    
    return res.status(200).json({
      message: 'Subcategory updated successfully',
      subcategory,
    });
  } catch (error) {
    console.error('Error updating subcategory:', error);
    return res.status(500).json({
      error: 'Failed to update subcategory',
      details: error.message,
    });
  }
});

// DELETE - Delete a subcategory
router.delete('/', async (req, res) => {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Subcategory ID is required' });
    }

    const subcategory = await TaskSubcategory.findByIdAndDelete(id);
    if (!subcategory) {
      return res.status(404).json({ error: 'Subcategory not found' });
    }

    return res.status(200).json({ message: 'Subcategory deleted successfully' });
  } catch (error) {
    console.error('Error deleting subcategory:', error);
    return res.status(500).json({
      error: 'Failed to delete subcategory',
      details: error.message,
    });
  }
});

module.exports = router;

