const express = require('express');
const router = express.Router();
const Article = require('../models/article');
const User = require('../models/user');
const DoctorProfile = require('../models/doctorProfile');

// A simple utility to escape XML special characters
const escapeXml = (unsafe) => {
    return (unsafe || '').replace(/[<>&'"]/g, function (c) {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
};

router.get('/sitemap.xml', async (req, res) => {
    try {
        const baseUrl = 'https://veraawell.com';
        
        // Get dynamic content
        const articles = await Article.find({ isPublished: true }).select('slug updatedAt');
        const doctors = await DoctorProfile.find().populate('userId', 'isVerified role').exec();
        
        // Filter valid doctors
        const activeDoctors = doctors.filter(doc => doc.userId && doc.userId.isVerified && doc.userId.role === 'doctor');

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

        // Add static routes
        const staticRoutes = [
            '',
            '/about',
            '/services',
            '/resources/articles',
            '/choose-professional'
        ];

        for (const route of staticRoutes) {
            xml += `  <url>\n    <loc>${baseUrl}${route}</loc>\n    <changefreq>daily</changefreq>\n    <priority>${route === '' ? '1.0' : '0.8'}</priority>\n  </url>\n`;
        }

        // Add Articles
        for (const article of articles) {
            if (article.slug) {
                const date = article.updatedAt ? new Date(article.updatedAt).toISOString() : new Date().toISOString();
                xml += `  <url>\n    <loc>${baseUrl}/resources/articles/${escapeXml(article.slug)}</loc>\n    <lastmod>${date}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
            }
        }

        // Add Doctors
        for (const doctor of activeDoctors) {
            if (doctor._id) {
                xml += `  <url>\n    <loc>${baseUrl}/doctor/${doctor._id}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
            }
        }

        xml += '</urlset>';

        res.header('Content-Type', 'application/xml');
        res.send(xml);
    } catch (error) {
        console.error('Sitemap generation error:', error);
        res.status(500).send('Error generating sitemap');
    }
});

router.get('/robots.txt', (req, res) => {
    const baseUrl = 'https://veraawell.com';
    const robotsTxt = `User-agent: *
Allow: /
Disallow: /patient-dashboard
Disallow: /doctor-dashboard
Disallow: /admin-dashboard
Disallow: /super-admin-dashboard
Disallow: /video-call/
Disallow: /reset-password
Disallow: /api/

Sitemap: ${baseUrl}/sitemap.xml
`;
    res.header('Content-Type', 'text/plain');
    res.send(robotsTxt);
});

module.exports = router;
