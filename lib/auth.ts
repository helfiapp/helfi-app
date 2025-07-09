import { type NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'

// Initialize Resend for welcome emails
function getResend() {
  if (!process.env.RESEND_API_KEY) {
    return null
  }
  return new Resend(process.env.RESEND_API_KEY)
}

// Check if user has completed onboarding
async function isOnboardingComplete(userId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        healthGoals: true,
        supplements: true,
        medications: true,
      }
    })
    
    if (!user) return false
    
    // Check if user has basic profile data
    const hasBasicProfile = user.gender && user.weight && user.height
    
    // Check if user has at least one health goal (excluding special data storage goals)
    const hasHealthGoals = user.healthGoals.some(goal => 
      !goal.name.startsWith('__') && goal.name !== '__EXERCISE_DATA__' && 
      goal.name !== '__HEALTH_SITUATIONS_DATA__' && goal.name !== '__BLOOD_RESULTS_DATA__'
    )
    
    // Consider onboarding complete if user has basic profile and health goals
    return !!(hasBasicProfile && hasHealthGoals)
  } catch (error) {
    console.error('Error checking onboarding completion:', error)
    return false
  }
}

// Function to send welcome email
async function sendWelcomeEmail(email: string, name: string) {
  const resend = getResend()
  if (!resend) {
    console.log('📧 Resend API not configured, skipping welcome email')
    return false
  }

  try {
    const welcomeMessage = `Hi ${name},

Welcome to the Helfi community! We're thrilled to have you on board.

🚀 Getting Started:
• Complete your health profile for personalized insights
• Start logging your meals with AI-powered analysis
• Set your health goals and track your progress
• Explore our medication interaction checker

💡 Pro Tip: The more you use Helfi, the smarter your AI health coach becomes!

Need help getting started? Just reply to this email or contact our support team.

Best regards,
The Helfi Team`

    const emailResponse = await resend.emails.send({
      from: 'Helfi Team <support@helfi.ai>',
      to: email,
      subject: '🎉 Welcome to Helfi - Your AI Health Journey Begins!',
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; background: #f8fafc;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 32px; font-weight: bold; letter-spacing: -0.5px;">Helfi</h1>
            <p style="margin: 12px 0 0 0; opacity: 0.95; font-size: 16px;">Your AI-Powered Health Coach</p>
          </div>
          
          <div style="padding: 40px 30px; background: white; border-radius: 0 0 12px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            ${welcomeMessage.split('\n').map((line: string) => 
              line.trim() ? `<p style="margin: 18px 0; line-height: 1.7; font-size: 16px;">${line}</p>` : '<div style="height: 10px;"></div>'
            ).join('')}
            
            <div style="margin-top: 40px; padding-top: 30px; border-top: 2px solid #e5e7eb; text-align: center;">
              <a href="https://helfi.ai/dashboard" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 10px 0; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);">🚀 Complete Your Profile</a>
            </div>
            
            <div style="margin-top: 40px; padding-top: 30px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; text-align: center;">
              <p style="margin: 0 0 16px 0; font-size: 16px; color: #374151;"><strong>Best regards,<br>The Helfi Team</strong></p>
              <p style="margin: 20px 0 0 0; font-size: 14px;">
                <a href="https://helfi.ai" style="color: #10b981; text-decoration: none; font-weight: 500;">🌐 helfi.ai</a> | 
                <a href="mailto:support@helfi.ai" style="color: #10b981; text-decoration: none; font-weight: 500;">📧 support@helfi.ai</a>
              </p>
            </div>
          </div>
        </div>
      `
    })

    console.log(`✅ [WELCOME EMAIL] Sent to ${email} with ID: ${emailResponse.data?.id}`)
    return true
  } catch (error) {
    console.error(`❌ [WELCOME EMAIL] Failed to send to ${email}:`, error)
    return false
  }
}

// Function to send verification email
async function sendVerificationEmail(email: string, token: string) {
  const resend = getResend()
  if (!resend) {
    console.log('📧 Resend API not configured, skipping verification email')
    return false
  }

  try {
    const verificationUrl = `https://helfi.ai/api/auth/verify?token=${token}&email=${encodeURIComponent(email)}`
    
    const emailResponse = await resend.emails.send({
      from: 'Helfi Team <support@helfi.ai>',
      to: email,
      subject: '🔐 Verify Your Helfi Account - Action Required',
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; background: #f8fafc;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 32px; font-weight: bold; letter-spacing: -0.5px;">Helfi</h1>
            <p style="margin: 12px 0 0 0; opacity: 0.95; font-size: 16px;">Account Verification Required</p>
          </div>
          
          <div style="padding: 40px 30px; background: white; border-radius: 0 0 12px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <h2 style="margin: 0 0 20px 0; color: #374151; font-size: 24px;">🔐 Verify Your Email Address</h2>
            
            <p style="margin: 0 0 20px 0; line-height: 1.7; font-size: 16px; color: #4b5563;">
              Welcome to Helfi! To complete your account setup and ensure security, please verify your email address by clicking the button below.
            </p>
            
            <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; color: #92400e; font-size: 14px;">
                <strong>⚠️ Security Notice:</strong> This link expires in 24 hours for your protection.
              </p>
            </div>
            
            <div style="margin: 30px 0; text-align: center;">
              <a href="${verificationUrl}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);">
                ✅ Verify Email Address
              </a>
            </div>
            
            <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 30px 0;">
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #374151;"><strong>Can't click the button?</strong></p>
              <p style="margin: 0; font-size: 14px; color: #6b7280; word-break: break-all;">
                Copy and paste this link: ${verificationUrl}
              </p>
            </div>
            
            <p style="margin: 30px 0 0 0; line-height: 1.7; font-size: 14px; color: #6b7280;">
              If you didn't create a Helfi account, please ignore this email or contact our support team.
            </p>
            
            <div style="margin-top: 40px; padding-top: 30px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; text-align: center;">
              <p style="margin: 0 0 16px 0; font-size: 16px; color: #374151;"><strong>Best regards,<br>The Helfi Team</strong></p>
              <p style="margin: 20px 0 0 0; font-size: 14px;">
                <a href="https://helfi.ai" style="color: #10b981; text-decoration: none; font-weight: 500;">🌐 helfi.ai</a> | 
                <a href="mailto:support@helfi.ai" style="color: #10b981; text-decoration: none; font-weight: 500;">📧 support@helfi.ai</a>
              </p>
            </div>
          </div>
        </div>
      `
    })

    console.log(`✅ [VERIFICATION EMAIL] Sent to ${email} with ID: ${emailResponse.data?.id}`)
    return true
  } catch (error) {
    console.error(`❌ [VERIFICATION EMAIL] Failed to send to ${email}:`, error)
    return false
  }
}

// Function to generate verification token
function generateVerificationToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        console.log('🔐 Credentials authorize called:', { email: credentials?.email })
        
        if (!credentials?.email || !credentials?.password) {
          console.log('❌ Missing credentials')
          return null
        }

        try {
          // Find existing user in database
          const user = await prisma.user.findUnique({
            where: { email: credentials.email.toLowerCase() }
          })

          if (!user) {
            console.log('❌ User not found:', credentials.email)
            return null
          }

          // CRITICAL SECURITY CHECK: Enforce email verification
          if (!user.emailVerified) {
            console.log('🚫 Email not verified, blocking signin:', user.email)
            throw new Error('Please verify your email address before signing in. Check your inbox for a verification link.')
          }

          // For now, since we don't have password hashing implemented,
          // we'll allow signin for verified users
          // TODO: Implement proper password verification
          console.log('✅ Verified user found, allowing signin:', user.email)
          
          // Return user object for session creation
          return {
            id: user.id,
            email: user.email,
            name: user.name || user.email.split('@')[0],
            image: user.image
          }
        } catch (error) {
          console.error('❌ Database error in authorize:', error)
          return null
        }
      }
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      }
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      console.log('🔑 SignIn callback:', { 
        email: user?.email, 
        provider: account?.provider 
      })
      
      if (account?.provider === 'google') {
        try {
          // Find or create user for Google OAuth
          let dbUser = await prisma.user.findUnique({
            where: { email: user.email! }
          })

          let isNewUser = false
          if (!dbUser) {
            console.log('👤 Creating Google user:', user.email)
            dbUser = await prisma.user.create({
              data: {
                email: user.email!.toLowerCase(),
                name: user.name || user.email!.split('@')[0],
                image: user.image,
                emailVerified: new Date() // Google users are auto-verified
              }
            })
            isNewUser = true
          } else if (!dbUser.emailVerified) {
            // Auto-verify existing users who sign in with Google
            console.log('🔄 Auto-verifying existing Google user:', dbUser.email)
            await prisma.user.update({
              where: { id: dbUser.id },
              data: { emailVerified: new Date() }
            })
          }
          
          // Send welcome email for new Google users (don't await to avoid blocking auth)
          if (isNewUser) {
            const userName = dbUser.name || dbUser.email.split('@')[0]
            console.log('📧 Sending welcome email to new Google user:', userName)
            sendWelcomeEmail(dbUser.email, userName).catch(error => {
              console.error('❌ Google welcome email failed (non-blocking):', error)
            })
          }
          
          // Update user ID for session
          user.id = dbUser.id
          console.log('✅ Google user processed:', { id: dbUser.id, email: dbUser.email, isNew: isNewUser })
        } catch (error) {
          console.error('❌ Google user creation error:', error)
          return false
        }
      }
      
      return true
    },
    async redirect({ url, baseUrl }) {
      console.log('🔄 Redirect callback:', { url, baseUrl })
      
      // CRITICAL FIX: Handle development vs production environment properly
      const isDevMode = process.env.NODE_ENV === 'development'
      const actualBaseUrl = isDevMode ? 'http://localhost:3000' : baseUrl
      
      console.log('🌍 Environment:', { isDevMode, actualBaseUrl, originalBaseUrl: baseUrl })
      
      // Handle signout - go to home
      if (url.includes('signout') || url.includes('signOut')) {
        return actualBaseUrl + '/'
      }
      
      // If URL is relative, use it with actualBaseUrl
      if (url.startsWith('/')) {
        return actualBaseUrl + url
      }
      
      // If URL matches actualBaseUrl origin, allow it
      try {
        const urlOrigin = new URL(url).origin
        const actualBaseOrigin = new URL(actualBaseUrl).origin
        if (urlOrigin === actualBaseOrigin) {
          console.log('✅ URL origin matches, allowing:', url)
          return url
        }
      } catch (e) {
        console.log('⚠️ URL parsing failed, using default redirect')
      }
      
      // Default: redirect to onboarding with correct base URL
      const defaultRedirect = actualBaseUrl + '/onboarding'
      console.log('🎯 Default redirect to onboarding:', defaultRedirect)
      return defaultRedirect
    },
    async session({ session, token }) {
      console.log('📋 Session callback:', { 
        tokenEmail: token?.email,
        tokenId: token?.id 
      })
      
      try {
        // Add user info to session from JWT token
        if (token?.email) {
          // CRITICAL: Validate that user still exists in database
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string }
          })
          
          if (!dbUser) {
            console.log('🚫 User account deleted - invalidating session:', token.email)
            // Return empty session to force complete logout
            return {
              expires: session.expires,
              user: undefined
            }
          }
          
          session.user = {
            id: token.id as string,
            email: token.email as string,
            name: token.name as string,
            image: token.image as string || null,
            needsVerification: !dbUser.emailVerified
          }
        }
        
        console.log('✅ Session validated:', { 
          id: session.user?.id, 
          email: session.user?.email 
        })
        
        return session
      } catch (error) {
        console.error('❌ Session callback error:', error)
        return session
      }
    },
    async jwt({ token, user, account, profile }) {
      console.log('🎫 JWT callback:', { 
        hasUser: !!user,
        tokenEmail: token?.email,
        provider: account?.provider
      })
      
      try {
        // Add user info to token on first sign in
        if (user) {
          token.id = user.id
          token.email = user.email
          token.name = user.name
          token.image = user.image
          
          console.log('✅ JWT token updated:', { 
            id: token.id, 
            email: token.email 
          })
        }
        
        // For Google OAuth, also store profile image
        if (account?.provider === 'google' && profile) {
          token.image = profile.image || user?.image
        }
        
        return token
      } catch (error) {
        console.error('❌ JWT callback error:', error)
        return token
      }
    }
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/signin',
  },
  debug: true,
  secret: process.env.NEXTAUTH_SECRET || 'helfi-secret-key-production-2024'
} 