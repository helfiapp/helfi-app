# TROUBLESHOOTING GUIDE

## 🚨 COMMON ISSUES & SOLUTIONS

### 1. Changes Not Appearing on Live Site

**Symptoms:**
- Code changes made but helfi.ai shows old version
- New features not visible on live domain
- Deployment successful but site unchanged

**Diagnosis:**
```bash
# Check current deployments
vercel ls --scope louie-veleskis-projects

# Check domain aliases
vercel alias ls --scope louie-veleskis-projects
```

**Solution:**
```bash
# Update domain aliases to latest deployment
vercel alias set [latest-deployment-url] helfi.ai --scope louie-veleskis-projects
vercel alias set [latest-deployment-url] www.helfi.ai --scope louie-veleskis-projects
```

**Root Cause:** Domain aliases pointing to old deployment

---

### 2. Todoist Automation Not Working

**Symptoms:**
- Tasks not being processed automatically
- No "🔍 Checking for new tasks..." messages
- Tasks stuck in "NEED TO BE FIXED" section

**Diagnosis:**
```bash
# Check if script is running
ps aux | grep todoist-monitor

# Check script output
node todoist-monitor.js
```

**Solution:**
```bash
# Restart the monitor
node todoist-monitor.js

# Should see:
# 🤖 Helfi Auto-Fix Monitor Started!
# 📁 Monitoring sections:
#   - NEED TO BE FIXED
#   - FEATURE REQUESTS
# ⏰ Checking every 2 minutes...
```

**Root Cause:** Script stopped or crashed

---

### 3. Layout Looks Cramped/Wrong

**Symptoms:**
- Homepage text too small
- Insufficient spacing between sections
- Layout looks "terrible" or cramped

**Diagnosis:**
Check `app/page.tsx` for these critical classes:
- Hero section: `py-20`
- Hero text: `text-7xl` (desktop)
- Logo: `w-32 h-32` (desktop)

**Solution:**
Ensure these exact classes are present:
```jsx
<section className="px-4 py-20">  {/* py-20 is critical */}
  <h1 className="text-4xl sm:text-5xl md:text-7xl">  {/* text-7xl for desktop */}
```

**Root Cause:** Critical layout classes changed or removed

---

### 4. Support Page Not Working

**Symptoms:**
- 404 error on helfi.ai/support
- Support email not accessible
- Contact form not working

**Diagnosis:**
```bash
# Check if support page exists
ls app/support/page.tsx

# Test support page
curl -s https://helfi.ai/support | head -20
```

**Solution:**
Ensure `app/support/page.tsx` exists and is properly deployed

**Root Cause:** Support page file missing or not deployed

---

### 5. Deployment Fails

**Symptoms:**
- `vercel --prod` command fails
- Build errors during deployment
- Deployment stuck or times out

**Diagnosis:**
```bash
# Check git status
git status

# Check for uncommitted changes
git diff

# Check recent commits
git log --oneline -5
```

**Solution:**
```bash
# Ensure all changes are committed
git add .
git commit -m "Fix deployment issues"
git push

# Try deployment again
vercel --prod --scope louie-veleskis-projects
```

**Root Cause:** Uncommitted changes or build errors

---

## 🔧 EMERGENCY RECOVERY

### Complete Site Recovery
If everything is broken:

```bash
# 1. Check git status
git status
git log --oneline -5

# 2. Force fresh deployment
echo "# Emergency deployment $(date)" >> .temp-deploy
git add .
git commit -m "Emergency recovery deployment"
git push

# 3. Deploy to production
vercel --prod --scope louie-veleskis-projects

# 4. Update domain aliases
vercel alias set [new-deployment-url] helfi.ai --scope louie-veleskis-projects
vercel alias set [new-deployment-url] www.helfi.ai --scope louie-veleskis-projects

# 5. Clean up
rm .temp-deploy
```

### Rollback to Previous Version
If new changes broke something:

```bash
# Find last working commit
git log --oneline -10

# Rollback to specific commit
git reset --hard [commit-hash]
git push --force

# Deploy the rollback
vercel --prod --scope louie-veleskis-projects
```

---

## 📋 DIAGNOSTIC COMMANDS

### Quick Health Check
```bash
# Check everything at once
echo "=== GIT STATUS ==="
git status

echo "=== RECENT COMMITS ==="
git log --oneline -5

echo "=== DEPLOYMENTS ==="
vercel ls --scope louie-veleskis-projects | head -5

echo "=== DOMAIN ALIASES ==="
vercel alias ls --scope louie-veleskis-projects | head -5

echo "=== LIVE SITE CHECK ==="
curl -s https://helfi.ai | head -10
```

### Detailed Diagnostics
```bash
# Check specific issues
echo "Checking layout classes..."
grep -n "py-20\|text-7xl\|w-32 h-32" app/page.tsx

echo "Checking support page..."
ls -la app/support/

echo "Checking todoist script..."
ls -la todoist-monitor.js
```

---

## 🆘 WHEN TO PANIC

### Red Flags
- ❌ helfi.ai returns 404 or error
- ❌ No deployments in Vercel dashboard
- ❌ GitHub repository missing or corrupted
- ❌ Domain aliases completely missing

### Stay Calm If
- ✅ Site loads but shows old version (alias issue)
- ✅ Deployment successful but changes not visible (alias issue)
- ✅ Todoist automation stopped (restart script)
- ✅ Layout looks wrong (check classes)

---

**Last Updated**: January 25, 2025
**Emergency Contact**: Check PROJECT_NOTES.md for all critical info 