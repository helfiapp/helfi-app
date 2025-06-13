# QUICK COMMANDS REFERENCE

## 🚀 DEPLOYMENT (Most Common)

```bash
# Standard deployment process
git add .
git commit -m "Your change description"
git push
vercel --prod --scope louie-veleskis-projects
```

## 🔧 EMERGENCY FIXES

### Site Not Updating
```bash
# Check what's deployed
vercel ls --scope louie-veleskis-projects

# Check domain aliases
vercel alias ls --scope louie-veleskis-projects

# Update aliases to latest deployment
vercel alias set [latest-deployment-url] helfi.ai --scope louie-veleskis-projects
vercel alias set [latest-deployment-url] www.helfi.ai --scope louie-veleskis-projects
```

### Force Fresh Deployment
```bash
echo "# Force deployment $(date)" >> .temp-deploy
git add .
git commit -m "Force fresh deployment"
git push
vercel --prod --scope louie-veleskis-projects
rm .temp-deploy
```

## 📋 TODOIST AUTOMATION

```bash
# Start/restart automation
node todoist-monitor.js

# Check if running (look for "🔍 Checking for new tasks..." every 2 minutes)
```

## 🔍 STATUS CHECKS

```bash
# Check git status
git status
git log --oneline -5

# Check live site
curl -s https://helfi.ai | head -20

# Check deployments
vercel ls --scope louie-veleskis-projects

# Check domain aliases
vercel alias ls --scope louie-veleskis-projects
```

## 📁 KEY FILES TO REMEMBER

- `app/page.tsx` - Homepage (py-20, text-7xl layout)
- `app/support/page.tsx` - Support page
- `todoist-monitor.js` - Automation script
- `PROJECT_NOTES.md` - Full documentation

## 🆘 CRITICAL INFO

- **Domain**: helfi.ai
- **Current Deployment**: helfi-mk5nt946f-louie-veleskis-projects.vercel.app
- **Todoist API**: d0660d66040e5b60fd4d95cf7ecffc84ad492099
- **Support Email**: support@helfi.ai 