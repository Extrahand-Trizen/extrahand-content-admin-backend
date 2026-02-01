const express = require('express');
const router = express.Router();
const TaskCategory = require('../models/TaskCategory');
const TaskSubcategory = require('../models/TaskSubcategory');
const authenticate = require('../middleware/auth');
const optionalAuth = require('../middleware/auth').optionalAuth;
const allowRoles = require('../middleware/roles');

// GET - Fetch all categories or a single category by slug (PUBLIC; optional auth for draft preview)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { slug } = req.query;

    if (slug) {
      // If authenticated writer/reviewer/manager, allow viewing own or any draft by slug
      if (req.user) {
        const allowedRoles = ['writer', 'reviewer', 'content_access_manager'];
        if (allowedRoles.includes(req.user.role)) {
          let item = await TaskCategory.findOne({ slug }).populate('createdBy', 'name email');
          if (item) {
            const isCreator = item.createdBy && item.createdBy._id && item.createdBy._id.toString() === req.user._id.toString();
            const isManager = ['reviewer', 'content_access_manager'].includes(req.user.role);
            if (isCreator || isManager) return res.status(200).json(item);
          }
          let subcategory = await TaskSubcategory.findOne({ slug }).populate('createdBy', 'name email');
          if (subcategory) {
            const isCreator = subcategory.createdBy && subcategory.createdBy._id && subcategory.createdBy._id.toString() === req.user._id.toString();
            const isManager = ['reviewer', 'content_access_manager'].includes(req.user.role);
            if (isCreator || isManager) {
              let parentCategory = null;
              if (subcategory.categorySlug) parentCategory = await TaskCategory.findOne({ slug: subcategory.categorySlug });
              const subcategoryObj = subcategory.toObject();
              subcategoryObj.categoryName = parentCategory ? parentCategory.name : subcategory.name;
              return res.status(200).json(subcategoryObj);
            }
          }
        }
      }

      // Public: published category only
      const item = await TaskCategory.findOne({ slug, isPublished: true })
        .populate('createdBy', 'name email');

      if (item) {
        return res.status(200).json(item);
      }

      // Public: published subcategory only
      const subcategory = await TaskSubcategory.findOne({ slug, isPublished: true })
        .populate('createdBy', 'name email');

      if (subcategory) {
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
      }

      return res.status(404).json({ error: 'Item not found' });
    }

    // List: content_access_manager = all; reviewer = pending + approved + published + rejected (no draft); unauthenticated = published only
    const isContentAccessManager = req.user && req.user.role === 'content_access_manager';
    const isReviewer = req.user && req.user.role === 'reviewer';
    let filter;
    if (isContentAccessManager) {
      filter = {};
    } else if (isReviewer) {
      filter = { status: { $in: ['PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'REJECTED'] } };
    } else {
      filter = { isPublished: true };
    }
    const categories = await TaskCategory.find(filter)
      .populate('createdBy', 'name email')
      .sort({ name: 1 });
    return res.status(200).json(categories);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching categories:', error);
    }
    return res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET - Fetch only categories created by the current user (writer only) - also exported for explicit registration in server
async function mineHandler(req, res) {
  try {
    const categories = await TaskCategory.find({ createdBy: req.user._id })
      .populate('createdBy', 'name email')
      .sort({ name: 1 });
    return res.status(200).json(categories);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching my categories:', error);
    }
    return res.status(500).json({ error: 'Failed to fetch categories' });
  }
}
router.get('/mine', authenticate, allowRoles('writer'), mineHandler);

// POST - Create a new category (Writer and Manager only)
router.post('/', authenticate, allowRoles('writer', 'reviewer', 'content_access_manager'), async (req, res) => {
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

    const existingName = await TaskCategory.findOne({ name });
    if (existingName) {
      return res.status(409).json({
        error: 'A category with this name already exists',
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
      status: req.user.role === 'reviewer' ? 'APPROVED' : 'DRAFT',
      isPublished: false,
      createdBy: req.user._id,
      tasks: cleanBody.tasks || [],
    };

    const category = await TaskCategory.create(categoryData);
    const savedCategory = await TaskCategory.findById(category._id).lean();

    return res.status(201).json({
      message: req.user.role === 'reviewer'
        ? 'Category created and approved. You can now publish it.'
        : 'Category saved as draft. Submit for approval when ready.',
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
router.put('/:id', authenticate, allowRoles('writer', 'reviewer', 'content_access_manager'), async (req, res) => {
  try {
    const { id } = req.params; // Get ID from URL params instead of body
    const body = req.body;
    const { imageFile, ...updateData } = body;

    if (updateData.footer && typeof updateData.footer === 'object') {
      const { appleStoreImageFile, googlePlayImageFile, ...cleanFooter } = updateData.footer;
      updateData.footer = cleanFooter;
    }

    if (!id) {
      return res.status(400).json({ error: 'Category ID is required' });
    }

    // Find the existing category
    const existingCategory = await TaskCategory.findById(id);
    if (!existingCategory) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check permissions: only creator or manager can edit
    if (existingCategory.createdBy && existingCategory.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'reviewer') {
      return res.status(403).json({ error: 'Not authorized to edit this category' });
    }

    // If category is PUBLISHED or APPROVED, create a new draft version for re-approval (writers only)
    if ((existingCategory.status === 'PUBLISHED' || existingCategory.status === 'APPROVED') && req.user.role === 'writer') {
      // Check if there's already a draft version of this category
      const existingDraft = await TaskCategory.findOne({
        originalCategoryId: existingCategory._id,
        status: { $in: ['DRAFT', 'PENDING_APPROVAL', 'REJECTED'] }
      });

      // Prepare clean data
      if (updateData.staticTasks && Array.isArray(updateData.staticTasks)) {
        updateData.staticTasks = updateData.staticTasks.map(task => {
          const { profileImageFile, ...cleanTask } = task;
          return cleanTask;
        });
      }

      if (updateData.topTaskers && Array.isArray(updateData.topTaskers)) {
        updateData.topTaskers = updateData.topTaskers.map(tasker => {
          const { profileImageFile, ...rest } = tasker;
          return { ...rest, profileImage: rest.profileImage !== undefined ? rest.profileImage : '' };
        });
      }

      if (existingDraft) {
        // Update the existing draft instead of creating a new one
        Object.keys(updateData).forEach((key) => {
          if (key !== '_id' && key !== 'createdBy' && key !== 'originalCategoryId' && key !== 'isCurrentVersion') {
            existingDraft[key] = updateData[key];
            existingDraft.markModified(key); // Ensure Mongoose persists nested arrays/objects
          }
        });

        // If it was rejected, move back to draft
        if (existingDraft.status === 'REJECTED') {
          existingDraft.status = 'DRAFT';
          existingDraft.reviewNotes = '';
          existingDraft.reviewedBy = null;
          existingDraft.reviewedAt = null;
        }

        await existingDraft.save();

        return res.status(200).json({
          message: 'Draft version updated. Original category remains published.',
          category: existingDraft,
          isExistingDraft: true,
        });
      }

      // No existing draft found, create a new draft version
      const newVersionData = {
        ...existingCategory.toObject(),
        ...updateData,
        _id: undefined,
        status: 'DRAFT',
        isPublished: false,
        createdBy: req.user._id,
        originalCategoryId: existingCategory._id,
        isCurrentVersion: false,
        reviewedBy: null,
        reviewedAt: null,
        reviewNotes: '',
        publishedBy: null,
        publishedAt: null,
        createdAt: undefined,
        updatedAt: undefined,
      };

      const newVersion = new TaskCategory(newVersionData);
      await newVersion.save();

      return res.status(200).json({
        message: 'New draft version created for approval. Original category remains published.',
        category: newVersion,
        isNewVersion: true,
      });
    }

    // For DRAFT, PENDING, or REJECTED status - direct edit is allowed
    if (updateData.name && updateData.name !== existingCategory.name) {
      const nameExists = await TaskCategory.findOne({
        name: updateData.name,
        _id: { $ne: id },
      });
      if (nameExists) {
        return res.status(409).json({
          error: 'A category with this name already exists',
        });
      }
    }

    if (updateData.slug && updateData.slug !== existingCategory.slug) {
      const slugExists = await TaskCategory.findOne({
        slug: updateData.slug,
        _id: { $ne: id },
      });
      if (slugExists) {
        return res.status(409).json({
          error: 'A category with this slug already exists',
        });
      }
    }

    if (updateData.staticTasks && Array.isArray(updateData.staticTasks)) {
      updateData.staticTasks = updateData.staticTasks.map(task => {
        const { profileImageFile, ...rest } = task;
        return { ...rest, profileImage: rest.profileImage !== undefined ? rest.profileImage : '' };
      });
    }

    if (updateData.topTaskers && Array.isArray(updateData.topTaskers)) {
      updateData.topTaskers = updateData.topTaskers.map(tasker => {
        const { profileImageFile, ...rest } = tasker;
        return { ...rest, profileImage: rest.profileImage !== undefined ? rest.profileImage : '' };
      });
    }

    // If category was rejected, move back to draft on edit
    if (existingCategory.status === 'REJECTED' && req.user.role === 'writer') {
      updateData.status = 'DRAFT';
      updateData.reviewNotes = '';
    }

    // Assign and save so nested arrays (topTaskers/staticTasks with profileImage) persist correctly
    Object.keys(updateData).forEach((key) => {
      if (key !== '_id' && key !== 'createdBy') {
        existingCategory[key] = updateData[key];
        existingCategory.markModified(key); // Ensure Mongoose persists nested arrays/objects (sections)
      }
    });
    await existingCategory.save();
    const category = await TaskCategory.findById(id).lean();

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

// DELETE - Delete a category (Writer and Manager only)
router.delete('/:id', authenticate, allowRoles('writer', 'reviewer', 'content_access_manager'), async (req, res) => {
  try {
    let { id } = req.params; // Get ID from URL params instead of query

    if (id) id = id.trim();

    if (!id) {
      return res.status(400).json({ error: 'Category ID is required' });
    }

    // Validate ID format
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid Category ID format' });
    }

    const category = await TaskCategory.findById(id);

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check permissions: only creator or manager can delete
    // Allow deletion if: 
    // 1. User is a manager (reviewer role), OR
    // 2. User is the creator of the category, OR
    // 3. Category has no creator (legacy data)
    if (!['reviewer', 'content_access_manager'].includes(req.user.role) && category.createdBy && category.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to delete this category' });
    }

    // Prevent deletion of published categories by non-managers
    if (category.status === 'PUBLISHED' && !['reviewer', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Cannot delete published categories. Contact manager.' });
    }

    // Allow deletion of DRAFT, PENDING_APPROVAL, REJECTED, and APPROVED (if creator or manager)

    await TaskCategory.findByIdAndDelete(id);

    return res.status(200).json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting category:', error);
    return res.status(500).json({
      error: 'Failed to delete category',
      details: error.message,
    });
  }
});

// POST - Submit category for approval (Writer and Manager)
router.post('/submit/:id', authenticate, allowRoles('writer', 'reviewer', 'content_access_manager'), async (req, res) => {
  try {
    let { id } = req.params;

    if (id) id = id.trim();

    // Validate ID format
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid Category ID format' });
    }

    const category = await TaskCategory.findById(id);

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check ownership - managers can submit any, writers only their own
    if (req.user.role !== 'reviewer' && req.user.role !== 'content_access_manager' && category.createdBy && category.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Only draft or rejected categories can be submitted
    if (!['DRAFT', 'REJECTED'].includes(category.status)) {
      return res.status(400).json({ error: 'Category cannot be submitted for approval' });
    }

    category.status = 'PENDING_APPROVAL';
    category.reviewNotes = '';

    if (req.body.submissionNotes) {
      category.submissionNotes = req.body.submissionNotes;
    }

    await category.save();

    return res.status(200).json({
      message: 'Category submitted for approval',
      category,
    });
  } catch (error) {
    console.error('Error submitting category:', error);
    return res.status(500).json({ error: 'Failed to submit category' });
  }
});

module.exports = router;
module.exports.mineHandler = mineHandler;

