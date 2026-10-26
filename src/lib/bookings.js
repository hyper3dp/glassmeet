// Canceled meetings (and declined requests) leave the host's lists two days after they were
// canceled. They stay in the database, so Analytics still counts them. updated_date is when the
// booking last changed, which for a canceled one is its cancellation.
const CANCELED_KEPT_MS = 2 * 86400000;

export const isExpiredCancellation = (b, now = Date.now()) =>
  b.status === 'cancelled' && now - new Date(b.updated_date || b.created_date).getTime() > CANCELED_KEPT_MS;

export const withoutExpiredCancellations = (list) => {
  const now = Date.now();
  return list.filter((b) => !isExpiredCancellation(b, now));
};
