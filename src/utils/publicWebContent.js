/** Statuses that are live on the public ExtraHand website (excludes draft/pending/rejected). */
const PUBLIC_WEB_STATUSES = ['APPROVED', 'PUBLISHED'];

const publicWebStatusFilter = {
  status: { $in: PUBLIC_WEB_STATUSES },
};

function isPublicWebStatus(status) {
  return PUBLIC_WEB_STATUSES.includes(status);
}

module.exports = {
  PUBLIC_WEB_STATUSES,
  publicWebStatusFilter,
  isPublicWebStatus,
};
