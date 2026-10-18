/**
 * Whether a review is shown publicly — the client mirror of the server's
 * Review.publicFilter (server/models/review.js), so the moderation screen's
 * "Public"/"Hidden" badge agrees with what visitors actually see.
 *
 *  - Doctor reviews are public unless hidden: not flagged, and either
 *    approved for display or never looked at by an admin.
 *  - Platform reviews (landing-page testimonials) need an admin's approval:
 *    approved, not flagged, and stamped `reviewedAt`.
 */

export interface ReviewVisibilityFields {
  reviewType?: 'doctor' | 'platform' | string;
  reviewStatus?: 'pending' | 'reviewed' | 'flagged' | string;
  approvedForDisplay?: boolean;
  reviewedAt?: string | null;
}

export function isReviewPublic(review: ReviewVisibilityFields): boolean {
  if (review.reviewStatus === 'flagged') return false;
  const reviewed = review.reviewedAt !== null && review.reviewedAt !== undefined;
  if (review.reviewType === 'platform') {
    return review.approvedForDisplay === true && reviewed;
  }
  return review.approvedForDisplay === true || !reviewed;
}
