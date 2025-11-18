# Nutrition API Integration Setup Guide

This document explains how to set up USDA and FatSecret API integrations for enhanced food analysis accuracy.

## API Rate Limits Summary

### USDA FoodData Central API
- **Rate Limit:** 1,000 requests per hour per IP address (free tier)
- **Daily Limit:** ~24,000 requests/day (if spread evenly)
- **Cost:** Free
- **Registration:** https://fdc.nal.usda.gov/api-guide.html

### FatSecret Platform API
- **Free Tier:** Check your FatSecret Platform dashboard for your specific limits
- **Cost:** Free tier available (check dashboard for limits)
- **Registration:** https://platform.fatsecret.com
- **Note:** Rate limits vary by plan tier - check your account dashboard

## Environment Variables Required

Add these to your `.env.local` file and Vercel environment variables:

```bash
# USDA API Key (get from https://fdc.nal.usda.gov/api-guide.html)
USDA_API_KEY=your_usda_api_key_here

# FatSecret Platform API Credentials (get from https://platform.fatsecret.com)
FATSECRET_CLIENT_ID=your_fatsecret_client_id
FATSECRET_CLIENT_SECRET=your_fatsecret_client_secret
```

## How It Works

### Photo Analysis Flow

1. **OpenAI Vision Analysis:**
   - Analyzes the photo and identifies ingredients
   - Estimates portion sizes
   - Provides initial nutrition estimates

2. **Database Enhancement (NEW):**
   - For each identified ingredient, looks up nutrition data in:
     - **USDA** (first priority - most accurate for generic foods)
     - **FatSecret** (fallback if USDA fails or rate-limited)
     - **OpenFoodFacts** (final fallback for branded products)
   - Replaces AI estimates with real database values
   - Recalculates totals based on enhanced data

3. **Result:**
   - More accurate nutrition values from verified databases
   - Better accuracy for common foods (burger buns, beef patties, etc.)
   - Automatic fallback if one API is unavailable

### Fallback Logic

The system automatically falls back between APIs:
- If USDA returns no results → tries FatSecret
- If FatSecret fails → tries OpenFoodFacts
- If all fail → uses OpenAI estimates (with improved prompts)

## Setting Up USDA API

1. Visit: https://fdc.nal.usda.gov/api-guide.html
2. Click "Get an API Key"
3. Register/login with data.gov account
4. Copy your API key
5. Add to `.env.local` and Vercel as `USDA_API_KEY`

## Setting Up FatSecret Platform API

1. Visit: https://platform.fatsecret.com
2. Log in to your account
3. Navigate to "Generate / View API Keys"
4. Create a new API key (or use existing)
5. Copy:
   - **Client ID** → `FATSECRET_CLIENT_ID`
   - **Client Secret** → `FATSECRET_CLIENT_SECRET`
6. Add both to `.env.local` and Vercel

## Testing the Integration

After adding credentials:

1. Analyze a food photo (e.g., burger)
2. Check server logs for:
   - `🔍 Enhancing items with USDA/FatSecret nutrition data...`
   - `✅ Found usda data for "Bun":` (or fatsecret)
3. Verify nutrition values are realistic (not 42 calories for a burger)

## Monitoring API Usage

- **USDA:** Monitor via data.gov dashboard
- **FatSecret:** Check usage in FatSecret Platform dashboard
- **Logs:** Server logs show which API was used for each lookup

## Troubleshooting

### "USDA_API_KEY not configured"
- Add `USDA_API_KEY` to `.env.local` and Vercel environment variables

### "FatSecret credentials not configured"
- Add `FATSECRET_CLIENT_ID` and `FATSECRET_CLIENT_SECRET` to environment

### "Rate limit exceeded"
- The system automatically falls back to the next API
- Check your usage in respective dashboards
- Consider upgrading plan if hitting limits frequently

### Items still showing low values
- Check server logs to see if database lookups are succeeding
- Verify API credentials are correct
- Some ingredients may not match database entries (falls back to OpenAI)

