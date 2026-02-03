import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import dotenv from 'dotenv';

import { processVideo } from './video-processor';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Configure CORS for your frontend
const allowedOrigins: string[] = [
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter((origin): origin is string => Boolean(origin));

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

app.use(express.json());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const tempDir = path.join(os.tmpdir(), 'video-upload-' + uuidv4());
    await fs.mkdir(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, 'input' + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
  },
  fileFilter: (req, file, cb) => {
    const validTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (validTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid video type. Supported: MP4, WebM, MOV'));
    }
  },
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Video processing endpoint
app.post('/api/process-video', upload.single('file'), async (req, res) => {
  const startTime = Date.now();
  let tempDir: string | null = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { 
      convexUrl, 
      clerkId, 
      workId, 
      watermarkPayload, 
      payloadHash,
      userId,
      artworkId,
    } = req.body;

    if (!convexUrl || !clerkId || !workId || !watermarkPayload || !payloadHash) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    tempDir = path.dirname(req.file.path);
    const inputPath = req.file.path;

    console.log(`[VIDEO] Processing started for ${workId}`);
    console.log(`[VIDEO] Input file: ${inputPath}`);

    // Process the video
    const result = await processVideo({
      inputPath,
      tempDir,
      workId,
      watermarkPayload,
      payloadHash,
      convexUrl,
      userId,
      artworkId,
      onProgress: (progress, step) => {
        console.log(`[VIDEO] ${step} (${progress}%)`);
      },
    });

    const processingTime = Date.now() - startTime;
    console.log(`[VIDEO] Processing completed in ${processingTime}ms`);

    res.json({
      success: true,
      ...result,
      processingTimeMs: processingTime,
    });

  } catch (error) {
    console.error('[VIDEO] Processing error:', error);
    res.status(500).json({
      error: 'Video processing failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    // Cleanup temp directory
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (e) {
        console.warn('Failed to cleanup temp dir:', tempDir);
      }
    }
  }
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    details: err.message,
  });
});

app.listen(PORT, () => {
  console.log(`Video processing server running on port ${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
});
