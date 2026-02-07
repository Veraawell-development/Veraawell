const Article = require('../models/article');
const logger = require('../utils/logger');
const createDOMPurify = require('isomorphic-dompurify');
const DOMPurify = createDOMPurify();
const validator = require('validator');

// Escape special regex characters to prevent NoSQL injection
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


// @desc    Get all published articles (public)
// @route   GET /api/articles
// @access  Public
exports.getPublishedArticles = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            category = '',
            featured
        } = req.query;

        // Build filter
        const filter = { status: 'published' };

        if (category && category !== 'All') {
            filter.category = category;
        }

        if (featured !== undefined) {
            filter.featured = featured === 'true';
        }

        if (search) {
            const escapedSearch = escapeRegex(search.trim());
            filter.$or = [
                { title: { $regex: escapedSearch, $options: 'i' } },
                { description: { $regex: escapedSearch, $options: 'i' } },
                { tags: { $in: [new RegExp(escapedSearch, 'i')] } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [articles, total] = await Promise.all([
            Article.find(filter)
                .sort({ publishedDate: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .select('-content'), // Exclude content for list view
            Article.countDocuments(filter)
        ]);

        res.json({
            articles,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        logger.error('Error fetching published articles:', error);
        res.status(500).json({ message: 'Failed to fetch articles', error: error.message });
    }
};

// @desc    Get single article by slug (public)
// @route   GET /api/articles/:slug
// @access  Public
exports.getArticleBySlug = async (req, res) => {
    try {
        const { slug } = req.params;

        const article = await Article.findOne({ slug, status: 'published' });

        if (!article) {
            return res.status(404).json({ message: 'Article not found' });
        }

        res.json(article);
    } catch (error) {
        logger.error('Error fetching article:', error);
        res.status(500).json({ message: 'Failed to fetch article', error: error.message });
    }
};

// @desc    Increment article view count
// @route   POST /api/articles/:id/view
// @access  Public
exports.incrementViews = async (req, res) => {
    try {
        const { id } = req.params;

        const article = await Article.findByIdAndUpdate(
            id,
            { $inc: { views: 1 } },
            { new: true }
        );

        if (!article) {
            return res.status(404).json({ message: 'Article not found' });
        }

        res.json({ views: article.views });
    } catch (error) {
        logger.error('Error incrementing views:', error);
        res.status(500).json({ message: 'Failed to increment views', error: error.message });
    }
};

// @desc    Increment article like count
// @route   POST /api/articles/:id/like
// @access  Public
exports.incrementLikes = async (req, res) => {
    try {
        const { id } = req.params;

        const article = await Article.findByIdAndUpdate(
            id,
            { $inc: { likes: 1 } },
            { new: true }
        );

        if (!article) {
            return res.status(404).json({ message: 'Article not found' });
        }

        res.json({ likes: article.likes });
    } catch (error) {
        logger.error('Error incrementing likes:', error);
        res.status(500).json({ message: 'Failed to increment likes', error: error.message });
    }
};

// ============= ADMIN ENDPOINTS =============

// @desc    Get all articles (admin)
// @route   GET /api/articles/admin/all
// @access  Super Admin
exports.getAllArticles = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            category = '',
            status = ''
        } = req.query;

        // Build filter
        const filter = {};

        if (category && category !== 'All') {
            filter.category = category;
        }

        if (status && status !== 'All') {
            filter.status = status;
        }

        if (search) {
            const escapedSearch = escapeRegex(search.trim());
            filter.$or = [
                { title: { $regex: escapedSearch, $options: 'i' } },
                { description: { $regex: escapedSearch, $options: 'i' } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [articles, total] = await Promise.all([
            Article.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .select('-content'), // Exclude content for list view
            Article.countDocuments(filter)
        ]);

        res.json({
            articles,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        logger.error('Error fetching all articles:', error);
        res.status(500).json({ message: 'Failed to fetch articles', error: error.message });
    }
};

// @desc    Get single article by ID (admin)
// @route   GET /api/admin/articles/:id
// @access  Super Admin
exports.getArticleById = async (req, res) => {
    try {
        const { id } = req.params;

        const article = await Article.findById(id);

        if (!article) {
            return res.status(404).json({ message: 'Article not found' });
        }

        res.json(article);
    } catch (error) {
        logger.error('Error fetching article:', error);
        res.status(500).json({ message: 'Failed to fetch article', error: error.message });
    }
};

// @desc    Create new article
// @route   POST /api/admin/articles
// @access  Super Admin
exports.createArticle = async (req, res) => {
    try {
        const {
            title,
            description,
            content,
            category,
            tags,
            author,
            image,
            featured,
            status
        } = req.body;

        // Validate required fields
        if (!title || !description || !content || !category || !author) {
            return res.status(400).json({
                message: 'Missing required fields: title, description, content, category, author'
            });
        }

        // Sanitize all text inputs to prevent XSS
        const sanitizedTitle = DOMPurify.sanitize(title, { ALLOWED_TAGS: [] }).trim();
        const sanitizedDescription = DOMPurify.sanitize(description, { ALLOWED_TAGS: [] }).trim();
        const sanitizedAuthor = DOMPurify.sanitize(author, { ALLOWED_TAGS: [] }).trim();

        // Sanitize content but allow safe HTML for rich text
        const sanitizedContent = DOMPurify.sanitize(content, {
            ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'blockquote'],
            ALLOWED_ATTR: ['href', 'target']
        });

        // Sanitize tags array
        const sanitizedTags = (tags || []).map(tag =>
            DOMPurify.sanitize(tag, { ALLOWED_TAGS: [] }).trim()
        ).filter(tag => tag.length > 0);

        // Validate image URL if provided
        if (image && !validator.isURL(image, { require_protocol: true })) {
            return res.status(400).json({
                message: 'Invalid image URL format'
            });
        }

        // Create article with sanitized inputs
        const article = await Article.create({
            title: sanitizedTitle,
            description: sanitizedDescription,
            content: sanitizedContent,
            category,
            tags: sanitizedTags,
            author: sanitizedAuthor,
            authorId: req.user._id,
            image: image || '',
            featured: featured || false,
            status: status || 'draft'
        });

        // Calculate and update read time
        article.readTime = article.calculateReadTime();
        await article.save();

        logger.info(`Article created: ${article.title} by ${req.user.username}`);

        res.status(201).json({
            message: 'Article created successfully',
            article
        });
    } catch (error) {
        logger.error('Error creating article:', error);

        // Handle duplicate slug error
        if (error.code === 11000) {
            return res.status(400).json({
                message: 'An article with this title already exists. Please use a different title.'
            });
        }

        res.status(500).json({ message: 'Failed to create article', error: error.message });
    }
};

// @desc    Update article
// @route   PUT /api/admin/articles/:id
// @access  Super Admin
exports.updateArticle = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const article = await Article.findById(id);

        if (!article) {
            return res.status(404).json({ message: 'Article not found' });
        }

        // Update fields
        Object.keys(updateData).forEach(key => {
            if (updateData[key] !== undefined) {
                article[key] = updateData[key];
            }
        });

        // Recalculate read time if content changed
        if (updateData.content) {
            article.readTime = article.calculateReadTime();
        }

        await article.save();

        logger.info(`Article updated: ${article.title} by ${req.user.username}`);

        res.json({
            message: 'Article updated successfully',
            article
        });
    } catch (error) {
        logger.error('Error updating article:', error);

        // Handle duplicate slug error
        if (error.code === 11000) {
            return res.status(400).json({
                message: 'An article with this title already exists. Please use a different title.'
            });
        }

        res.status(500).json({ message: 'Failed to update article', error: error.message });
    }
};

// @desc    Delete article
// @route   DELETE /api/admin/articles/:id
// @access  Super Admin
exports.deleteArticle = async (req, res) => {
    try {
        const { id } = req.params;

        const article = await Article.findByIdAndDelete(id);

        if (!article) {
            return res.status(404).json({ message: 'Article not found' });
        }

        logger.info(`Article deleted: ${article.title} by ${req.user.username}`);

        // ✨ REAL-TIME UPDATE: Broadcast article deletion to all patients
        const io = req.app.get('io');
        if (io) {
            const SocketEmitter = require('../utils/socketEmitter');
            const emitter = new SocketEmitter(io);

            emitter.emitToRole('patient', 'article:deleted', {
                articleId: article._id.toString(),
                timestamp: new Date()
            });

            logger.info('Article deletion broadcasted to patients', {
                articleId: article._id.toString().substring(0, 8)
            });
        }

        res.json({ message: 'Article deleted successfully' });
    } catch (error) {
        logger.error('Error deleting article:', error);
        res.status(500).json({ message: 'Failed to delete article', error: error.message });
    }
};

// @desc    Publish article (change status to published)
// @route   POST /api/admin/articles/:id/publish
// @access  Super Admin
exports.publishArticle = async (req, res) => {
    try {
        const { id } = req.params;

        const article = await Article.findById(id);

        if (!article) {
            return res.status(404).json({ message: 'Article not found' });
        }

        article.status = 'published';
        if (!article.publishedDate) {
            article.publishedDate = new Date();
        }
        await article.save();

        logger.info(`Article published: ${article.title} by ${req.user.username}`);

        // ✨ REAL-TIME UPDATE: Broadcast new article to all patients
        const io = req.app.get('io');
        if (io) {
            const SocketEmitter = require('../utils/socketEmitter');
            const emitter = new SocketEmitter(io);

            emitter.emitToRole('patient', 'article:new', {
                article: {
                    _id: article._id,
                    title: article.title,
                    description: article.description,
                    category: article.category,
                    image: article.image,
                    slug: article.slug,
                    publishedDate: article.publishedDate
                },
                timestamp: new Date()
            });

            logger.info('New article broadcasted to patients', {
                articleId: article._id.toString().substring(0, 8),
                title: article.title
            });
        }

        res.json({
            message: 'Article published successfully',
            article
        });
    } catch (error) {
        logger.error('Error publishing article:', error);
        res.status(500).json({ message: 'Failed to publish article', error: error.message });
    }
};

// @desc    Toggle featured status
// @route   POST /api/admin/articles/:id/feature
// @access  Super Admin
exports.toggleFeatured = async (req, res) => {
    try {
        const { id } = req.params;

        const article = await Article.findById(id);

        if (!article) {
            return res.status(404).json({ message: 'Article not found' });
        }

        article.featured = !article.featured;
        await article.save();

        logger.info(`Article featured status toggled: ${article.title} - ${article.featured}`);

        res.json({
            message: `Article ${article.featured ? 'featured' : 'unfeatured'} successfully`,
            article
        });
    } catch (error) {
        logger.error('Error toggling featured status:', error);
        res.status(500).json({ message: 'Failed to toggle featured status', error: error.message });
    }
};

