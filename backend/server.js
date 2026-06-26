// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');

const app = express();

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://wimps.dev')
    .split(',').map(s => s.trim());

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '2mb' }));
app.use('/auth', authRoutes);

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ MongoDB connected');
        app.listen(3001, '0.0.0.0', () =>
            console.log('🚀 Server running on http://localhost:3001')
        );
    })
    .catch((err) => console.error('❌ MongoDB connection error:', err));