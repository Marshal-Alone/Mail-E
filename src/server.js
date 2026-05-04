import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import apiRouter from './routes/api.js';
import { startBackgroundMonitor } from './services/monitor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config(); // Also check cwd

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mail_e';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend
app.use(express.static(path.join(__dirname, '../public')));

// Mount API routes
app.use('/api', apiRouter);

// Fallback for HTML5 navigation
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Database Connection & Server Initialization
mongoose.connection.on('error', (err) => {
  console.warn('⚠️ MongoDB connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
});

process.on('unhandledRejection', (reason) => {
  console.warn('⚠️ Unhandled Rejection:', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
  console.warn('⚠️ Uncaught Exception:', err.message);
});

async function startServer() {
  // Start HTTP server immediately so UI and endpoints are available without waiting
  app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 Mail-E Server running at: http://localhost:${PORT}`);
    console.log(`   Mode: ${process.env.GEMINI_API_KEY ? 'LIVE (Gemini AI active)' : 'DEMO (Deterministic AI engine active)'}`);
    console.log(`=========================================`);
  });

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 8000
    });
    console.log(`✓ Connected to MongoDB at ${MONGODB_URI}`);
    // Start 24/7 background email monitor (runs every 3 minutes)
    startBackgroundMonitor(3);
  } catch (err) {
    console.warn(`⚠️ MongoDB connection error: ${err.message}`);
    console.warn(`(App will continue to serve, but database features may be impaired until MongoDB is started)`);
  }
}

startServer();
