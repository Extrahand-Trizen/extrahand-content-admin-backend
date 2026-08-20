function generateSlug(categorySlug, citySlug, areaSlug) {
  if (areaSlug) return `${categorySlug}-in-${areaSlug}`;
  return `${categorySlug}-in-${citySlug}`;
}

function generateCanonicalUrl(pageType, citySlug, areaSlug, slug) {
  return `https://extrahand.in/${slug}`;
}

function generateFaqSchema(faqs) {
  if (!faqs || !Array.isArray(faqs) || faqs.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

function generateBreadcrumbSchema(pageType, cityName, citySlug, areaName, areaSlug, categoryName, slug) {
  if (pageType === 'area') {
    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://extrahand.in/' },
        { '@type': 'ListItem', position: 2, name: cityName, item: `https://extrahand.in/locations/${citySlug}` },
        { '@type': 'ListItem', position: 3, name: areaName, item: `https://extrahand.in/locations/${citySlug}/${areaSlug}` },
        { '@type': 'ListItem', position: 4, name: `${categoryName} in ${areaName}`, item: `https://extrahand.in/${slug}` },
      ],
    };
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://extrahand.in/' },
      { '@type': 'ListItem', position: 2, name: cityName, item: `https://extrahand.in/locations/${citySlug}` },
      { '@type': 'ListItem', position: 3, name: `${categoryName} in ${cityName}`, item: `https://extrahand.in/${slug}` },
    ],
  };
}

function replaceLocationName(content, fromName, toName) {
  if (!content) return content;
  const replaceInString = (str) => {
    if (typeof str !== 'string') return str;
    const regex = new RegExp(fromName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return str.replace(regex, toName);
  };

  if (typeof content === 'string') return replaceInString(content);

  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === 'string') return replaceInString(item);
      if (item && typeof item === 'object') {
        const result = {};
        for (const key of Object.keys(item)) {
          result[key] = replaceLocationName(item[key], fromName, toName);
        }
        return result;
      }
      return item;
    });
  }

  if (content && typeof content === 'object') {
    const result = {};
    for (const key of Object.keys(content)) {
      result[key] = replaceLocationName(content[key], fromName, toName);
    }
    return result;
  }

  return content;
}

const City = require('../models/City');
const Area = require('../models/Area');

const KNOWN_CITY_NAMES = {
  hyderabad: 'Hyderabad', bangalore: 'Bangalore', mumbai: 'Mumbai',
  delhi: 'Delhi', chennai: 'Chennai', pune: 'Pune', kolkata: 'Kolkata',
  ahmedabad: 'Ahmedabad', surat: 'Surat', jaipur: 'Jaipur',
  noida: 'Noida', gurugram: 'Gurugram',
};

const KNOWN_AREA_NAMES = {
  'ameerpet': { name: 'Ameerpet', citySlug: 'hyderabad' },
  'banjara-hills': { name: 'Banjara Hills', citySlug: 'hyderabad' },
  'begumpet': { name: 'Begumpet', citySlug: 'hyderabad' },
  'gachibowli': { name: 'Gachibowli', citySlug: 'hyderabad' },
  'hitec-city': { name: 'Hitec City', citySlug: 'hyderabad' },
  'jubilee-hills': { name: 'Jubilee Hills', citySlug: 'hyderabad' },
  'kondapur': { name: 'Kondapur', citySlug: 'hyderabad' },
  'kukatpally': { name: 'Kukatpally', citySlug: 'hyderabad' },
  'madhapur': { name: 'Madhapur', citySlug: 'hyderabad' },
  'miyapur': { name: 'Miyapur', citySlug: 'hyderabad' },
  'secunderabad': { name: 'Secunderabad', citySlug: 'hyderabad' },
  'uppal': { name: 'Uppal', citySlug: 'hyderabad' },
};

function isMongoObjectId(value) {
  return /^[a-f\d]{24}$/i.test(value);
}

async function findCityByIdOrSlug(value) {
  if (!value) return null;
  if (isMongoObjectId(value)) {
    const city = await City.findById(value);
    if (city) return city;
  }
  let city = await City.findOne({ slug: value });
  if (!city && KNOWN_CITY_NAMES[value]) {
    city = await City.create({ name: KNOWN_CITY_NAMES[value], slug: value });
  }
  return city;
}

async function findAreaByIdOrSlug(value, cityDoc) {
  if (!value) return null;
  if (isMongoObjectId(value)) {
    const area = await Area.findById(value);
    if (area) return area;
  }
  let area = await Area.findOne({ slug: value });
  if (!area && KNOWN_AREA_NAMES[value]) {
    const meta = KNOWN_AREA_NAMES[value];
    let city = cityDoc;
    if (!city) {
      city = await City.findOne({ slug: meta.citySlug });
      if (!city) {
        city = await City.create({ name: KNOWN_CITY_NAMES[meta.citySlug] || meta.citySlug, slug: meta.citySlug });
      }
    }
    area = await Area.create({ name: meta.name, slug: value, cityId: city._id });
  }
  if (!area && value && !isMongoObjectId(value)) {
    const cityRef = cityDoc;
    if (cityRef) {
      const derivedName = value.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      area = await Area.create({ name: derivedName, slug: value, cityId: cityRef._id });
    }
  }
  return area;
}

module.exports = {
  generateSlug,
  generateCanonicalUrl,
  generateFaqSchema,
  generateBreadcrumbSchema,
  replaceLocationName,
  isMongoObjectId,
  findCityByIdOrSlug,
  findAreaByIdOrSlug,
};
