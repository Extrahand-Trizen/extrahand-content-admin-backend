const express = require("express");
const router = express.Router();
const TaskSubcategory = require("../models/TaskSubcategory");
const TaskCategory = require("../models/TaskCategory");
const authenticate = require("../middleware/auth");
const optionalAuth = require("../middleware/auth").optionalAuth;
const allowRoles = require("../middleware/roles");
const multer = require("multer");

// Configure Multer for memory storage (files will be available in req.files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

const normalizeNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// Helper to set nested properties from form-data field names
// e.g. "topTaskers[0][profileImage]" -> body.topTaskers[0].profileImage
const setNestedProperty = (obj, path, value) => {
  const keys = path.replace(/\]/g, "").split("[");
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!current[key]) {
      // If we are creating a new path, assume array if next key is numeric
      current[key] = isNaN(keys[i + 1]) ? {} : [];
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
};

// GET - Fetch all subcategories or a single subcategory by slug
router.get("/", optionalAuth, async (req, res) => {
  try {
    const { slug, categorySlug, preview } = req.query;

    if (slug) {
      const isPreview = preview === "1" || preview === "true";
      const canPreview =
        isPreview &&
        req.user &&
        ["writer", "reviewer", "content_access_manager"].includes(req.user.role);

      const slugCandidates = [slug];
      if (categorySlug && !slug.includes("/")) {
        slugCandidates.push(`${categorySlug}/${slug}`);
      }

      const filter = { slug: { $in: slugCandidates } };
      if (categorySlug) {
        filter.categorySlug = categorySlug;
      }
      if (!canPreview) {
        // Only return published subcategory (unpublished must not be visible on main website)
        filter.$or = [{ isPublished: true }, { status: 'PUBLISHED' }];
      }

      const subcategory = await TaskSubcategory.findOne(filter).populate(
        "createdBy",
        "name email",
      );

      if (!subcategory) {
        return res.status(404).json({ error: "Subcategory not found" });
      }
      return res.status(200).json(subcategory);
    }

    const isContentAccessManager =
      req.user && req.user.role === "content_access_manager";
    const isReviewer = req.user && req.user.role === "reviewer";
    let filter;
    if (isContentAccessManager) {
      filter = {};
    } else if (isReviewer) {
      filter = {
        status: {
          $in: ["PENDING_APPROVAL", "APPROVED", "PUBLISHED", "REJECTED"],
        },
      };
    } else {
      filter = { $or: [{ isPublished: true }, { status: 'PUBLISHED' }] };
    }
    
    // Optional author filter for content_access_manager
    const { author } = req.query;
    if (author && isContentAccessManager) {
      filter.createdBy = author;
    }

    // Lean list: only fields needed for list view (avoids sending hero, staticTasks, earnings, etc.)
    const listFields = "name slug categorySlug status isPublished createdBy createdAt updatedAt";

    if (categorySlug) {
      const subcategories = await TaskSubcategory.find({
        categorySlug,
        ...filter,
      })
        .select(listFields)
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 })
        .limit(2000)
        .lean();

      if (subcategories.length > 0) {
        return res.status(200).json(subcategories);
      }

      // Backward-compatible fallback: derive a single subcategory from legacy fields on TaskCategory
      const parentCategory = await TaskCategory.findOne({ slug: categorySlug })
        .select("subcategory subcategorySlug isPublished status")
        .lean();

      const shouldExposeLegacy =
        parentCategory &&
        parentCategory.subcategory &&
        parentCategory.subcategorySlug &&
        (!filter.$or || parentCategory.isPublished === true || parentCategory.status === "PUBLISHED");

      if (shouldExposeLegacy) {
        return res.status(200).json([
          {
            name: parentCategory.subcategory,
            slug: parentCategory.subcategorySlug,
            categorySlug,
            status: "PUBLISHED",
            isPublished: true,
          },
        ]);
      }

      return res.status(200).json([]);
    }

    const subcategories = await TaskSubcategory.find(filter)
      .select(listFields)
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .limit(2000)
      .lean();
    return res.status(200).json(subcategories);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error fetching subcategories:", error);
    }
    return res.status(500).json({ error: "Failed to fetch subcategories" });
  }
});

