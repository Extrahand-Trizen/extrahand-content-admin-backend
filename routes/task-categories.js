const express = require('express');
const router = express.Router();
const TaskCategory = require('../models/TaskCategory');
const TaskSubcategory = require('../models/TaskSubcategory');

// GET - Fetch all categories or a single category by slug
router.get('/', async (req, res) => {
  try {
    const { slug } = req.query;

    if (slug) {
      // Check if slug contains '/' which indicates it's a subcategory
      if (slug.includes('/')) {
        // This is a subcategory slug (format: "category-slug/subcategory-slug")
        let subcategory = await TaskSubcategory.findOne({ slug, isPublished: true });
        
        if (!subcategory) {
          subcategory = await TaskSubcategory.findOne({ slug });
        }
        
        if (!subcategory) {
          return res.status(404).json({ error: 'Subcategory not found' });
        }
        
        // Fetch parent category to get its name
        let parentCategory = null;
        if (subcategory.categorySlug) {
          parentCategory = await TaskCategory.findOne({ slug: subcategory.categorySlug });
        }
        
        const subcategoryObj = subcategory.toObject();
        if (parentCategory) {
          subcategoryObj.categoryName = parentCategory.name;
        } else {
          subcategoryObj.categoryName = subcategory.name;
        }
        
        return res.status(200).json(subcategoryObj);
      } else {
        // This is a category slug
        let category = await TaskCategory.findOne({ slug, isPublished: true });
        
        if (!category) {
          category = await TaskCategory.findOne({ slug });
        }
        
        if (!category) {
          return res.status(404).json({ error: 'Category not found' });
        }
        return res.status(200).json(category);
      }
    }

    // Fetch all categories (for admin)
    const categories = await TaskCategory.find({}).sort({ createdAt: -1 });
    return res.status(200).json(categories);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching categories:', error);
    }
    return res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// POST - Create a new category
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    
    console.log('=== RECEIVED IN API ===');
    console.log('staticTasks in body:', body.staticTasks);
    console.log('staticTasks length:', body.staticTasks?.length);
    
    const { imageFile, ...cleanBody } = body;
    
    const { name, slug, heroTitle, heroDescription } = cleanBody;

    if (!name || !slug || !heroTitle || !heroDescription) {
      return res.status(400).json({
        error: 'Name, slug, heroTitle, and heroDescription are required',
      });
    }

    const existingCategory = await TaskCategory.findOne({ slug });
    if (existingCategory) {
      return res.status(409).json({
        error: 'A category with this slug already exists',
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
      if (cleanBody.staticTasks.length > 0) {
        cleanedStaticTasks = cleanBody.staticTasks.map(task => {
          if (!task || typeof task !== 'object') return task;
          const { profileImageFile, ...cleanTask } = task;
          return cleanTask;
        });
      } else {
        cleanedStaticTasks = [];
      }
    } else {
      cleanedStaticTasks = [];
    }

    const categoryData = {
      name: cleanBody.name,
      slug: cleanBody.slug,
      subcategory: cleanBody.subcategory || '',
      subcategorySlug: cleanBody.subcategorySlug || '',
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
      staticTasksSectionTitle: (cleanBody.staticTasksSectionTitle !== undefined && cleanBody.staticTasksSectionTitle !== null && cleanBody.staticTasksSectionTitle !== '') 
        ? cleanBody.staticTasksSectionTitle 
        : (cleanBody.name ? `${cleanBody.name} tasks in India` : ''),
      staticTasksSectionDescription: (cleanBody.staticTasksSectionDescription !== undefined && cleanBody.staticTasksSectionDescription !== null && cleanBody.staticTasksSectionDescription !== '') 
        ? cleanBody.staticTasksSectionDescription 
        : 'Check out what tasks people want done near you right now...',
      staticTasks: Array.isArray(cleanedStaticTasks) ? cleanedStaticTasks : [],
      browseAllTasksButtonText: (cleanBody.browseAllTasksButtonText !== undefined && cleanBody.browseAllTasksButtonText !== null && cleanBody.browseAllTasksButtonText !== '') 
        ? cleanBody.browseAllTasksButtonText 
        : 'Browse all tasks',
      lastUpdatedText: (cleanBody.lastUpdatedText !== undefined && cleanBody.lastUpdatedText !== null && cleanBody.lastUpdatedText !== '') 
        ? cleanBody.lastUpdatedText 
        : 'Last updated on 4th Dec 2025',
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
      howToEarnTitle: cleanBody.howToEarnTitle !== undefined ? cleanBody.howToEarnTitle : 'How to earn money on Extrahand',
      howToEarnSteps: (() => {
        if (cleanBody.howToEarnSteps && Array.isArray(cleanBody.howToEarnSteps) && cleanBody.howToEarnSteps.length === 3) {
          return cleanBody.howToEarnSteps;
        }
        return [
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
        ];
      })(),
      howToEarnButtonText: cleanBody.howToEarnButtonText !== undefined ? cleanBody.howToEarnButtonText : 'Post a task',
      getInspiredTitle: cleanBody.getInspiredTitle !== undefined ? cleanBody.getInspiredTitle : 'Get Inspired: Top Accounting Taskers in India',
      getInspiredButtonText: cleanBody.getInspiredButtonText !== undefined ? cleanBody.getInspiredButtonText : 'Join Extrahand',
      topTaskers: (() => {
        if (cleanBody.topTaskers && Array.isArray(cleanBody.topTaskers)) {
          return cleanBody.topTaskers.map(tasker => {
            if (!tasker || typeof tasker !== 'object') return tasker;
            const { profileImageFile, ...cleanTasker } = tasker;
            return cleanTasker;
          });
        }
        return [];
      })(),
      insuranceCoverTitle: cleanBody.insuranceCoverTitle !== undefined && cleanBody.insuranceCoverTitle !== null && cleanBody.insuranceCoverTitle !== "" 
        ? cleanBody.insuranceCoverTitle 
        : "We've got you covered",
      insuranceCoverDescription: cleanBody.insuranceCoverDescription !== undefined && cleanBody.insuranceCoverDescription !== null && cleanBody.insuranceCoverDescription !== ""
        ? cleanBody.insuranceCoverDescription 
        : "Whether you're a posting a task or completing a task, you can do both with the peace of mind that Extrahand is there to support.",
      insuranceCoverButtonText: cleanBody.insuranceCoverButtonText !== undefined && cleanBody.insuranceCoverButtonText !== null && cleanBody.insuranceCoverButtonText !== ""
        ? cleanBody.insuranceCoverButtonText 
        : "Extrahand's insurance cover",
      insuranceCoverFeatures: (() => {
        if (cleanBody.insuranceCoverFeatures && Array.isArray(cleanBody.insuranceCoverFeatures) && cleanBody.insuranceCoverFeatures.length === 2) {
          return cleanBody.insuranceCoverFeatures.map((feature, index) => ({
            icon: index === 0 ? "human" : "star",
            subtitle: feature.subtitle || (index === 0 ? "Public liability insurance" : "Top rated insurance"),
            subdescription: feature.subdescription || (index === 0 
              ? "Extrahand Insurance covers you for any accidental injury to the customer or property damage whilst performing certain task activities"
              : "Extrahand Insurance is provided by Chubb Insurance India Limited, one of the world's most reputable, stable and innovative"),
          }));
        }
        return [
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
        ];
      })(),
      questionsTitle: cleanBody.questionsTitle !== undefined && cleanBody.questionsTitle !== null && cleanBody.questionsTitle !== ""
        ? cleanBody.questionsTitle
        : "Top Accounting related questions",
      questions: (() => {
        if (cleanBody.questions && Array.isArray(cleanBody.questions) && cleanBody.questions.length > 0) {
          return cleanBody.questions.map(question => ({
            subtitle: question.subtitle || "",
            description: question.description || "",
          }));
        }
        return [];
      })(),
      waysToEarnTitle: cleanBody.waysToEarnTitle !== undefined ? cleanBody.waysToEarnTitle : "Ways to earn money with accounting tasks on Extrahand",
      waysToEarnContent: (() => {
        if (cleanBody.waysToEarnContent && Array.isArray(cleanBody.waysToEarnContent) && cleanBody.waysToEarnContent.length > 0) {
          return cleanBody.waysToEarnContent.map(item => ({
            heading: item.heading || "",
            text: item.text || "",
          }));
        }
        return [];
      })(),
      exploreOtherWaysTitle: cleanBody.exploreOtherWaysTitle !== undefined ? cleanBody.exploreOtherWaysTitle : "Explore other ways to earn money in India",
      exploreOtherWaysImage: cleanBody.exploreOtherWaysImage || "",
      exploreOtherWaysTasks: (() => {
        if (cleanBody.exploreOtherWaysTasks && Array.isArray(cleanBody.exploreOtherWaysTasks) && cleanBody.exploreOtherWaysTasks.length > 0) {
          return cleanBody.exploreOtherWaysTasks.map(task => {
            const { imageFile, ...cleanTask } = task;
            return {
              subtitle: cleanTask.subtitle || "",
              subheading: cleanTask.subheading || "",
              image: cleanTask.image || "",
            };
          });
        }
        return [];
      })(),
      exploreOtherWaysButtonText: cleanBody.exploreOtherWaysButtonText !== undefined ? cleanBody.exploreOtherWaysButtonText : "Explore more tasks",
      exploreOtherWaysDisclaimer: cleanBody.exploreOtherWaysDisclaimer !== undefined ? cleanBody.exploreOtherWaysDisclaimer : "*Based on average prices from 1-2 completed tasks in India. Actual marketplace earnings may vary.",
      topLocationsIcon: cleanBody.topLocationsIcon !== undefined ? cleanBody.topLocationsIcon : "location",
      topLocationsTitle: cleanBody.topLocationsTitle !== undefined ? cleanBody.topLocationsTitle : "Browse our top locations",
      topLocationsHeadings: (() => {
        if (cleanBody.topLocationsHeadings && Array.isArray(cleanBody.topLocationsHeadings) && cleanBody.topLocationsHeadings.length > 0) {
          return cleanBody.topLocationsHeadings.filter(heading => heading && heading.trim() !== "");
        }
        return ["Delhi", "Mumbai", "Kolkata", "Chennai", "Pune", "Surat", "Jaipur", "Bangalore", "Hyderabad", "Ahmedabad", "Noida", "Gurugram"];
      })(),
      browseSimilarTasksIcons: (() => {
        if (cleanBody.browseSimilarTasksIcons && Array.isArray(cleanBody.browseSimilarTasksIcons) && cleanBody.browseSimilarTasksIcons.length > 0) {
          return cleanBody.browseSimilarTasksIcons;
        }
        return ["wrench", "brush", "pencil"];
      })(),
      browseSimilarTasksTitle: cleanBody.browseSimilarTasksTitle !== undefined ? cleanBody.browseSimilarTasksTitle : "Browse similar tasks near me",
      browseSimilarTasksHeadings: (() => {
        if (cleanBody.browseSimilarTasksHeadings && Array.isArray(cleanBody.browseSimilarTasksHeadings) && cleanBody.browseSimilarTasksHeadings.length > 0) {
          return cleanBody.browseSimilarTasksHeadings.filter(heading => heading && heading.trim() !== "");
        }
        return ["Financial Modelling", "Financial Planning", "Financial Reporting"];
      })(),
      footer: (() => {
        if (cleanBody.footer && typeof cleanBody.footer === 'object') {
          const { appleStoreImageFile, googlePlayImageFile, ...cleanFooter } = cleanBody.footer;
          return {
            discoverHeading: cleanFooter.discoverHeading || "Discover",
            discoverLinks: Array.isArray(cleanFooter.discoverLinks) ? cleanFooter.discoverLinks : ["How it works", "Extrahand for business", "Earn money", "Side Hustle Calculator", "Search tasks", "Cost Guides", "Service Guides", "Comparison Guides", "Gift Cards", "Student Discount", "Partners", "New users FAQ"],
            companyHeading: cleanFooter.companyHeading || "Company",
            companyLinks: Array.isArray(cleanFooter.companyLinks) ? cleanFooter.companyLinks : ["About us", "Careers", "Media enquiries", "Community Guidelines", "Tasker Principles", "Terms and Conditions", "Blog", "Contact us", "Privacy policy", "Investors"],
            existingMembersHeading: cleanFooter.existingMembersHeading || "Existing Members",
            existingMembersLinks: Array.isArray(cleanFooter.existingMembersLinks) ? cleanFooter.existingMembersLinks : ["Post a task", "Browse tasks", "Login", "Support centre"],
            popularCategoriesHeading: cleanFooter.popularCategoriesHeading || "Popular Categories",
            popularCategoriesLinks: Array.isArray(cleanFooter.popularCategoriesLinks) ? cleanFooter.popularCategoriesLinks : ["Handyman Services", "Cleaning Services", "Delivery Services", "Removalists", "Gardening Services", "Auto Electricians", "Assembly Services", "All Services"],
            popularLocationsHeading: cleanFooter.popularLocationsHeading || "Popular Locations",
            popularLocations: Array.isArray(cleanFooter.popularLocations) ? cleanFooter.popularLocations : ["Chennai", "Pune", "Surat", "Jaipur", "Bangalore", "Hyderabad", "Ahmedabad"],
            copyrightText: cleanFooter.copyrightText || "Extrahand Limited 2011-2025 ©, All rights reserved",
            appleStoreImage: cleanFooter.appleStoreImage || "",
            googlePlayImage: cleanFooter.googlePlayImage || "",
          };
        }
        return {
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
        };
      })(),
      metaTitle: cleanBody.metaTitle || heroTitle,
      metaDescription: cleanBody.metaDescription || heroDescription,
      isPublished: cleanBody.isPublished !== undefined ? cleanBody.isPublished : false,
      tasks: cleanBody.tasks || [],
    };

    const category = await TaskCategory.create(categoryData);
    const savedCategory = await TaskCategory.findById(category._id).lean();
    
    return res.status(201).json({
      message: 'Category created successfully',
      category: savedCategory,
    });
  } catch (error) {
    console.error('Error creating category:', error);
    return res.status(500).json({
      error: 'Failed to create category',
      details: error.message,
    });
  }
});

// PUT - Update an existing category
router.put('/', async (req, res) => {
  try {
    const body = req.body;
    const { id, imageFile, ...updateData } = body;
    
    if (updateData.footer && typeof updateData.footer === 'object') {
      const { appleStoreImageFile, googlePlayImageFile, ...cleanFooter } = updateData.footer;
      updateData.footer = cleanFooter;
    }

    if (!id) {
      return res.status(400).json({ error: 'Category ID is required' });
    }

    if (updateData.slug) {
      const existingCategory = await TaskCategory.findOne({
        slug: updateData.slug,
        _id: { $ne: id },
      });
      if (existingCategory) {
        return res.status(409).json({
          error: 'A category with this slug already exists',
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

    const category = await TaskCategory.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    return res.status(200).json({
      message: 'Category updated successfully',
      category,
    });
  } catch (error) {
    console.error('Error updating category:', error);
    return res.status(500).json({
      error: 'Failed to update category',
      details: error.message,
    });
  }
});

// DELETE - Delete a category
router.delete('/', async (req, res) => {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Category ID is required' });
    }

    const category = await TaskCategory.findByIdAndDelete(id);

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    return res.status(200).json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting category:', error);
    return res.status(500).json({
      error: 'Failed to delete category',
      details: error.message,
    });
  }
});

module.exports = router;

