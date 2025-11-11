# Fitbit Integration Setup Guide

## Overview

This document describes how to set up and configure Fitbit integration for the Helfi app. The integration allows users to connect their Fitbit accounts and sync health data (steps, heart rate, sleep, weight) into Helfi.

## Fitbit App Details

- **OAuth 2.0 Client ID**: `23TPZH`
- **Client Secret**: (stored securely in environment variables)
- **Redirect URL**: `https://helfi.ai/api/auth/fitbit/callback`
- **OAuth 2.0 Authorization URL**: `https://www.fitbit.com/oauth2/authorize`
- **Access/Refresh Token Request URL**: `https://api.fitbit.com/oauth2/token`
- **Default Access Type**: Read Only
- **OAuth 2.0 Type**: Server
- **Scopes**: `activity heartrate sleep profile weight`

## Environment Variables

Add the following environment variables to your `.env.local` file and sync them to Vercel:

```bash
# Fitbit OAuth Credentials
FITBIT_CLIENT_ID=23TPZH
FITBIT_CLIENT_SECRET=your_client_secret_here
FITBIT_REDIRECT_URI=https://helfi.ai/api/auth/fitbit/callback
```

### Setting Up Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add each variable:
   - `FITBIT_CLIENT_ID`: `23TPZH`
   - `FITBIT_CLIENT_SECRET`: (Get from Fitbit Developer Portal)
   - `FITBIT_REDIRECT_URI`: `https://helfi.ai/api/auth/fitbit/callback`

**Important**: For production, make sure to set these variables for the **Production** environment. You can also add them for Preview/Development environments if needed.

## Database Migration

After adding the FitbitData model to the Prisma schema, run the migration:

```bash
npx prisma migrate dev --name add_fitbit_integration
```

Or if you're using production:

```bash
npx prisma migrate deploy
```

## API Endpoints

### Authorization Flow

1. **Initiate OAuth**: `GET /api/auth/fitbit/authorize`
   - Redirects user to Fitbit authorization page
   - Requires user to be logged in

2. **OAuth Callback**: `GET /api/auth/fitbit/callback`
   - Handles Fitbit OAuth callback
   - Stores tokens in Account table
   - Redirects to settings page with success/error status

### Data Management

1. **Check Connection Status**: `GET /api/fitbit/status`
   - Returns connection status and Fitbit user ID

2. **Disconnect Account**: `DELETE /api/fitbit/status`
   - Removes Fitbit account connection
   - Optionally deletes synced data

3. **Sync Data**: `POST /api/fitbit/sync`
   - Syncs Fitbit data for specified date
   - Supports: steps, heartrate, sleep, weight
   - Request body:
     ```json
     {
       "date": "2024-01-15",
       "dataTypes": ["steps", "heartrate", "sleep", "weight"]
     }
     ```

4. **Get Synced Data**: `GET /api/fitbit/data?date=2024-01-15&dataType=steps`
   - Retrieves previously synced Fitbit data

## User Flow

1. User navigates to Settings page
2. Clicks "Connect Fitbit" button
3. Redirected to Fitbit authorization page
4. User authorizes Helfi to access their Fitbit data
5. Redirected back to Helfi settings page
6. Connection status shows as "Connected"
7. User can manually sync data or set up automatic syncing

## Data Storage

Fitbit data is stored in the `FitbitData` table with the following structure:

- `userId`: Links to User
- `date`: Date of the data (YYYY-MM-DD)
- `dataType`: Type of data ('steps', 'heartrate', 'sleep', 'weight', 'activity')
- `value`: JSON field storing the actual data from Fitbit API
- `syncedAt`: Timestamp of last sync

## Token Management

The integration automatically handles token refresh:
- Access tokens expire after 8 hours
- Refresh tokens are used to obtain new access tokens
- Tokens are stored securely in the `Account` table
- Token refresh happens automatically when needed

## Security Considerations

1. **Client Secret**: Never commit the client secret to version control
2. **State Parameter**: OAuth flow uses state parameter for CSRF protection
3. **Session Verification**: Callback verifies user session matches OAuth state
4. **Token Storage**: Tokens are encrypted at rest in the database
5. **Read-Only Access**: Integration uses read-only scopes

## Testing

1. Ensure environment variables are set correctly
2. Run database migration
3. Test OAuth flow:
   - Navigate to `/settings`
   - Click "Connect Fitbit"
   - Complete Fitbit authorization
   - Verify connection status updates
4. Test data sync:
   - Click "Sync Data Now"
   - Verify data appears in database
   - Check API response for synced data

## Troubleshooting

### Common Issues

1. **"Fitbit credentials not configured"**
   - Check environment variables are set in Vercel
   - Verify variable names match exactly (case-sensitive)

2. **"Invalid redirect URI"**
   - Ensure redirect URI in Fitbit Developer Portal matches exactly
   - Check for trailing slashes or protocol mismatches

3. **"Token refresh failed"**
   - Verify client secret is correct
   - Check Fitbit API status
   - Review server logs for detailed error messages

4. **"Session mismatch"**
   - User must be logged in before connecting Fitbit
   - Clear browser cookies and try again

## Fitbit API Rate Limits

Fitbit API has rate limits:
- 150 requests per hour per user
- Consider implementing rate limiting for sync operations
- Cache data when possible to reduce API calls

## Future Enhancements

- Automatic background syncing
- Historical data import
- Data visualization in dashboard
- Webhook support for real-time updates
- Multiple Fitbit account support