// GET - Fetch only subcategories created by the current user (writer only) - also exported for explicit registration in server
async function mineHandler(req, res) {
  try {
    const listFields = "name slug categorySlug status isPublished createdBy createdAt updatedAt";

    // Subcategories created by the current user
    const owned = await TaskSubcategory.find({ createdBy: req.user._id })
      .select(listFields)
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .lean();

    // Backfill legacy subcategories that lack createdBy by using parent category ownership
    const parentCategories = await TaskCategory.find({ createdBy: req.user._id }).select("slug").lean();
    const parentSlugs = parentCategories.map((cat) => cat.slug);

    let inferred = [];
    if (parentSlugs.length > 0) {
      inferred = await TaskSubcategory.find({
        createdBy: { $in: [null, undefined] },
        categorySlug: { $in: parentSlugs },
      })
        .select(listFields)
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 })
        .lean();

      if (inferred.length > 0) {
        const inferredIds = inferred.map((item) => item._id);
        await TaskSubcategory.updateMany(
          { _id: { $in: inferredIds }, createdBy: { $in: [null, undefined] } },
          { $set: { createdBy: req.user._id } }
        );
      }
    }

    const combined = [...owned, ...inferred];
    const seen = new Set();
    const unique = combined.filter((item) => {
      const id = item._id.toString();
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    return res.status(200).json(unique);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error fetching my subcategories:", error);
    }
    return res.status(500).json({ error: "Failed to fetch subcategories" });
  }
}
router.get("/mine", authenticate, allowRoles("writer"), mineHandler);

