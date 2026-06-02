// routes/auth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// --- Authentication Middleware for Tab Saving ---
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'No token provided' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
    }
};

// register Route
router.post('/register', async(req, res) => {
    const { username, password } = req.body;

    try {
        const existing = await User.findOne({ username });
        if (existing) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const user = await User.create({ username, password });
        console.log(`✅ Registration success: New user '${username}' created.`);
        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        console.error('❌ Registration error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// login Route
router.post('/login', async(req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });
        if (!user) {
            console.log(`⚠️ Login failed: Username '${username}' not found in database.`);
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Use the schema method to compare the hashed password
        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            console.log(`⚠️ Login failed: Incorrect password for user '${username}'.`);
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

        // ---> SUCCESS LOG <---
        console.log(`🟢 Login success: User '${username}' authenticated and token generated.`);

        res.status(200).json({ token, username: user.username });
    } catch (err) {
        console.error('❌ Sign-in error:', err);
        res.status(500).json({ message: 'Error logging in', error: err.message });
    }
});

// Get User Tabs
router.get('/tabs', authenticate, async(req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.status(200).json(Array.isArray(user.tabs) ? user.tabs : []);
    } catch (err) {
        console.error('Error fetching tabs:', err);
        res.status(500).json({ error: 'Server error fetching tabs' });
    }
});

// Save User Tabs
router.post('/tabs', authenticate, async(req, res) => {
    try {
        const { tabs } = req.body;
        if (!Array.isArray(tabs)) {
            return res.status(400).json({ error: 'tabs must be an array' });
        }

        const MAX_TABS = 15;
        if (tabs.length > MAX_TABS) {
            return res.status(400).json({ error: `Cannot save more than ${MAX_TABS} tabs` });
        }

        const MAX_TAB_SIZE = 1 * 1024 * 1024;
        for (let i = 0; i < tabs.length; i++) {
            const tabSize = Buffer.byteLength(JSON.stringify(tabs[i]), 'utf8');
            if (tabSize > MAX_TAB_SIZE) {
                return res.status(413).json({ error: `Tab at index ${i} exceeds the 1MB size limit` });
            }
        }

        const user = await User.findByIdAndUpdate(req.userId, { tabs }, { new: true });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.status(200).json({ message: 'Tabs saved successfully' });
    } catch (err) {
        console.error('Error saving tabs:', err);
        res.status(500).json({ error: 'Server error saving tabs' });
    }
});

// Delete a single tab by its client-side id field
router.delete('/tabs/:tabId', authenticate, async(req, res) => {
    try {
        const { tabId } = req.params;
        const user = await User.findByIdAndUpdate(
            req.userId,
            { $pull: { tabs: { id: tabId } } },
            { new: true }
        );
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.status(200).json({ message: 'Tab deleted' });
    } catch (err) {
        console.error('Error deleting tab:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;