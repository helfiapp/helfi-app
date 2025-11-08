# Simple Testing Guide - PDF Lab Reports

## Step 1: Setup (Do This First)

### 1.1 Enable Vercel Blob Storage
1. Go to https://vercel.com/dashboard
2. Click on your Helfi project
3. Click the **Storage** tab at the top
4. Click **Create Database**
5. Select **Blob**
6. Click **Create**
7. ✅ Done! Vercel automatically adds the token you need

### 1.2 Generate Encryption Key
1. Open Terminal (on your Mac)
2. Run this command:
   ```bash
   openssl rand -base64 32
   ```
3. Copy the long string it gives you (looks like: `aBc123XyZ...`)
4. You'll need this in the next step

### 1.3 Add Environment Variables
1. In Vercel dashboard, go to your project
2. Click **Settings** → **Environment Variables**
3. Add this new variable:
   - **Name:** `ENCRYPTION_MASTER_KEY`
   - **Value:** Paste the key you copied from step 1.2
   - **Environment:** Production, Preview, Development (check all)
4. Click **Save**

### 1.4 Run Database Migration
1. Open Terminal in your project folder
2. Run:
   ```bash
   npx prisma migrate dev --name pdf_encryption_pipeline
   ```
3. If it asks questions, just press Enter
4. ✅ Done when you see "Migration applied"

### 1.5 Deploy to Live Site
1. In Terminal, run:
   ```bash
   git add .
   git commit -m "Add PDF lab report system"
   git push
   ```
2. Wait 2-3 minutes for Vercel to deploy
3. ✅ Done when deployment shows "Ready"

---

## Step 2: Test It Works

### Test 1: Can You See the Upload Page?
1. Go to: `https://helfi.ai/lab-reports`
2. ✅ **Should see:** A page with "Upload Laboratory Report" heading
3. ❌ **If you see:** 404 error or blank page = something's wrong

### Test 2: Can You Upload a PDF?
1. On the `/lab-reports` page
2. Click **"Select PDF File"**
3. Choose any PDF file from your computer (even a test one)
4. ✅ **Should see:** File name appears below the button
5. ❌ **If you see:** Error message = check browser console (F12)

### Test 3: Can You Give Consent?
1. After selecting a PDF
2. Check the two required boxes:
   - ✅ "I authorize Helfi to decrypt..."
   - ✅ "I understand Helfi will not store..."
3. ✅ **Should see:** "Upload and Process PDF" button becomes clickable
4. ❌ **If you see:** Button stays grayed out = check both boxes

### Test 4: Can You Upload and Process?
1. Click **"Upload and Process PDF"**
2. ✅ **Should see:** 
   - "Uploading PDF..." (spinner)
   - Then "Processing PDF..." (spinner)
   - Then "PDF Processed Successfully!" (green checkmark)
3. ❌ **If you see:** 
   - Red error message = check what it says
   - Stuck on "Uploading..." = check Vercel logs
   - Stuck on "Processing..." = check server logs

### Test 5: Check Database (Optional)
1. Go to your database (Neon, Supabase, etc.)
2. Look at the `Report` table
3. ✅ **Should see:** A new row with your PDF info
4. Look at the `LabResult` table
5. ✅ **Should see:** Encrypted data (looks like random text, not readable)
6. ❌ **If you see:** Plain text lab values = encryption not working

---

## Step 3: What to Check If It's Not Working

### Problem: "BLOB_READ_WRITE_TOKEN not configured"
**Fix:** Make sure you created Blob storage in Vercel (Step 1.1)

### Problem: "ENCRYPTION_MASTER_KEY not configured"
**Fix:** Add the environment variable in Vercel (Step 1.3)

### Problem: "Report not found" or database errors
**Fix:** Run the migration (Step 1.4)

### Problem: Upload fails immediately
**Check:** 
- Browser console (F12 → Console tab) for errors
- Vercel deployment logs (Dashboard → Deployments → Click latest → Functions tab)

### Problem: Processing fails
**Check:**
- Vercel function logs (same place as above)
- Look for error messages about PDF parsing or encryption

---

## Step 4: Quick Success Checklist

- [ ] Can access `/lab-reports` page
- [ ] Can select a PDF file
- [ ] Can check consent boxes
- [ ] Can click upload button
- [ ] See "Uploading..." message
- [ ] See "Processing..." message  
- [ ] See "PDF Processed Successfully!" message
- [ ] No error messages appear

If all checked ✅ = **It's working!**

---

## Need Help?

**Check these places:**
1. **Browser Console:** Press F12 → Console tab (shows frontend errors)
2. **Vercel Logs:** Dashboard → Your Project → Deployments → Latest → Functions tab
3. **Database:** Check if tables exist (Report, LabResult, ConsentRecord, AuditEvent)

**Common Issues:**
- Forgot to run migration → Run Step 1.4
- Missing environment variable → Check Step 1.3
- Blob storage not created → Check Step 1.1
- Code not deployed → Check Step 1.5

