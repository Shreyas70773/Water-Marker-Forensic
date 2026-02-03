# Water Marker - Video Processing Backend

This is a separate backend service for processing videos. It handles the CPU-intensive video watermarking that would timeout on serverless platforms.

## Deployment to Railway (Free Tier)

### 1. Create Railway Account
- Go to [railway.app](https://railway.app)
- Sign up with GitHub (recommended)
- You get $5 free credit per month

### 2. Deploy from GitHub

```bash
# In your main repo, the video-backend folder will be deployed separately
# Or create a separate repo for this backend
```

1. In Railway dashboard, click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose your repo
4. Set the root directory to `video-backend` (if in same repo)

### 3. Configure Environment Variables

In Railway dashboard, go to your service → Variables:

```
PORT=3001
FRONTEND_URL=https://your-app.netlify.app
```

### 4. Get Your Backend URL

After deployment, Railway gives you a URL like:
`https://your-service.up.railway.app`

Use this URL in your frontend's `.env.local`:
```
NEXT_PUBLIC_VIDEO_BACKEND_URL=https://your-service.up.railway.app
```

## Alternative: Deploy to Render (Free Tier)

### 1. Create Render Account
- Go to [render.com](https://render.com)
- Sign up with GitHub

### 2. Create Web Service
1. Click "New" → "Web Service"
2. Connect your repo
3. Set root directory to `video-backend`
4. Build command: `npm install && npm run build`
5. Start command: `npm start`

### 3. Environment Variables
Same as Railway above.

## Local Development

```bash
cd video-backend
npm install
npm run dev
```

Server runs on http://localhost:3001

## API Endpoints

### Health Check
```
GET /health
```

### Process Video
```
POST /api/process-video
Content-Type: multipart/form-data

file: <video file>
convexUrl: <your convex url>
clerkId: <user's clerk id>
workId: <generated work id>
watermarkPayload: <payload to embed>
payloadHash: <sha256 of payload>
```

## Free Tier Limits

| Platform | Free Tier |
|----------|-----------|
| Railway | $5/month credit (~500 hours) |
| Render | 750 hours/month (spins down after 15min) |

Both are sufficient for personal/small-scale use.
