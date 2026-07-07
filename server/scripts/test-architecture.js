require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const User = require('../models/user');
const Article = require('../models/article');
const authService = require('../services/auth.service');
const { connectDatabase } = require('../config/database');

const API_URL = 'http://localhost:5001/api';

async function runTests() {
    console.log('--- Architecture Upgrades E2E Testing ---\n');
    let adminToken;
    let articleId;

    try {
        console.log('[Setup] Connecting to MongoDB...');
        await connectDatabase();
        await Article.syncIndexes();
        
        let admin = await User.findOne({ role: 'super_admin' });
        
        const jwt = require('jsonwebtoken');
        const { getAdminJWTSecret } = require('../config/auth');
        
        adminToken = jwt.sign({
            userId: admin._id,
            username: admin.username,
            role: admin.role
        }, getAdminJWTSecret(), { expiresIn: '1h' });
        
        const axiosConfig = { headers: { Authorization: `Bearer ${adminToken}` } };

        // 1. Create Article
        console.log('[Test 1] Creating test article...');
        const createRes = await axios.post(`${API_URL}/articles/admin`, {
            title: 'Caching and Search Test Article',
            description: 'This is a test description for text search.',
            content: '<p>Test content</p>',
            category: 'Depression',
            author: 'Admin',
            tags: ['test']
        }, axiosConfig);
        
        articleId = createRes.data.article._id;
        await axios.post(`${API_URL}/articles/admin/${articleId}/publish`, {}, axiosConfig);
        console.log(`✅ Success. Created & Published Article ID: ${articleId}\n`);

        // 2. Test Text Search
        console.log('[Test 2] Testing $text Search...');
        const searchRes = await axios.get(`${API_URL}/articles?search=Caching`);
        const found = searchRes.data.articles.find(a => a._id === articleId);
        if (found) {
            console.log(`✅ Success. Found article via text search.\n`);
        } else {
            console.log(`❌ FAILED. Article not found in search.\n`);
        }

        // 3. Test Caching (Speed)
        console.log('[Test 3] Testing Cache Speed...');
        const start1 = Date.now();
        await axios.get(`${API_URL}/articles`);
        const end1 = Date.now();
        console.log(`   First fetch (Cache Miss): ${end1 - start1}ms`);

        const start2 = Date.now();
        await axios.get(`${API_URL}/articles`);
        const end2 = Date.now();
        console.log(`   Second fetch (Cache Hit): ${end2 - start2}ms`);
        if (end2 - start2 < end1 - start1 || end2 - start2 < 10) {
            console.log(`✅ Cache is working perfectly!\n`);
        } else {
            console.log(`⚠️ Cache speed difference negligible.\n`);
        }

        // 4. Test Soft Delete
        console.log('[Test 4] Testing Soft Delete...');
        await axios.delete(`${API_URL}/articles/admin/${articleId}`, axiosConfig);
        
        // Verify in DB directly
        const dbArticle = await Article.findById(articleId);
        if (dbArticle && dbArticle.status === 'archived') {
            console.log(`✅ Success. Article was Soft Deleted (status='archived'). Data is preserved.\n`);
        } else {
            console.log(`❌ FAILED. Article was permanently deleted or status not set.\n`);
        }

        // Verify public API 404s
        try {
            await axios.get(`${API_URL}/articles/${dbArticle.slug}`);
            console.log(`❌ FAILED. Public API still returns soft deleted article.\n`);
        } catch(err) {
            if (err.response.status === 404) {
                console.log(`✅ Success. Public API returns 404 for Soft Deleted article.\n`);
            }
        }

    } catch (error) {
        console.error('Test script failed:', error.response ? error.response.data : error.message);
    } finally {
        await mongoose.disconnect();
        console.log('Tests completed.');
    }
}

runTests();
