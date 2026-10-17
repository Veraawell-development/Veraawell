const express = require('express');
const router = express.Router();
const Article = require('../models/article');
const DoctorProfile = require('../models/doctorProfile');
const { publicRoute } = require('../authz');
const { createLogger } = require('../utils/logger');

const logger = createLogger('SEO');

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

/**
 * The therapists a search engine should index: exactly the ones the public
 * directory (GET /api/sessions/doctors) lists as bookable, plus an active
 * account.
 *
 * This used to filter on `User.isVerified`, which records an email OTP and
 * says nothing about whether an admin approved the practitioner — and is
 * never set on an account created through Google sign-in, so those doctors
 * were missing however approved they were. Pending and rejected applicants
 * were listed if they had verified an email.
 */
async function indexableDoctors() {
    const profiles = await DoctorProfile.find({
        payoutApproved: true,
        'pricing.min': { $gt: 0 },
        bookableUntil: { $gte: new Date() }
    })
        .select('userId updatedAt')
        .populate({
            path: 'userId',
            select: '_id',
            match: { role: 'doctor', approvalStatus: 'approved', status: 'active' }
        })
        .lean();
    return profiles.filter((p) => p.userId);
}

router.get('/sitemap.xml', publicRoute('XML sitemap for search engines'), async (req, res) => {
    try {
        const baseUrl = 'https://veraawell.com';

        // Articles have no `isPublished` field — status is the published
        // criterion — so the old `{ isPublished: true }` query matched nothing
        // and the sitemap listed no articles at all.
        const articles = await Article.find({ status: 'published' }).select('slug updatedAt').lean();
        const activeDoctors = await indexableDoctors();

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

        // Add Doctors. The client route /doctor/:doctorId takes the USER id
        // (DoctorProfilePage fetches /sessions/doctors/:doctorId, which looks up
        // a User); this used to emit the DoctorProfile _id, so every doctor URL
        // in the sitemap resolved to "doctor not found".
        for (const doctor of activeDoctors) {
            const lastmod = doctor.updatedAt ? `\n    <lastmod>${new Date(doctor.updatedAt).toISOString()}</lastmod>` : '';
            xml += `  <url>\n    <loc>${baseUrl}/doctor/${doctor.userId._id}</loc>${lastmod}\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
        }

        xml += '</urlset>';

        res.header('Content-Type', 'application/xml');
        res.send(xml);
    } catch (error) {
        logger.error('Sitemap generation error', { error: error.message });
        res.status(500).send('Error generating sitemap');
    }
});

router.get('/robots.txt', publicRoute('robots.txt for search engines'), (req, res) => {
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
