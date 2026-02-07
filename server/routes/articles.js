const express = require('express');
const router = express.Router();
const articleController = require('../controllers/article.controller');
const { verifyAdminToken, verifySuperAdmin } = require('../middleware/auth.middleware');
const rateLimit = require('express-rate-limit');

// Rate limiter for public article list - prevent excessive scraping
const articlesListLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // Max 100 requests per minute
    message: {
        success: false,
        message: 'Too many requests from this IP. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiter for article interactions (view/like) - prevent fraud
const interactionLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // Max 10 interactions per minute
    message: {
        success: false,
        message: 'Too many interactions. Please slow down.'
    },
    keyGenerator: (req) => {
        // Use user ID if authenticated, otherwise use IP
        return req.user?._id?.toString() || req.ip;
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiter for search - prevent abuse
const searchLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30, // Max 30 searches per minute
    message: {
        success: false,
        message: 'Too many search requests. Please try again later.'
    },
    skip: (req) => !req.query.search, // Only apply when search param exists
    standardHeaders: true,
    legacyHeaders: false
});


// ============= ADMIN ROUTES (Super Admin Only) =============
// IMPORTANT: Admin routes must come BEFORE the :slug route to avoid conflicts

// @route   GET /api/articles/admin/all
// @desc    Get all articles (including drafts) for admin
// @access  Super Admin
router.get('/admin/all', verifyAdminToken, verifySuperAdmin, articleController.getAllArticles);

// @route   GET /api/articles/admin/:id
// @desc    Get single article by ID for admin
// @access  Super Admin
router.get('/admin/:id', verifyAdminToken, verifySuperAdmin, articleController.getArticleById);

// @route   POST /api/articles/admin
// @desc    Create new article
// @access  Super Admin
router.post('/admin', verifyAdminToken, verifySuperAdmin, articleController.createArticle);

// @route   PUT /api/articles/admin/:id
// @desc    Update article
// @access  Super Admin
router.put('/admin/:id', verifyAdminToken, verifySuperAdmin, articleController.updateArticle);

// @route   DELETE /api/articles/admin/:id
// @desc    Delete article
// @access  Super Admin
router.delete('/admin/:id', verifyAdminToken, verifySuperAdmin, articleController.deleteArticle);

// @route   POST /api/articles/admin/:id/publish
// @desc    Publish article (change status to published)
// @access  Super Admin
router.post('/admin/:id/publish', verifyAdminToken, verifySuperAdmin, articleController.publishArticle);

// @route   POST /api/articles/admin/:id/feature
// @desc    Toggle featured status
// @access  Super Admin
router.post('/admin/:id/feature', verifyAdminToken, verifySuperAdmin, articleController.toggleFeatured);

// ============= PUBLIC ROUTES =============

// @route   GET /api/articles
// @desc    Get all published articles with pagination, search, and filters
// @access  Public
router.get('/', articlesListLimiter, searchLimiter, articleController.getPublishedArticles);

// @route   POST /api/articles/:id/view
// @desc    Increment article view count
// @access  Public
router.post('/:id/view', interactionLimiter, articleController.incrementViews);

// @route   POST /api/articles/:id/like
// @desc    Increment article like count
// @access  Public
router.post('/:id/like', interactionLimiter, articleController.incrementLikes);

// @route   GET /api/articles/:slug
// @desc    Get single article by slug
// @access  Public
// IMPORTANT: This must be LAST to avoid matching admin routes
router.get('/:slug', articleController.getArticleBySlug);

module.exports = router;

