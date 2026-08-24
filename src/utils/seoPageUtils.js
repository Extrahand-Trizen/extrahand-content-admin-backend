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

module.exports = {
  generateSlug,
  generateCanonicalUrl,
  generateFaqSchema,
  generateBreadcrumbSchema,
  replaceLocationName,
};
