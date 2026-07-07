require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const User = require('../models/user');
const Article = require('../models/article');
const authService = require('../services/auth.service');

const API_URL = 'http://localhost:5001/api';

async function runTests() {
    console.log('--- Article Endpoints E2E Testing ---\n');
    let adminToken;
    let articleId;
    let initialSlug;

    try {
        // 1. Setup DB & Admin
        console.log('[Setup] Connecting to MongoDB...');
        const { connectDatabase } = require('../config/database');
        await connectDatabase();
        
        let admin = await User.findOne({ role: 'super_admin', email: 'test.admin@veerawell.test' });
        if (!admin) {
            admin = await User.create({
                firstName: 'Test',
                lastName: 'Admin',
                username: 'test.admin@veerawell.test',
                email: 'test.admin@veerawell.test',
                password: await require('bcrypt').hash('Admin123!', 10),
                role: 'super_admin'
            });
        }
        
        const jwt = require('jsonwebtoken');
        const { getAdminJWTSecret } = require('../config/auth');
        
        adminToken = jwt.sign({
            userId: admin._id,
            username: admin.username,
            role: admin.role
        }, getAdminJWTSecret(), { expiresIn: '1h' });
        
        console.log('[Setup] Admin token generated.\n');
        
        const axiosConfig = {
            headers: { Authorization: `Bearer ${adminToken}` }
        };

        // 2. Test Create Article (Valid)
        console.log('[Test 1] Creating a valid article...');
        const createRes = await axios.post(`${API_URL}/articles/admin`, {
            title: 'Test E2E Article',
            description: 'A test description',
            content: '<p>Test content</p>',
            category: 'Depression',
            author: 'Admin',
            tags: ['mental-health', 'test']
        }, axiosConfig);
        
        articleId = createRes.data.article._id;
        initialSlug = createRes.data.article.slug;
        console.log(`✅ Success. Created Article ID: ${articleId}`);
        console.log(`✅ Initial Slug generated: ${initialSlug}\n`);

        // 3. Test Slug SEO Destruction Bug (Updating Title changes Slug)
        console.log('[Test 2] Updating title to see if slug changes (SEO Bug)...');
        const updateRes = await axios.put(`${API_URL}/articles/admin/${articleId}`, {
            title: 'Test E2E Article Updated Title'
        }, axiosConfig);
        
        const newSlug = updateRes.data.article.slug;
        console.log(`   Old Slug: ${initialSlug}`);
        console.log(`   New Slug: ${newSlug}`);
        if (initialSlug !== newSlug) {
            console.log('❌ BUG CONFIRMED: Slug changed upon title update. Existing links will 404.\n');
        } else {
            console.log('✅ Slug remained intact.\n');
        }

        // 4. Test Publishing
        console.log('[Test 3] Publishing Article...');
        await axios.post(`${API_URL}/articles/admin/${articleId}/publish`, {}, axiosConfig);
        console.log('✅ Success. Article published.\n');

        // 5. Test Infinite Likes Exploit
        console.log('[Test 4] Testing Infinite Likes Exploit (Public Route)...');
        let likesCount = 0;
        for(let i=0; i<3; i++) {
            const likeRes = await axios.post(`${API_URL}/articles/${articleId}/like`);
            likesCount = likeRes.data.likes;
        }
        console.log(`   Liked the same article 3 times in a row.`);
        console.log(`   Current Likes: ${likesCount}`);
        if (likesCount >= 3) {
            console.log('❌ BUG CONFIRMED: No user tracking on likes. Users can spam likes infinitely.\n');
        }

        // 6. Test Type Error Crash (Sending tags as string)
        console.log('[Test 5] Testing Type Error Crash (Sending tags as string)...');
        try {
            await axios.put(`${API_URL}/articles/admin/${articleId}`, {
                tags: "this-is-a-string-not-an-array"
            }, axiosConfig);
        } catch (err) {
            if (err.response && err.response.status === 500) {
                console.log('❌ BUG CONFIRMED: Sending tags as string crashed the request (500 Error).');
                console.log(`   Server Error: ${err.response.data.error || err.response.data.message}\n`);
            } else {
                console.log('✅ Handled string tags correctly.\n');
            }
        }

        // 7. Cleanup
        console.log('[Cleanup] Deleting test article...');
        await axios.delete(`${API_URL}/articles/admin/${articleId}`, axiosConfig);
        console.log('✅ Cleanup successful.\n');
        
    } catch (error) {
        console.error('Test script failed:', error.response ? error.response.data : error.message);
    } finally {
        await mongoose.disconnect();
        console.log('Tests completed.');
    }
}

runTests();
