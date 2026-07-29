/**
 * Aggregate document counts by `status` (and optional match), in one query.
 * Replaces N× countDocuments for dashboard / analytics.
 */
async function countByStatus(Model, match = {}) {
  const pipeline = [];
  if (match && Object.keys(match).length > 0) {
    pipeline.push({ $match: match });
  }
  pipeline.push({
    $group: {
      _id: '$status',
      count: { $sum: 1 },
    },
  });

  const rows = await Model.aggregate(pipeline);
  const byStatus = Object.create(null);
  let total = 0;
  for (const row of rows) {
    const key = row._id == null ? 'UNKNOWN' : String(row._id);
    byStatus[key] = row.count;
    total += row.count;
  }
  return { byStatus, total };
}

/**
 * Aggregate user counts by `role`.
 */
async function countUsersByRole(UserModel) {
  const rows = await UserModel.aggregate([
    { $group: { _id: '$role', count: { $sum: 1 } } },
  ]);
  const byRole = Object.create(null);
  let total = 0;
  for (const row of rows) {
    const key = row._id == null ? 'UNKNOWN' : String(row._id);
    byRole[key] = row.count;
    total += row.count;
  }
  return { byRole, total };
}

function statusCount(byStatus, status) {
  return byStatus[status] || 0;
}

module.exports = {
  countByStatus,
  countUsersByRole,
  statusCount,
};
