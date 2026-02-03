# Water Marker - Video Processing Backend

This is a separate backend service for processing videos. It handles the CPU-intensive video watermarking that would timeout on serverless platforms like Netlify.

## Why Separate Backend?

- **FFmpeg Required**: Video processing needs FFmpeg which isn't available on Netlify serverless
- **Long Processing**: Videos can take minutes to process, exceeding serverless timeouts
- **Resource Intensive**: Video processing needs more CPU/memory than serverless provides

## Deployment to Render.com (FREE Forever!)

Render offers a **free tier** with:
- ✅ 750 free instance hours/month (enough for always-on)
- ✅ Auto-sleeps after 15 mins of inactivity (saves hours)
- ✅ Wakes automatically on request (~30s cold start)
- ✅ No Docker required - auto-detects Node.js
- ✅ No credit card required

### Step 1: Create Render Account

1. Go to [render.com](https://render.com)
2. Sign up with GitHub (recommended)

### Step 2: Create New Web Service

1. Click **"New"** → **"Web Service"**
2. Connect your GitHub account if not already connected
3. Find and select your `Water-Marker-Forensic` repository
4. Configure the service:

   | Setting | Value |
   |---------|-------|
   | **Name** | `water-marker-video` |
   | **Root Directory** | `video-backend` |
   | **Runtime** | `Node` |
   | **Build Command** | `npm install && npm run build` |
   | **Start Command** | `npm start` |
   | **Plan** | `Free` |

5. Click **"Create Web Service"**

### Step 3: Add Environment Variables

After the service is created, go to **Environment** tab and add:

| Key | Value |
|-----|-------|
| `FRONTEND_URL` | `https://water-marker-forensic.netlify.app` |
| `NODE_ENV` | `production` |

(Replace FRONTEND_URL with your actual Netlify URL)

### Step 4: Get Your Backend URL

After deployment, Render gives you a URL like:
```
https://water-marker-video.onrender.com
```

### Step 5: Update Your Netlify Frontend

Add this environment variable in Netlify (Site settings → Environment variables):

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_VIDEO_BACKEND_URL` | `https://water-marker-video.onrender.com` |

Then trigger a redeploy on Netlify.

## Local Development

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Run development server
npm run dev
```

## API Endpoints

### Health Check
```
GET /health
```
Returns: `{ "status": "ok", "timestamp": "..." }`

### Process Video
```
POST /api/process-video
Content-Type: multipart/form-data

Body:
- file: Video file (MP4, WebM, MOV)
- convexUrl: Convex deployment URL
- clerkId: User's Clerk ID
- workId: Generated work ID
- watermarkPayload: Payload to embed
- payloadHash: Hash of payload
- userId: Convex user ID
- artworkId: Convex artwork ID (optional)
```

## Notes

- **Cold Starts**: Free tier sleeps after 15 mins of inactivity. First request after sleep takes ~30 seconds.
- **Processing Time**: Videos take 30 seconds to several minutes depending on length.
- **File Size**: Max 500MB video files supported.
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
