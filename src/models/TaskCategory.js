const mongoose = require('mongoose');

const CATEGORY_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PUBLISHED'];

const TaskCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      unique: true,
    },
    slug: {
      type: String,
      required: [true, 'Category slug is required'],
      trim: true,
      lowercase: true,
    },
    status: {
      type: String,
      enum: CATEGORY_STATUSES,
      default: 'DRAFT',
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewNotes: {
      type: String,
      default: '',
    },
    submissionNotes: {
      type: String,
      default: '',
    },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    // Version control for edits
    originalCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaskCategory',
      default: null,
    },
    isCurrentVersion: {
      type: Boolean,
      default: true,
    },
    subcategory: {
      type: String,
      trim: true,
    },
    subcategorySlug: {
      type: String,
      trim: true,
      lowercase: true,
    },
    // Category type: tasker-facing, poster-facing, or both
    categoryType: {
      type: String,
      trim: true, // e.g. "As A Tasker" or "As A Poster"
      default: "",
    },
    // Hero Section
    heroTitle: {
      type: String,
      required: [true, 'Hero title is required'],
      trim: true,
    },
    heroDescription: {
      type: String,
      required: [true, 'Hero description is required'],
      trim: true,
    },
    heroImage: {
      type: String,
      trim: true,
    },
    // Poster rating summary (for hero / social proof)
    ratingValue: {
      type: String,
      trim: true, // e.g. "4.2"
    },
    ratingText: {
      type: String,
      trim: true, // e.g. "Great rating - 4.2/5 (11114+ reviews)"
    },
    reviewsCount: {
      type: String,
      trim: true,
    },
    // Poster: recent reviews for this category (used on poster-facing category pages)
    reviews: [
      {
        reviewerName: {
          type: String,
          trim: true,
        },
        reviewerLocation: {
          type: String,
          trim: true,
        },
        rating: {
          type: String,
          trim: true,
        },
        text: {
          type: String,
          trim: true,
        },
        jobType: {
          type: String,
          trim: true,
        },
        price: {
          type: String,
          trim: true,
        },
      },
    ],
    // Poster: cost & rating summary shown in Airtasker-style poster layout
    posterCostTitle: {
      type: String,
      trim: true,
    },
    posterCostLow: {
      type: String,
      trim: true,
    },
    posterCostHigh: {
      type: String,
      trim: true,
    },
    posterCostMedian: {
      type: String,
      trim: true,
    },
    posterCostTasksCount: {
      type: String,
      trim: true,
    },
    posterAvgRating: {
      type: String,
      trim: true,
    },
    posterAvgReviewsCount: {
      type: String,
      trim: true,
    },
    // Poster: detailed star rating breakdown for the average reviews card
    posterRatingBreakdown: {
      fiveStar: {
        type: String,
        trim: true,
      },
      fourStar: {
        type: String,
        trim: true,
      },
      threeStar: {
        type: String,
        trim: true,
      },
      twoStar: {
        type: String,
        trim: true,
      },
      oneStar: {
        type: String,
        trim: true,
      },
    },
    // Earnings Card
    earningsCard: {
      weekly: {
        '1-2': { type: String, default: '₹240' },
        '3-5': { type: String, default: '₹600' },
        '5+': { type: String, default: '₹840+' },
      },
      monthly: {
        '1-2': { type: String, default: '₹1,039' },
        '3-5': { type: String, default: '₹2,598' },
        '5+': { type: String, default: '₹3,637+' },
      },
      yearly: {
        '1-2': { type: String, default: '₹12,480' },
        '3-5': { type: String, default: '₹31,200' },
        '5+': { type: String, default: '₹43,680+' },
      },
    },
    // Default earnings for the card (monthly)
    defaultEarnings: {
      type: String,
      default: '₹1,039',
    },
    earningsPeriod: {
      type: String,
      default: 'per month',
    },
    // Earnings by task range (per month)
    earnings1to2: {
      type: String,
      default: '₹1,039',
    },
    earnings3to5: {
      type: String,
      default: '₹2,598',
    },
    earnings5plus: {
      type: String,
      default: '₹3,637',
    },
    // Task count
    taskCount: {
      type: String,
      default: '500',
    },
    // Location
    location: {
      type: String,
      default: 'India',
    },
    // Earnings by job types (for the table)
    earningsByJobTypes: {
      weekly: mongoose.Schema.Types.Mixed,
      monthly: mongoose.Schema.Types.Mixed,
      yearly: mongoose.Schema.Types.Mixed,
    },
    // Disclaimer text
    disclaimer: {
      type: String,
      default: 'Based on average accounting task prices. Actual marketplace earnings may vary',
    },
    // Why Join Extrahand Section
    whyJoinTitle: {
      type: String,
      default: 'Why join Extrahand',
      trim: true,
    },
    whyJoinFeatures: [
      {
        title: {
          type: String,
          trim: true,
        },
        description: {
          type: String,
          trim: true,
        },
      },
    ],
    whyJoinButtonText: {
      type: String,
      default: 'Join Extrahand',
      trim: true,
    },
    // Poster: Why book this category through Extrahand
    whyBookTitle: {
      type: String,
      trim: true,
      default: 'Why book through Extrahand?',
    },
    whyBookDescription: {
      type: String,
      trim: true,
    },
    whyBookFeatures: [
      {
        title: {
          type: String,
          trim: true,
        },
        description: {
          type: String,
          trim: true,
        },
      },
    ],
    // Static Tasks Section
    staticTasksSectionTitle: {
      type: String,
      trim: true,
    },
    staticTasksSectionDescription: {
      type: String,
      trim: true,
      default: 'Check out what tasks people want done near you right now...',
    },
    browseAllTasksButtonText: {
      type: String,
      trim: true,
      default: 'Browse all tasks',
    },
    lastUpdatedText: {
      type: String,
      trim: true,
      default: '',
    },
    staticTasks: [
      {
        title: {
          type: String,
          trim: true,
        },
        price: {
          type: String,
          trim: true,
        },
        location: {
          type: String,
          trim: true,
        },
        description: {
          type: String,
          trim: true,
        },
        date: {
          type: String,
          trim: true,
        },
        timeAgo: {
          type: String,
          trim: true,
        },
        status: {
          type: String,
          default: 'Open',
          trim: true,
        },
        profileImage: {
          type: String,
          trim: true,
        },
        // Review fields (for tasks with reviews)
        hasReview: {
          type: Boolean,
          default: false,
        },
        reviewRating: {
          type: String,
          trim: true,
        },
        reviewText: {
          type: String,
          trim: true,
        },
        reviewerImages: [
          {
            type: String,
            trim: true,
          },
        ],
      },
    ],
    // Poster: cost & rating summary for the "Best rated experts" block
    posterCostTitle: {
      type: String,
      trim: true,
    },
    posterCostLow: {
      type: String,
      trim: true,
    },
    posterCostHigh: {
      type: String,
      trim: true,
    },
    posterCostMedian: {
      type: String,
      trim: true,
    },
    posterCostTasksCount: {
      type: Number,
      default: 0,
    },
    posterCostDistribution: [
      {
        label: {
          type: String,
          trim: true,
        },
        percentage: {
          type: Number,
          default: 0,
        },
      },
    ],
    posterAvgRating: {
      type: String,
      trim: true,
    },
    posterAvgReviewsCount: {
      type: String,
      trim: true,
    },
    // Earning Potential Section
    earningPotentialTitle: {
      type: String,
      trim: true,
      default: 'Discover your earning potential in India',
    },
    earningPotentialDescription: {
      type: String,
      trim: true,
      default: 'Earn money with every accounting task',
    },
    earningPotentialButtonText: {
      type: String,
      trim: true,
      default: 'Join Extrahand',
    },
    earningPotentialData: {
      weekly: {
        '1-2': { type: String, default: '₹240' },
        '3-5': { type: String, default: '₹600' },
        '5+': { type: String, default: '₹840+' },
      },
      monthly: {
        '1-2': { type: String, default: '₹1039' },
        '3-5': { type: String, default: '₹2598' },
        '5+': { type: String, default: '₹3637+' },
      },
      yearly: {
        '1-2': { type: String, default: '₹12480' },
        '3-5': { type: String, default: '₹31200' },
        '5+': { type: String, default: '₹43680+' },
      },
    },
    earningPotentialDisclaimer: {
      type: String,
      default: '*Based on average accounting task prices in India. Actual marketplace earnings may vary',
      trim: true,
    },
    // Income Opportunities Section
    incomeOpportunitiesTitle: {
      type: String,
      trim: true,
      default: 'Unlock new income opportunities in India',
    },
    incomeOpportunitiesDescription: {
      type: String,
      trim: true,
      default: 'Explore accounting related tasks and discover your financial opportunities',
    },
    incomeOpportunitiesData: {
      weekly: [
        {
          jobType: { type: String, trim: true },
          '1-2': { type: String, trim: true },
          '3-5': { type: String, trim: true },
          '5+': { type: String, trim: true },
        },
      ],
      monthly: [
        {
          jobType: { type: String, trim: true },
          '1-2': { type: String, trim: true },
          '3-5': { type: String, trim: true },
          '5+': { type: String, trim: true },
        },
      ],
      yearly: [
        {
          jobType: { type: String, trim: true },
          '1-2': { type: String, trim: true },
          '3-5': { type: String, trim: true },
          '5+': { type: String, trim: true },
        },
      ],
    },
    incomeOpportunitiesDisclaimer: {
      type: String,
      trim: true,
      default: '*Based on average accounting task prices in India. Actual marketplace earnings may vary',
    },
    // How to Earn Money Section
    howToEarnTitle: {
      type: String,
      trim: true,
      default: 'How to earn money on Extrahand',
    },
    howToEarnSteps: [
      {
        image: { type: String, trim: true },
        subtitle: { type: String, trim: true },
        description: { type: String, trim: true },
      },
    ],
    howToEarnButtonText: {
      type: String,
      trim: true,
      default: 'Post a task',
    },
    // SEO
    metaTitle: {
      type: String,
      trim: true,
    },
    metaDescription: {
      type: String,
      trim: true,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    // Task cards array (stored in database)
    tasks: [
      {
        title: {
          type: String,
          trim: true,
        },
        price: {
          type: String,
          trim: true,
        },
        description: {
          type: String,
          trim: true,
        },
        profileImage: {
          type: String,
          trim: true,
        },
      },
    ],
    // Get Inspired: Top Taskers Section (also reused for poster "Best rated experts" cards)
    getInspiredTitle: {
      type: String,
      trim: true,
      default: 'Get Inspired: Top Accounting Taskers in India',
    },
    getInspiredButtonText: {
      type: String,
      trim: true,
      default: 'Join Extrahand',
    },
    topTaskers: [
      {
        meetText: {
          type: String,
          trim: true,
          default: 'meet',
        },
        profileImage: {
          type: String,
          trim: true,
        },
        name: {
          type: String,
          trim: true,
        },
        yearsOnExtrahand: {
          type: String,
          trim: true,
        },
        location: {
          type: String,
          trim: true,
        },
        rating: {
          type: String,
          trim: true,
        },
        overallRatingText: {
          type: String,
          trim: true,
        },
        reviewsCount: {
          type: String,
          trim: true,
        },
        completionRate: {
          type: String,
          trim: true,
        },
        completionRateText: {
          type: String,
          trim: true,
        },
        tasksCount: {
          type: String,
          trim: true,
        },
        // Poster-specific additions
        latestReviewText: {
          type: String,
          trim: true,
        },
        isVerified: {
          type: Boolean,
          default: false,
        },
        isTopRated: {
          type: Boolean,
          default: false,
        },
        priceLabel: {
          type: String,
          trim: true,
        },
      },
    ],
    // We've Got You Covered Section
    insuranceCoverTitle: {
      type: String,
      trim: true,
      default: "We've got you covered",
    },
    insuranceCoverDescription: {
      type: String,
      trim: true,
      default: "Whether you're a posting a task or completing a task, you can do both with the peace of mind that Extrahand is there to support.",
    },
    insuranceCoverButtonText: {
      type: String,
      trim: true,
      default: "Extrahand's insurance cover",
    },
    insuranceCoverFeatures: [
      {
        icon: {
          type: String,
          trim: true,
          enum: ["human", "star"],
          default: "human",
        },
        subtitle: {
          type: String,
          trim: true,
        },
        subdescription: {
          type: String,
          trim: true,
        },
      },
    ],
    // Top Accounting related questions Section
    questionsTitle: {
      type: String,
      trim: true,
      default: "Top Accounting related questions",
    },
    questions: [
      {
        subtitle: {
          type: String,
          trim: true,
        },
        description: {
          type: String,
          trim: true,
        },
      },
    ],
    // Poster: What do these services include? (long-form explainer)
    whatTheyDoTitle: {
      type: String,
      trim: true,
    },
    whatTheyDoSections: [
      {
        heading: {
          type: String,
          trim: true,
        },
        body: {
          type: String,
          trim: true,
        },
      },
    ],
    // Poster: Services, Related Services, and Locations Section (3 columns)
    categoryServicesList: [
      {
        type: String,
        trim: true,
      },
    ],
    relatedServicesNearMe: [
      {
        type: String,
        trim: true,
      },
    ],
    relatedLocations:  [
      {
        type: String,
        trim: true,
      },
    ],
    topLocationsList: [
      {
        type: String,
        trim: true,
      },
    ],
    // Ways to earn money with accounting tasks section
    waysToEarnTitle: {
      type: String,
      trim: true,
      default: "Ways to earn money with accounting tasks on Extrahand",
    },
    waysToEarnContent: [
      {
        heading: {
          type: String,
          trim: true,
        },
        text: {
          type: String,
          trim: true,
        },
      },
    ],
    // Explore other ways to earn money section
    exploreOtherWaysTitle: {
      type: String,
      trim: true,
      default: "Explore other ways to earn money in India",
    },
    exploreOtherWaysImage: {
      type: String,
      trim: true,
    },
    exploreOtherWaysTasks: [
      {
        subtitle: {
          type: String,
          trim: true,
        },
        subheading: {
          type: String,
          trim: true,
        },
        image: {
          type: String,
          trim: true,
        },
      },
    ],
    exploreOtherWaysButtonText: {
      type: String,
      trim: true,
      default: "Explore more tasks",
    },
    exploreOtherWaysDisclaimer: {
      type: String,
      trim: true,
      default: "*Based on average prices from 1-2 completed tasks in India. Actual marketplace earnings may vary.",
    },
    // Top Locations Section
    topLocationsIcon: {
      type: String,
      trim: true,
      default: "location",
    },
    topLocationsTitle: {
      type: String,
      trim: true,
      default: "Browse our top locations",
    },
    topLocationsHeadings: {
      type: [String],
      default: [
        "Delhi",
        "Mumbai",
        "Kolkata",
        "Chennai",
        "Pune",
        "Surat",
        "Jaipur",
        "Bangalore",
        "Hyderabad",
        "Ahmedabad",
        "Noida",
        "Gurugram",
      ],
    },
    // Browse Similar Tasks Section
    browseSimilarTasksIcons: {
      type: [String],
      default: ["wrench", "brush", "pencil"],
    },
    browseSimilarTasksTitle: {
      type: String,
      trim: true,
      default: "Browse similar tasks near me",
    },
    browseSimilarTasksHeadings: {
      type: [String],
      default: [
        "Financial Modelling",
        "Financial Planning",
        "Financial Reporting",
      ],
    },
    // Footer Section
    footer: {
      discoverHeading: {
        type: String,
        trim: true,
        default: "Discover",
      },
      discoverLinks: {
        type: [String],
        default: [
          "How it works",
          "Extrahand for business",
          "Earn money",
          "Side Hustle Calculator",
          "Search tasks",
          "Cost Guides",
          "Service Guides",
          "Comparison Guides",
          "Gift Cards",
          "Student Discount",
          "Partners",
          "New users FAQ"
        ],
      },
      companyHeading: {
        type: String,
        trim: true,
        default: "Company",
      },
      companyLinks: {
        type: [String],
        default: [
          "About us",
          "Careers",
          "Media enquiries",
          "Community Guidelines",
          "Tasker Principles",
          "Terms and Conditions",
          "Blog",
          "Contact us",
          "Privacy policy",
          "Investors"
        ],
      },
      existingMembersHeading: {
        type: String,
        trim: true,
        default: "Existing Members",
      },
      existingMembersLinks: {
        type: [String],
        default: [
          "Post a task",
          "Browse tasks",
          "Login",
          "Support centre"
        ],
      },
      popularCategoriesHeading: {
        type: String,
        trim: true,
        default: "Popular Categories",
      },
      popularCategoriesLinks: {
        type: [String],
        default: [
          "Handyman Services",
          "Cleaning Services",
          "Delivery Services",
          "Removalists",
          "Gardening Services",
          "Auto Electricians",
          "Assembly Services",
          "All Services"
        ],
      },
      popularLocationsHeading: {
        type: String,
        trim: true,
        default: "Popular Locations",
      },
      popularLocations: {
        type: [String],
        default: [
          "Chennai",
          "Pune",
          "Surat",
          "Jaipur",
          "Bangalore",
          "Hyderabad",
          "Ahmedabad"
        ],
      },
      copyrightText: {
        type: String,
        trim: true,
        default: "Extrahand Limited 2011-2025 ©, All rights reserved",
      },
      appleStoreImage: {
        type: String,
        trim: true,
      },
      googlePlayImage: {
        type: String,
        trim: true,
      },
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// Create indexes for faster queries
TaskCategorySchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { isPublished: true } });
TaskCategorySchema.index({ isPublished: 1 });

module.exports = mongoose.model('TaskCategory', TaskCategorySchema);

