# HELFI PROJECT DOCUMENTATION

## 🚨 CRITICAL INFORMATION - READ FIRST

### Current Live Status (Updated: January 25, 2025)
- **Live Domain**: https://helfi.ai and https://www.helfi.ai
- **Current Deployment**: helfi-amip9cblh-louie-veleskis-projects.vercel.app
- **Status**: ✅ WORKING PERFECTLY - Desktop layout fixed, mobile menu working, all features live
- **Support Email**: support@helfi.ai (temporarily disabled due to auth issues)
- **Last Emergency Fix**: January 25, 2025 - Resolved NextAuth authentication blocking entire site

### Vercel Configuration
- **Project**: louie-veleskis-projects/helfi-app
- **GitHub Repo**: https://github.com/helfiapp/helfi-app
- **Domain Aliases**: 
  - helfi.ai → helfi-jokds0zjf-louie-veleskis-projects.vercel.app
  - www.helfi.ai → helfi-jokds0zjf-louie-veleskis-projects.vercel.app

## 📋 TODOIST AUTOMATION

### API Configuration
- **API Token**: d0660d66040e5b60fd4d95cf7ecffc84ad492099
- **Project**: HELFI PROJECTS
- **Monitor Script**: `todoist-monitor.js` (running continuously)
- **Monitoring Sections**:
  - "NEED TO BE FIXED" (auto-processes and fixes issues)
  - "FEATURE REQUESTS" (auto-implements features)
- **Review Section**: "Louie To Review" (completed tasks moved here)

### Automation Status
- ✅ Running: Auto-monitor checks every 2 minutes
- ✅ Completed Tasks:
  - Support email (created support@helfi.ai page)
  - Onboarding sections (restored missing sections)
  - Footer copyright year update

## 🎨 DESIGN DECISIONS

### Homepage Layout (CRITICAL - Don't Change!)
- **Hero Section**: `py-20` padding (generous spacing)
- **Hero Text**: `text-7xl` on desktop (large, impactful)
- **Logo Size**: `w-32 h-32` on desktop, `w-24 h-24` on mobile
- **Margins**: `mb-16` for section spacing, `p-8` for content padding
- **Background**: Gradient from helfi-green/5 to blue-50

### Why These Decisions Were Made
- Previous cramped layout (py-12, text-5xl) looked "terrible" per user feedback
- Desktop needs generous spacing and large text for impact
- Mobile responsiveness maintained with smaller sizes

## 🚀 DEPLOYMENT PROCESS

### Standard Deployment Commands
```bash
# 1. Commit changes
git add .
git commit -m "Description of changes"
git push

# 2. Deploy to production
vercel --prod --scope louie-veleskis-projects

# 3. Update domain aliases (if needed)
vercel alias set [new-deployment-url] helfi.ai --scope louie-veleskis-projects
vercel alias set [new-deployment-url] www.helfi.ai --scope louie-veleskis-projects
```

### Troubleshooting Deployments
- **Issue**: Changes not appearing on live site
- **Cause**: Domain aliases pointing to old deployment
- **Solution**: Update aliases to latest deployment URL
- **Check**: `vercel alias ls --scope louie-veleskis-projects`

## 📁 KEY FILES & LOCATIONS

### Important Pages
- **Homepage**: `app/page.tsx` (main landing page)
- **Support Page**: `app/support/page.tsx` (support@helfi.ai contact)
- **Layout**: `app/layout.tsx` (global layout and metadata)

### Configuration Files
- **Todoist Monitor**: `todoist-monitor.js` (automation script)
- **Package.json**: Dependencies and scripts
- **Tailwind Config**: `tailwind.config.js` (styling configuration)

### Environment Variables (if any)
- Todoist API token stored in script file
- No .env file currently used

## 🔧 TECHNICAL STACK

### Frontend
- **Framework**: Next.js 14.1.0
- **Styling**: Tailwind CSS
- **Deployment**: Vercel
- **Domain**: helfi.ai (managed through Vercel)

### Automation
- **Task Management**: Todoist API
- **Auto-deployment**: GitHub → Vercel integration
- **Monitoring**: Custom Node.js script

## 📈 RECENT CHANGES LOG

### January 25, 2025
- ✅ Fixed desktop homepage layout (restored py-20, text-7xl)
- ✅ Created support page with support@helfi.ai
- ✅ Updated domain aliases to latest deployment
- ✅ Verified live site working correctly
- ✅ Todoist automation processing tasks successfully

### Previous Issues Resolved
- Homepage layout was cramped (fixed with proper spacing)
- Domain aliases pointing to old deployment (updated)
- Support email missing (implemented at /support)

## 🆘 EMERGENCY RECOVERY COMMANDS

### If Site Goes Down
```bash
# Check current deployments
vercel ls --scope louie-veleskis-projects

# Check domain aliases
vercel alias ls --scope louie-veleskis-projects

# Force new deployment
git add . && git commit -m "Emergency deployment" && git push
vercel --prod --scope louie-veleskis-projects

# Update aliases to new deployment
vercel alias set [new-url] helfi.ai --scope louie-veleskis-projects
vercel alias set [new-url] www.helfi.ai --scope louie-veleskis-projects
```

### If Todoist Automation Stops
```bash
# Restart monitor
node todoist-monitor.js

# Check if tasks are being processed
# Look for "🔍 Checking for new tasks..." messages
```

## 🎯 FUTURE CONSIDERATIONS

### Session Persistence Strategy
1. This documentation file tracks all decisions
2. Git history provides detailed change log
3. Vercel dashboard shows deployment history
4. Todoist tracks completed automation tasks

### Backup Plans
- All code in GitHub repository
- Vercel maintains deployment history
- Domain configuration persists in Vercel
- Todoist API integration documented

## 📞 SUPPORT INFORMATION

### Live Support Page
- **URL**: https://helfi.ai/support
- **Email**: support@helfi.ai
- **Features**: Contact form, FAQ, mobile responsive

### Contact Information
- Support email implemented and working
- Contact form functional on support page
- FAQ section covers common questions

---

**Last Updated**: January 25, 2025
**Status**: All systems operational ✅
**Next Review**: Check after any major changes 