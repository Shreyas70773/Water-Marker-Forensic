# Water Marker - 100% FREE Deployment Guide

This guide helps you deploy Water Marker for **$0/month** using free tiers.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    100% FREE STACK                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   [Netlify]                              [Convex]           │
│   Frontend + API                         Database +         │
│   FREE: 100GB                            Storage            │
│   Images: ✓                              FREE tier          │
│   Videos <15s: ✓                                            │
│                                                              │
│                      [Polygon Amoy]                         │
│                      Testnet = 100% FREE                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Video Processing - Optimized for Free Tier!

The video processor is optimized to handle **short videos (up to ~15 seconds)** 
within Netlify's free tier timeout. For your use case (10-second videos, 5-10/month),
**you don't need a separate backend!**

## Step 1: Deploy to Convex (Database)

1. **Create Convex Account**: [convex.dev](https://convex.dev)

2. **Deploy**:
```bash
npx convex deploy
```

3. **Copy your deployment URL** (looks like `https://xxx.convex.cloud`)

## Step 2: Set Up Clerk (Authentication)

1. **Create Clerk Account**: [clerk.com](https://clerk.com)

2. **Create Application**
   - Choose "Next.js" template
   - Copy your keys

3. **Configure URLs** in Clerk dashboard:
   - Sign-in URL: `/auth/sign-in`
   - Sign-up URL: `/auth/sign-up`
   - After sign-in: `/dashboard`

## Step 3: Set Up Polygon Amoy (FREE Blockchain)

1. **Create a Wallet**:
   - Use MetaMask or any Ethereum wallet
   - Switch to Polygon Amoy testnet
   - Export your private key (without 0x prefix)

2. **Get FREE Test MATIC**:
   - Go to [Polygon Faucet](https://faucet.polygon.technology/)
   - Request test MATIC for Amoy
   - This is 100% free and unlimited

## Step 4: Deploy Frontend to Netlify

1. **Create Netlify Account**: [netlify.com](https://netlify.com)

2. **Connect GitHub Repo**:
   - New site → Import from Git
   - Select your repo

3. **Configure Build Settings**:
   - Build command: `npm run build`
   - Publish directory: `.next`

4. **Add Environment Variables** in Netlify dashboard:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/auth/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/auth/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
POLYGON_RPC_URL=https://rpc-amoy.polygon.technology
NOTARY_PRIVATE_KEY=your_private_key_without_0x
EVIDENCE_SIGNING_KEY=generate_with_openssl_rand_hex_32
```

5. **Deploy**! Your site will be at `https://your-site.netlify.app`

## Step 5: Video Backend (OPTIONAL - only for videos >15 seconds)

**For videos under 15 seconds: Skip this step!** Netlify handles them fine.

The video processor is optimized to work within Netlify's 26-second timeout for short videos.
Only set up a backend if you need to process longer videos.

### Option A: Railway (100% FREE)

Railway gives you **$5 FREE credit every month** - you don't pay anything!
For 5-10 videos/month, you'd use maybe $0.05 of that credit.

1. **Create Railway Account**: [railway.app](https://railway.app)
   - Free tier: $5 credit/month (NO CREDIT CARD REQUIRED)

2. **Create New Project** → Deploy from GitHub

3. **Configure**:
   - Root directory: `video-backend`
   - Build: `npm install && npm run build`
   - Start: `npm start`

4. **Add Environment Variables**:
```
PORT=3001
FRONTEND_URL=https://your-site.netlify.app
```

5. **Get Your URL** (like `https://xxx.up.railway.app`)

6. **Add to Netlify Environment Variables**:
```
NEXT_PUBLIC_VIDEO_BACKEND_URL=https://xxx.up.railway.app
```

### Option B: Render (100% FREE)

1. **Create Render Account**: [render.com](https://render.com)
   - Free tier: 750 hours/month (NO CREDIT CARD REQUIRED)
   - Note: Spins down after 15min inactivity (cold starts)

2. Same steps as Railway

## Storage Management

To keep storage free/low:

1. **Export Evidence** before deleting files
   - Go to Evidence Vault → Select artwork → Storage tab
   - Download Evidence JSON (contains all proof)
   - Download PDF Report

2. **Clean Up Files**
   - Use "Clean Up Files Only" to delete images/videos
   - Evidence record is preserved with all cryptographic proof

3. **Or Delete Everything**
   - Only after downloading your evidence export

## Cost Summary

| Service | Monthly Cost | Notes |
|---------|--------------|-------|
| Netlify | $0 | Frontend + short videos |
| Convex | $0 | Database + storage |
| Polygon Amoy | $0 | Free testnet forever |
| Railway (optional) | $0 | Only for long videos, $5 FREE credit |
| **TOTAL** | **$0** | No credit card needed! |

### Your Usage Estimate (10s videos, 5-10/month)
- Netlify: Well under free tier limits
- Convex: ~50MB storage/month (easily fits free tier)
- Railway: NOT NEEDED for 10-second videos!

## Going to Production (When Ready)

When you want to use real blockchain (not testnet):

1. **Switch to Polygon Mainnet**:
   - Change `polygon-amoy` to `polygon` in code
   - Fund wallet with real MATIC (~$5-10)

2. **Upgrade Services** (if needed):
   - Netlify Pro: $19/mo (longer timeouts)
   - Railway: Pay as you go
   - Convex: Pay as you go

## Troubleshooting

### "Function timeout" on video upload
- Video is too long for Netlify's 26s limit
- Deploy the video backend to Railway/Render
- Or process shorter videos (<10s)

### "MATIC balance too low"
- Get free test MATIC from Polygon Faucet
- For mainnet, buy MATIC from an exchange

### "Convex deployment failed"
- Check `npx convex deploy` output
- Ensure you're logged in: `npx convex login`

## Need Help?

- Convex Discord: [discord.gg/convex](https://discord.gg/convex)
- Clerk Discord: [discord.gg/clerk](https://discord.gg/clerk)
- Railway Discord: [discord.gg/railway](https://discord.gg/railway)