// POST - Create a new subcategory (Writer and Manager only)
router.post(
  "/",
  authenticate,
  allowRoles("writer", "reviewer", "content_access_manager"),
  upload.any(),
  async (req, res) => {
    try {
      // Process uploaded files: Convert buffer to Base64 and assign to body
      if (req.files && req.files.length > 0) {
        req.files.forEach((file) => {
          const base64 = `data:${file.mimetype};base64,${file.buffer.toString(
            "base64",
          )}`;
          setNestedProperty(req.body, file.fieldname, base64);
        });
      }

      const body = req.body;
      const { imageFile, ...cleanBody } = body;

      const { name, slug, categorySlug, heroTitle, heroDescription } =
        cleanBody;

      if (!name || !slug || !categorySlug || !heroTitle || !heroDescription) {
        return res.status(400).json({
          error:
            "Name, slug, categorySlug, heroTitle, and heroDescription are required",
        });
      }

      const parentCategory = await TaskCategory.findOne({ slug: categorySlug });
      if (!parentCategory) {
        return res.status(404).json({
          error: "Parent category not found. Please create the category first.",
          message: `The parent category with slug "${categorySlug}" does not exist in the database. Please create the main category before adding subcategories.`,
          categorySlug: categorySlug,
          suggestion: 'Create the main category first, then add subcategories to it.'
        });
      }

      if (parentCategory.name && parentCategory.name.trim().toLowerCase() === name.trim().toLowerCase()) {
        return res.status(400).json({
          error: 'Subcategory name cannot match the parent category name',
        });
      }

      const existingSubcategory = await TaskSubcategory.findOne({ slug });
      let originalSubcategoryId = null;
      let docToUpdate = null;

      if (existingSubcategory) {
        // If the existing one is published, allow creating a draft version
        if (existingSubcategory.isPublished) {
          // Check if a draft already exists for this published subcategory
          const existingDraft = await TaskSubcategory.findOne({
            originalSubcategoryId: existingSubcategory._id,
            status: { $in: ["DRAFT", "PENDING_APPROVAL", "REJECTED"] },
          });

          if (existingDraft) {
            // Instead of error, we treat this as an update to the draft (Upsert behavior)
            docToUpdate = existingDraft;
          } else {
            // Link to the original, will create new draft
            originalSubcategoryId = existingSubcategory._id;
          }
        } else {
          // Existing is a draft/pending, treat as update to this document (Upsert behavior)
          docToUpdate = existingSubcategory;
        }
      }

      const whyJoinFeatures =
        cleanBody.whyJoinFeatures &&
          Array.isArray(cleanBody.whyJoinFeatures) &&
          cleanBody.whyJoinFeatures.length > 0
          ? cleanBody.whyJoinFeatures
          : [
            {
              title: "All on your terms",
              description:
                "See a job that fits your skills and timeframe? Go for it. Extrahand's flexible to your schedule.",
            },
            {
              title: "Get going for free",
              description:
                "Check tasks and get going straight away. Services fees occur when you've completed the task.",
            },
            {
              title: "Secure payments",
              description:
                "Nobody likes chasing money, so we secure customer payments upfront. When a task is marked complete, your bank account will know about it.",
            },
            {
              title: "Skills can thrill",
              description:
                "Never thought your knack for crocheting would be useful? Think again. We're all about earning from unexpected skills at Extrahand.",
            },
          ];

      let cleanedStaticTasks = [];
      if (cleanBody.staticTasks && Array.isArray(cleanBody.staticTasks)) {
        cleanedStaticTasks = cleanBody.staticTasks.map((task) => {
          if (!task || typeof task !== "object") return task;
          const { profileImageFile, ...cleanTask } = task;
          return cleanTask;
        });
      }

      let cleanedTopTaskers = [];
      if (cleanBody.topTaskers && Array.isArray(cleanBody.topTaskers)) {
        cleanedTopTaskers = cleanBody.topTaskers.map((tasker) => {
          if (!tasker || typeof tasker !== "object") return tasker;
          const { profileImageFile, ...cleanTasker } = tasker;
          return cleanTasker;
        });
      }

      const subcategoryData = {
        name: cleanBody.name,
        slug: cleanBody.slug,
        categorySlug: cleanBody.categorySlug,
        createdBy: req.user._id,
        heroTitle: cleanBody.heroTitle,
        heroDescription: cleanBody.heroDescription,
        heroImage: cleanBody.heroImage || '',
        ratingValue: cleanBody.ratingValue || '',
        ratingText: cleanBody.ratingText || '',
        reviewsCount: cleanBody.reviewsCount || '',
        reviews: Array.isArray(cleanBody.reviews) ? cleanBody.reviews : [],
        posterCostTitle: cleanBody.posterCostTitle || '',
        posterCostLow: cleanBody.posterCostLow || '',
        posterCostHigh: cleanBody.posterCostHigh || '',
        posterCostMedian: cleanBody.posterCostMedian || '',
        posterCostTasksCount: normalizeNumber(cleanBody.posterCostTasksCount, 0),
        posterCostDistribution: Array.isArray(cleanBody.posterCostDistribution) ? cleanBody.posterCostDistribution : [],
        posterAvgRating: cleanBody.posterAvgRating || '',
        posterAvgReviewsCount: cleanBody.posterAvgReviewsCount || '',
        posterRatingBreakdown: cleanBody.posterRatingBreakdown || {},
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
        whyBookTitle: cleanBody.whyBookTitle || '',
        whyBookDescription: cleanBody.whyBookDescription || '',
        whyBookFeatures: Array.isArray(cleanBody.whyBookFeatures) ? cleanBody.whyBookFeatures : [],
        staticTasksSectionTitle: cleanBody.staticTasksSectionTitle || `${cleanBody.name} tasks in Hyderabad`,
        staticTasksSectionDescription: cleanBody.staticTasksSectionDescription || 'Check out what tasks people want done near you right now...',
        staticTasks: Array.isArray(cleanedStaticTasks) ? cleanedStaticTasks : [],
        browseAllTasksButtonText: cleanBody.browseAllTasksButtonText || 'Browse all tasks',
        lastUpdatedText: cleanBody.lastUpdatedText || '',
        whatTheyDoTitle: cleanBody.whatTheyDoTitle || '',
        whatTheyDoSections: Array.isArray(cleanBody.whatTheyDoSections) ? cleanBody.whatTheyDoSections : [],
        categoryServicesList: Array.isArray(cleanBody.categoryServicesList) ? cleanBody.categoryServicesList : [],
        relatedServicesNearMe: Array.isArray(cleanBody.relatedServicesNearMe) ? cleanBody.relatedServicesNearMe : [],
        topLocationsList: Array.isArray(cleanBody.topLocationsList) ? cleanBody.topLocationsList : [],
        relatedLocations: Array.isArray(cleanBody.relatedLocations) ? cleanBody.relatedLocations : [],
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

      if (docToUpdate) {
        const updatePayload = { ...subcategoryData };
        if (originalSubcategoryId) {
          updatePayload.originalSubcategoryId = originalSubcategoryId;
        }
        await TaskSubcategory.findByIdAndUpdate(docToUpdate._id, updatePayload, {
          new: true,
          runValidators: true,
        });
        const savedSubcategory = await TaskSubcategory.findById(docToUpdate._id).lean();
        return res.status(200).json({
          message: "Subcategory updated successfully",
          subcategory: savedSubcategory,
        });
      } else {
        const createPayload = { ...subcategoryData };
        if (originalSubcategoryId) {
          createPayload.originalSubcategoryId = originalSubcategoryId;
        }
        const subcategory = await TaskSubcategory.create(createPayload);
        const savedSubcategory = await TaskSubcategory.findById(subcategory._id).lean();
        return res.status(201).json({
          message: "Subcategory created successfully",
          subcategory: savedSubcategory,
        });
      }
    } catch (error) {
      console.error("Error creating/updating subcategory:", error);
      return res.status(500).json({
        error: "Failed to create/update subcategory",
        details: error.message,
      });
    }
  },
);

// PUT - Update an existing subcategory
router.put(
  "/:id",
  authenticate,
  allowRoles("writer", "reviewer", "content_access_manager"),
  upload.any(),
  async (req, res) => {
    try {
      // Process uploaded files: Convert buffer to Base64 and assign to body
      if (req.files && req.files.length > 0) {
        req.files.forEach((file) => {
          const base64 = `data:${file.mimetype};base64,${file.buffer.toString(
            "base64",
          )}`;
          setNestedProperty(req.body, file.fieldname, base64);
        });
      }

      const { id } = req.params; // Get ID from URL params instead of body
      const body = req.body;
      const { imageFile, ...updateData } = body;

      if (updateData.footer && typeof updateData.footer === "object") {
        const { appleStoreImageFile, googlePlayImageFile, ...cleanFooter } =
          updateData.footer;
        updateData.footer = cleanFooter;
      }

      if (!id) {
        return res.status(400).json({ error: "Subcategory ID is required" });
      }

      // Find the existing subcategory
      const existingSubcategory = await TaskSubcategory.findById(id);
      if (!existingSubcategory) {
        return res.status(404).json({ error: "Subcategory not found" });
      }

      // Validate against parent category name
      const effectiveCategorySlug = updateData.categorySlug || existingSubcategory.categorySlug;
      const effectiveName = updateData.name || existingSubcategory.name;
      if (effectiveCategorySlug && effectiveName) {
        const parentCategory = await TaskCategory.findOne({ slug: effectiveCategorySlug });
        if (parentCategory && parentCategory.name && parentCategory.name.trim().toLowerCase() === effectiveName.trim().toLowerCase()) {
          return res.status(400).json({
            error: 'Subcategory name cannot match the parent category name',
          });
        }
      }

      // Check permissions: only creator or manager can edit
      if (
        existingSubcategory.createdBy &&
        existingSubcategory.createdBy.toString() !== req.user._id.toString() &&
        req.user.role !== "reviewer"
      ) {
        return res
          .status(403)
          .json({ error: "Not authorized to edit this subcategory" });
      }

      // Backfill createdBy for legacy subcategories missing it
      if (!existingSubcategory.createdBy) {
        existingSubcategory.createdBy = req.user._id;
        await existingSubcategory.save();
      }

      // If subcategory is PUBLISHED or APPROVED, create a new draft version for re-approval (writers only)
      if (
        (existingSubcategory.status === "PUBLISHED" ||
          existingSubcategory.status === "APPROVED") &&
        req.user.role === "writer"
      ) {
        // Check if there's already a draft version of this subcategory
        const existingDraft = await TaskSubcategory.findOne({
          originalSubcategoryId: existingSubcategory._id,
          status: { $in: ["DRAFT", "PENDING_APPROVAL", "REJECTED"] },
        });

        // Prepare clean data; preserve profileImage so image updates persist
        if (updateData.staticTasks && Array.isArray(updateData.staticTasks)) {
          updateData.staticTasks = updateData.staticTasks.map((task) => {
            const { profileImageFile, ...rest } = task;
            return {
              ...rest,
              profileImage:
                rest.profileImage !== undefined ? rest.profileImage : "",
            };
          });
        }

        if (updateData.topTaskers && Array.isArray(updateData.topTaskers)) {
          updateData.topTaskers = updateData.topTaskers.map((tasker) => {
            const { profileImageFile, ...rest } = tasker;
            return {
              ...rest,
              profileImage:
                rest.profileImage !== undefined ? rest.profileImage : "",
            };
          });
        }

        if (existingDraft) {
          // Update the existing draft instead of creating a new one
          Object.keys(updateData).forEach((key) => {
            if (
              key !== "_id" &&
              key !== "createdBy" &&
              key !== "originalSubcategoryId" &&
              key !== "isCurrentVersion"
            ) {
              existingDraft[key] = updateData[key];
              existingDraft.markModified(key); // Ensure Mongoose persists nested arrays/objects (sections)
            }
          });

          // If it was rejected, move back to draft
          if (existingDraft.status === "REJECTED") {
            existingDraft.status = "DRAFT";
            existingDraft.reviewNotes = "";
            existingDraft.reviewedBy = null;
            existingDraft.reviewedAt = null;
          }

          await existingDraft.save();

          return res.status(200).json({
            message:
              "Draft version updated. Original subcategory remains published.",
            subcategory: existingDraft,
            isExistingDraft: true,
          });
        }

        // No existing draft found, create a new draft version
        const newVersionData = {
          ...existingSubcategory.toObject(),
          ...updateData,
          _id: undefined,
          status: "DRAFT",
          isPublished: false,
          createdBy: req.user._id,
          originalSubcategoryId: existingSubcategory._id,
          isCurrentVersion: false,
          reviewedBy: null,
          reviewedAt: null,
          reviewNotes: "",
          publishedBy: null,
          publishedAt: null,
          createdAt: undefined,
          updatedAt: undefined,
        };

        const newVersion = new TaskSubcategory(newVersionData);
        await newVersion.save();

        return res.status(200).json({
          message:
            "New draft version created for approval. Original subcategory remains published.",
          subcategory: newVersion,
          isNewVersion: true,
        });
      }

      // For DRAFT, PENDING, or REJECTED status - direct edit is allowed
      if (updateData.slug) {
        const slugConflict = await TaskSubcategory.findOne({
          slug: updateData.slug,
          _id: { $ne: id },
        });
        if (slugConflict) {
          return res.status(409).json({
            error: "A subcategory with this slug already exists",
          });
        }
      }

      if (updateData.staticTasks && Array.isArray(updateData.staticTasks)) {
        updateData.staticTasks = updateData.staticTasks.map((task) => {
          const { profileImageFile, ...rest } = task;
          return {
            ...rest,
            profileImage:
              rest.profileImage !== undefined ? rest.profileImage : "",
          };
        });
      }

      if (updateData.topTaskers && Array.isArray(updateData.topTaskers)) {
        updateData.topTaskers = updateData.topTaskers.map((tasker) => {
          const { profileImageFile, ...rest } = tasker;
          return {
            ...rest,
            profileImage:
              rest.profileImage !== undefined ? rest.profileImage : "",
          };
        });
      }

      if (Object.prototype.hasOwnProperty.call(updateData, "posterCostTasksCount")) {
        updateData.posterCostTasksCount = normalizeNumber(
          updateData.posterCostTasksCount,
          0,
        );
      }

      // If subcategory was rejected, move back to draft on edit
      const docToUpdate = await TaskSubcategory.findById(id);
      if (!docToUpdate) {
        return res.status(404).json({ error: "Subcategory not found" });
      }
      if (docToUpdate.status === "REJECTED" && req.user.role === "writer") {
        updateData.status = "DRAFT";
        updateData.reviewNotes = "";
      }

      // Assign and save so nested arrays (topTaskers/staticTasks with profileImage) persist correctly
      Object.keys(updateData).forEach((key) => {
        if (key !== "_id" && key !== "createdBy") {
          docToUpdate[key] = updateData[key];
          docToUpdate.markModified(key); // Ensure Mongoose persists nested arrays/objects (sections)
        }
      });
      await docToUpdate.save();
      const subcategory = await TaskSubcategory.findById(id).lean();

      return res.status(200).json({
        message: "Subcategory updated successfully",
        subcategory,
      });
    } catch (error) {
      console.error("Error updating subcategory:", error);
      return res.status(500).json({
        error: "Failed to update subcategory",
        details: error.message,
      });
    }
  },
);

// DELETE - Delete a subcategory
router.delete(
  "/:id",
  authenticate,
  allowRoles("writer", "reviewer", "content_access_manager"),
  async (req, res) => {
    try {
      const { id } = req.params; // Get ID from URL params instead of query

      if (!id) {
        return res.status(400).json({ error: "Subcategory ID is required" });
      }

      const subcategory = await TaskSubcategory.findById(id);

      if (!subcategory) {
        return res.status(404).json({ error: "Subcategory not found" });
      }

      // Check permissions: only creator or manager can delete
      if (
        subcategory.createdBy &&
        subcategory.createdBy.toString() !== req.user._id.toString() &&
        !["reviewer", "content_access_manager"].includes(req.user.role)
      ) {
        return res
          .status(403)
          .json({ error: "Not authorized to delete this subcategory" });
      }

      // Prevent deletion of published subcategories by non-managers
      if (
        subcategory.status === "PUBLISHED" &&
        !["reviewer", "content_access_manager"].includes(req.user.role)
      ) {
        return res.status(403).json({
          error: "Cannot delete published subcategories. Contact manager.",
        });
      }

      await TaskSubcategory.findByIdAndDelete(id);

      return res
        .status(200)
        .json({ message: "Subcategory deleted successfully" });
    } catch (error) {
      console.error("Error deleting subcategory:", error);
      return res.status(500).json({
        error: "Failed to delete subcategory",
        details: error.message,
      });
    }

  },
);

// POST - Submit subcategory for approval (Writer and Manager)
router.post(
  "/submit/:id",
  authenticate,
  allowRoles("writer", "reviewer", "content_access_manager"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const subcategory = await TaskSubcategory.findById(id);

      if (!subcategory) {
        return res.status(404).json({ error: "Subcategory not found" });
      }

      // Check ownership - managers can submit any, writers only their own
      if (
        !["reviewer", "content_access_manager"].includes(req.user.role) &&
        subcategory.createdBy &&
        subcategory.createdBy.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Only draft or rejected subcategories can be submitted
      if (!["DRAFT", "REJECTED"].includes(subcategory.status)) {
        return res
          .status(400)
          .json({ error: "Subcategory cannot be submitted for approval" });
      }

      subcategory.status = "PENDING_APPROVAL";
      subcategory.reviewNotes = "";
      await subcategory.save();

      return res.status(200).json({
        message: "Subcategory submitted for approval",
        subcategory,
      });
    } catch (error) {
      console.error("Error submitting subcategory:", error);
      return res.status(500).json({ error: "Failed to submit subcategory" });
    }
  },
);
module.exports = router;
module.exports.mineHandler = mineHandler;
