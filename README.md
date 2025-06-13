# Helfi - Personal Health Intelligence Platform

Helfi is a personal-health intelligence platform that combines passive data collection, manual logging, and conversational AI to help users identify exactly what makes them feel, look, and perform their best.

## Features

- User registration and authentication (Google + Magic Link)
- Health metrics tracking and visualization
- Supplement and medication management
- AI-powered health insights
- Passive data sync with health platforms
- Smart reminders and notifications
- Food photo analysis
- Symptom tracking and analysis

## Tech Stack

- Next.js 14
- TypeScript
- Tailwind CSS
- Prisma (Database ORM)
- NextAuth.js (Authentication)
- Chart.js (Data Visualization)
- Cloudinary (Image Management)

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   Create a `.env` file in the root directory with the following variables:
   ```
   DATABASE_URL="your_database_url"
   NEXTAUTH_SECRET="your_nextauth_secret"
   NEXTAUTH_URL="http://localhost:3000"
   GOOGLE_CLIENT_ID="your_google_client_id"
   GOOGLE_CLIENT_SECRET="your_google_client_secret"
   CLOUDINARY_CLOUD_NAME="your_cloudinary_cloud_name"
   CLOUDINARY_API_KEY="your_cloudinary_api_key"
   CLOUDINARY_API_SECRET="your_cloudinary_api_secret"
   ```

4. Initialize the database:
   ```bash
   npx prisma db push
   ```

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
helfi/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── auth/              # Authentication pages
│   ├── dashboard/         # Dashboard pages
│   ├── onboarding/        # Onboarding flow
│   └── (routes)/          # Other app routes
├── components/            # Reusable components
├── lib/                   # Utility functions
├── prisma/               # Database schema
├── public/               # Static assets
└── styles/               # Global styles
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is proprietary and confidential. All rights reserved.

## 🚀 Live Site
- **Production**: https://helfi.ai
- **Support**: https://helfi.ai/support (support@helfi.ai)

## 📚 DOCUMENTATION (CRITICAL - READ THESE!)

### 🆘 **START HERE IF CURSOR CLOSED**
- **[PROJECT_NOTES.md](./PROJECT_NOTES.md)** - Complete project overview, current status, and critical information
- **[QUICK_COMMANDS.md](./QUICK_COMMANDS.md)** - Essential commands for immediate use
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Common issues and solutions

### 📋 Additional Documentation
- **[DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md)** - Layout decisions and reasoning (why py-20, text-7xl, etc.)

## 🤖 AUTOMATION STATUS
- **Todoist Monitor**: `node todoist-monitor.js` (auto-processes tasks every 2 minutes)
- **API Token**: d0660d66040e5b60fd4d95cf7ecffc84ad492099
- **Sections Monitored**: "NEED TO BE FIXED", "FEATURE REQUESTS"

## 🔧 QUICK START

### Deploy Changes
```bash
git add .
git commit -m "Your changes"
git push
vercel --prod --scope louie-veleskis-projects
```

### Emergency Recovery
```bash
# If site not updating
vercel alias ls --scope louie-veleskis-projects
vercel alias set [latest-deployment] helfi.ai --scope louie-veleskis-projects
```

## 📁 KEY FILES
- `app/page.tsx` - Homepage (py-20, text-7xl layout)
- `app/support/page.tsx` - Support page
- `todoist-monitor.js` - Automation script

## 🎯 CURRENT STATUS (January 25, 2025)
- ✅ Live site working correctly
- ✅ Desktop layout fixed (generous spacing)
- ✅ Support page implemented
- ✅ Todoist automation running
- ✅ All documentation created

---

**⚠️ IMPORTANT**: If you're reading this after Cursor closed, check `PROJECT_NOTES.md` first for complete context! 