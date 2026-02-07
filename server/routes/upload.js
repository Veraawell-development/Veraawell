const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { verifyToken } = require('../middleware/auth.middleware');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept images only
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
    }
});

// Upload profile image
router.post('/profile-image', verifyToken, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No image file provided' });
        }

        // Convert buffer to base64
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = `data:${req.file.mimetype};base64,${b64}`;

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(dataURI, {
            folder: 'veerawell/profiles',
            transformation: [
                { width: 500, height: 500, crop: 'fill', gravity: 'face' },
                { quality: 'auto' },
                { fetch_format: 'auto' }
            ],
            public_id: `user_${req.user._id}_${Date.now()}`
        });

        res.json({
            success: true,
            imageUrl: result.secure_url,
            publicId: result.public_id
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            message: 'Failed to upload image',
            error: error.message
        });
    }
});

// Delete profile image
router.delete('/profile-image/:publicId', verifyToken, async (req, res) => {
    try {
        const { publicId } = req.params;

        // Delete from Cloudinary
        await cloudinary.uploader.destroy(publicId);

        res.json({
            success: true,
            message: 'Image deleted successfully'
        });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({
            message: 'Failed to delete image',
            error: error.message
        });
    }
});

// Upload doctor documents (multiple files, PDF and images)
const documentUpload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit per file
    },
    fileFilter: (req, file, cb) => {
        // Accept PDFs and images
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('Only PDF, JPG, and PNG files are allowed!'), false);
        }
        cb(null, true);
    }
});

router.post('/doctor-documents', documentUpload.array('documents', 5), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No document files provided' });
        }

        const uploadedDocuments = [];

        // Upload each file to Cloudinary
        for (const file of req.files) {
            // Convert buffer to base64
            const b64 = Buffer.from(file.buffer).toString('base64');
            const dataURI = `data:${file.mimetype};base64,${b64}`;

            // Determine resource type (image or raw for PDFs)
            const resourceType = file.mimetype === 'application/pdf' ? 'raw' : 'image';

            // Upload to Cloudinary
            const result = await cloudinary.uploader.upload(dataURI, {
                folder: 'veerawell/doctor-documents',
                resource_type: resourceType,
                public_id: `doc_${Date.now()}_${Math.random().toString(36).substring(7)}`
            });

            uploadedDocuments.push({
                fileName: file.originalname,
                fileUrl: result.secure_url,
                fileType: file.mimetype,
                cloudinaryPublicId: result.public_id
            });
        }

        res.json({
            success: true,
            documents: uploadedDocuments
        });
    } catch (error) {
        console.error('Document upload error:', error);
        res.status(500).json({
            message: 'Failed to upload documents',
            error: error.message
        });
    }
});

// Upload article image
router.post('/article-image', verifyToken, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No image file provided' });
        }

        // Convert buffer to base64
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = `data:${req.file.mimetype};base64,${b64}`;

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(dataURI, {
            folder: 'veerawell/articles',
            resource_type: 'image',
            public_id: `article_${Date.now()}_${Math.random().toString(36).substring(7)}`
        });

        res.json({
            success: true,
            imageUrl: result.secure_url,
            publicId: result.public_id
        });
    } catch (error) {
        console.error('Article image upload error:', error);
        res.status(500).json({
            message: 'Failed to upload article image',
            error: error.message
        });
    }
});

module.exports = router;
