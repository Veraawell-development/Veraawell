/**
 * Article categories — one list for the editor, the admin filter and the
 * public resources page.
 *
 * They were three hand-copied arrays, and the public one had drifted: it was
 * missing "Anger & Frustration" and "Confusion about identity", so an article
 * filed under either could be published but never reached through the
 * category filter.
 */
export const ARTICLE_CATEGORIES = [
  'Addiction',
  'Adult ADHD',
  'Anger management',
  'Anger & Frustration',
  'Anxiety disorders',
  'Bipolar disorder',
  'Confusion about identity',
  'Depression',
  'Depressive disorders',
  'Lack of Motivation',
  'Negative thinking',
  'Relationship Struggles',
] as const;

export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number];

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  'Addiction': { bg: '#EDE9FB', text: '#6350C9' },
  'Adult ADHD': { bg: '#FDEBD5', text: '#C1692B' },
  'Anger management': { bg: '#FDEBD5', text: '#C1692B' },
  'Anger & Frustration': { bg: '#FDEBD5', text: '#C1692B' },
  'Anxiety disorders': { bg: '#D5F3F4', text: '#0097b2' },
  'Bipolar disorder': { bg: '#FCE4EC', text: '#C2185B' },
  'Confusion about identity': { bg: '#EDE9FB', text: '#6350C9' },
  'Depression': { bg: '#E8F5E9', text: '#2E7D32' },
  'Depressive disorders': { bg: '#E8F5E9', text: '#2E7D32' },
  'Lack of Motivation': { bg: '#FFF9C4', text: '#A87F00' },
  'Negative thinking': { bg: '#FCEEE8', text: '#BE7959' },
  'Relationship Struggles': { bg: '#FCE4EC', text: '#C2185B' },
};

export const getCategoryStyle = (category: string): { bg: string; text: string } =>
  CATEGORY_COLORS[category] || { bg: '#F0F0F0', text: '#555555' };
