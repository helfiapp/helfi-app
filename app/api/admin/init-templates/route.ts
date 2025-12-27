import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { extractAdminFromHeaders } from '@/lib/admin-auth'

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    if (!admin) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Use raw SQL to create table and insert templates
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "EmailTemplate" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "category" TEXT NOT NULL DEFAULT 'MARKETING',
        "subject" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
        "createdBy" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        
        CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
      );
    `

    // Check if templates already exist
    const count = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "EmailTemplate"` as any[]
    const templateCount = parseInt(count[0]?.count || '0')
    
    if (templateCount > 0) {
      return NextResponse.json({ 
        message: 'Templates already initialized',
        count: templateCount 
      })
    }

    // Insert built-in templates using raw SQL
    const templateId1 = 'tmpl_' + Math.random().toString(36).substring(2)
    const templateId2 = 'tmpl_' + Math.random().toString(36).substring(2)
    const templateId3 = 'tmpl_' + Math.random().toString(36).substring(2)
    const templateId4 = 'tmpl_' + Math.random().toString(36).substring(2)
    const templateId5 = 'tmpl_' + Math.random().toString(36).substring(2)

    await prisma.$executeRaw`
      INSERT INTO "EmailTemplate" ("id", "name", "category", "subject", "content", "isBuiltIn", "createdBy") VALUES
      (${templateId1}, 'Welcome Email', 'ONBOARDING', '🎉 Welcome to Helfi - Your AI Health Journey Begins!', 
       'Hi {name},\n\nWelcome to the Helfi community! We''re thrilled to have you on board.\n\n🚀 Getting Started:\n• Complete your health profile for personalized insights\n• Start logging your meals with AI-powered analysis\n• Set your health goals and track your progress\n• Explore our medication interaction checker\n\n💡 Pro Tip: The more you use Helfi, the smarter your AI health coach becomes!\n\nNeed help getting started? Just reply to this email or contact our support team.\n\nBest regards,\nThe Helfi Team', 
       true, ${admin.adminId}),
      (${templateId2}, 'Premium Upgrade', 'MARKETING', '🔥 Unlock Your Full Health Potential with Helfi Premium',
       'Hi {name},\n\nReady to supercharge your health journey? Helfi Premium gives you everything you need:\n\n✨ Premium Benefits:\n• 30 AI food analyses per day (vs 3 on free)\n• 30 medical image analyses per day\n• Advanced medication interaction checking\n• Priority customer support\n• Early access to new features\n\n🎯 Special Offer: Get 14 days free when you upgrade today!\n\n[Upgrade to Premium - helfi.ai/billing]\n\nYour health deserves the best tools. Let''s make it happen!\n\nBest regards,\nThe Helfi Team',
       true, ${admin.adminId}),
      (${templateId3}, 'Re-engagement', 'RETENTION', '🌟 Your Health Journey Awaits - Come Back to Helfi!',
       'Hi {name},\n\nWe miss you at Helfi! Your health journey is important, and we''re here to support you every step of the way.\n\n🎯 Quick Health Check:\n• Log today''s meals in under 2 minutes\n• Check if your medications interact safely\n• Review your progress toward your health goals\n\n💪 Remember: Small daily actions lead to big health transformations.\n\nReady to continue your journey? We''re excited to see your progress!\n\n[Continue Your Journey - helfi.ai]\n\nBest regards,\nThe Helfi Team',
       true, ${admin.adminId}),
      (${templateId4}, 'Feature Announcement', 'ANNOUNCEMENTS', '🆕 Exciting New Features Just Dropped at Helfi!',
       'Hi {name},\n\nBig news! We''ve just released some amazing new features that will take your health journey to the next level:\n\n🔥 What''s New:\n• Enhanced AI food analysis with better accuracy\n• New medical image analysis for skin conditions\n• Improved medication interaction database\n• Faster mobile app performance\n• Smart health insights dashboard\n\n✨ Ready to explore? Log in to your Helfi account and discover these powerful new tools.\n\n[Explore New Features - helfi.ai]\n\nYour feedback helps us build better health tools. Let us know what you think!\n\nBest regards,\nThe Helfi Team',
       true, ${admin.adminId}),
      (${templateId5}, 'Support Follow-up', 'SUPPORT', '🤝 Following Up - How Can We Help You Better?',
       'Hi {name},\n\nHope you''re doing well! We wanted to follow up and see how your experience with Helfi has been going.\n\n🤔 We''d love to know:\n• Are you finding the features helpful?\n• Is there anything confusing or frustrating?\n• What would make Helfi even better for you?\n\n💬 Your feedback matters! Just reply to this email with your thoughts - our team reads every response personally.\n\n🆘 Need immediate help? Contact us at support@helfi.ai\n\nThank you for being part of the Helfi community!\n\nBest regards,\nThe Helfi Team',
       true, ${admin.adminId})
    `

    return NextResponse.json({ 
      message: 'Email templates initialized successfully!',
      created: 5,
      templates: ['Welcome Email', 'Premium Upgrade', 'Re-engagement', 'Feature Announcement', 'Support Follow-up']
    })
  } catch (error) {
    console.error('Error initializing email templates:', error)
    return NextResponse.json({ 
      error: 'Failed to initialize templates',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 
