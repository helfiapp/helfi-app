# 🔧 CLOUDINARY SETUP INSTRUCTIONS

## **Profile Image Upload Fix**

Your profile image upload is failing because Cloudinary environment variables are missing. 

## **Add These Lines to Your .env Files**

Add these lines to **both** `.env` and `.env.local` files:

```bash
# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME="your_cloudinary_cloud_name_here"
CLOUDINARY_API_KEY="your_cloudinary_api_key_here"  
CLOUDINARY_API_SECRET="your_cloudinary_api_secret_here"
```

## **Where to Get Cloudinary Credentials**

1. **Go to**: https://cloudinary.com/
2. **Sign up/login** to your account
3. **Go to Dashboard** 
4. **Copy these values**:
   - Cloud Name
   - API Key  
   - API Secret

## **Replace the Placeholders**

Replace `"your_cloudinary_cloud_name_here"` etc. with your actual Cloudinary credentials.

## **Restart Development Server**

After adding the credentials:
```bash
npm run dev
```

## **Test Profile Upload**

Once credentials are added, the profile image upload should work at:
- https://www.helfi.ai/profile/image

---

**Note**: The upload API code is already implemented correctly - it just needs the credentials to work. 