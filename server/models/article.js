const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Title is required'],
        trim: true,
        maxlength: [200, 'Title cannot exceed 200 characters']
    },
    slug: {
        type: String,
        unique: true,
        lowercase: true,
        trim: true
    },
    description: {
        type: String,
        required: [true, 'Description is required'],
        trim: true,
        maxlength: [500, 'Description cannot exceed 500 characters']
    },
    content: {
        type: String,
        required: [true, 'Content is required']
    },
    category: {
        type: String,
        required: [true, 'Category is required'],
        enum: [
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
            'Relationship Struggles'
        ]
    },
    tags: [{
        type: String,
        trim: true
    }],
    author: {
        type: String,
        required: [true, 'Author name is required'],
        trim: true
    },
    authorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    image: {
        type: String,
        default: ''
    },
    featured: {
        type: Boolean,
        default: false
    },
    readTime: {
        type: String,
        default: '5 mins read'
    },
    status: {
        type: String,
        enum: ['draft', 'published', 'archived'],
        default: 'draft'
    },
    publishedDate: {
        type: Date
    },
    views: {
        type: Number,
        default: 0
    },
    likes: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Auto-generate slug from title before saving with collision handling
articleSchema.pre('save', async function (next) {
    if (!this.isModified('title')) {
        return next();
    }

    try {
        // Generate base slug
        const baseSlug = this.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        let slug = baseSlug;
        let counter = 1;

        // Check for duplicates and append number if needed
        const Article = this.constructor;
        while (true) {
            const existing = await Article.findOne({
                slug,
                _id: { $ne: this._id }
            });

            if (!existing) break;

            slug = `${baseSlug}-${counter}`;
            counter++;
        }

        this.slug = slug;
        next();
    } catch (error) {
        next(error);
    }
});

// Auto-set published date when status changes to published
articleSchema.pre('save', function (next) {
    if (this.isModified('status') && this.status === 'published' && !this.publishedDate) {
        this.publishedDate = new Date();
    }
    next();
});

// Method to calculate read time from content
articleSchema.methods.calculateReadTime = function () {
    const wordsPerMinute = 200;
    // Strip HTML tags to get plain text
    const textContent = this.content.replace(/<[^>]*>/g, '');
    const wordCount = textContent.split(/\s+/).filter(word => word.length > 0).length;
    const minutes = Math.ceil(wordCount / wordsPerMinute);
    return `${minutes} min${minutes > 1 ? 's' : ''} read`;
};

// Static method to find published articles
articleSchema.statics.findPublished = function (filter = {}) {
    return this.find({ ...filter, status: 'published' })
        .sort({ publishedDate: -1 });
};

// Indexes for better query performance
articleSchema.index({ slug: 1 });
articleSchema.index({ status: 1, publishedDate: -1 });
articleSchema.index({ category: 1 });
articleSchema.index({ featured: 1 });
articleSchema.index({ authorId: 1 });

const Article = mongoose.model('Article', articleSchema);

module.exports = Article;
