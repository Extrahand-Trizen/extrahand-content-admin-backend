const { randomUUID } = require('crypto');

function getRequestId(req) {
  if (!req.seoContentDiagnosticRequestId) {
    const incomingId = req.get('x-request-id') || req.get('x-correlation-id');
    req.seoContentDiagnosticRequestId =
      typeof incomingId === 'string' && incomingId.length <= 128
        ? incomingId
        : randomUUID();
  }
  return req.seoContentDiagnosticRequestId;
}

function toPlainText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeSeoContent(page) {
  const blocks = page && Array.isArray(page.seoContentBlocks) ? page.seoContentBlocks : [];

  return {
    seoContentBlocks: blocks.map((block) => ({
      name: block && typeof block.title === 'string' ? block.title : '',
      content: [
        toPlainText(block && block.html),
        ...(Array.isArray(block && block.faqs)
          ? block.faqs.flatMap((faq) => [
            toPlainText(faq && faq.question),
            toPlainText(faq && faq.answer),
          ])
          : []),
      ].filter(Boolean).join(' ').slice(0, 500),
    })),
  };
}

function logSeoContentDiagnostic(req, event, details = {}, page) {
  const slug =
    details.slug ||
    (page && (page.slug || page.categorySlug)) ||
    null;
  const entry = {
    event,
    slug,
    ...(page ? summarizeSeoContent(page) : {}),
    timestamp: new Date().toISOString(),
    requestId: getRequestId(req),
  };
  console.info(`[SEO_CONTENT] ${JSON.stringify(entry)}`);
}

module.exports = { logSeoContentDiagnostic, summarizeSeoContent };
