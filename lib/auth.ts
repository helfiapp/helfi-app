import { type NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import AppleProvider from 'next-auth/providers/apple'
import GoogleProvider from 'next-auth/providers/google'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'
import { getEmailFooter } from '@/lib/email-footer'
import { notifyOwner } from '@/lib/owner-notifications'
import { sendOwnerSignupEmail } from '@/lib/admin-alerts'
import { getSessionRevokedAt } from '@/lib/session-revocation'
import { ensureFreeCreditColumns, NEW_USER_FREE_CREDITS } from '@/lib/free-credits'
import { getAppleClientSecret } from '@/lib/apple-client-secret'
import { sendWelcomeEmail } from '@/lib/welcome-email'
import bcrypt from 'bcryptjs'

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
        healthGoals: { orderBy: { updatedAt: 'desc' } },
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
            
            ${getEmailFooter({ recipientEmail: email, emailType: 'verification' })}
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

const providers: NonNullable<NextAuthOptions['providers']> = [
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

      const email = credentials.email.toLowerCase()
      const user = await prisma.user
        .findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            passwordHash: true,
            emailVerified: true,
          },
        })
        .catch((e) => {
          console.error('⚠️ prisma.user.findUnique failed:', e)
          return null
        })

      if (!user || !user.passwordHash) {
        console.log('❌ No password set for user:', email)
        return null
      }

      const match = await bcrypt.compare(credentials.password, user.passwordHash)
      if (!match) {
        console.log('❌ Invalid password for user:', email)
        return null
      }

      if (!user.emailVerified) {
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { emailVerified: new Date() },
          })
        } catch (error) {
          console.warn('⚠️ Failed to set emailVerified for user:', email, error)
        }
      }

      console.log('✅ Allowing credentials signin for user:', user.email)
      return {
        id: user.id,
        email: user.email,
        name: user.name || user.email.split('@')[0],
        image: user.image,
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
]

const appleClientId = String(process.env.APPLE_CLIENT_ID || '').trim()
const appleClientSecret = getAppleClientSecret()
if (appleClientId && appleClientSecret) {
  providers.push(
    AppleProvider({
      clientId: appleClientId,
      clientSecret: appleClientSecret,
    }),
  )
}

const normalizeEmail = (value: unknown) => {
  const email = String(value || '').trim().toLowerCase()
  return email || null
}

const readEmailFromIdToken = (idToken: unknown) => {
  const raw = String(idToken || '').trim()
  if (!raw) return null
  const parts = raw.split('.')
  if (parts.length < 2) return null
  try {
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')
    const decoded = Buffer.from(payload, 'base64').toString('utf8')
    const parsed = JSON.parse(decoded) as { email?: string }
    return normalizeEmail(parsed?.email)
  } catch {
    return null
  }
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    // Honor "keep me signed in" by defaulting to a very long session; explicit logout clears it.
    maxAge: 5 * 365 * 24 * 60 * 60, // ~5 years
    updateAge: 12 * 60 * 60, // refresh twice a day to avoid surprise logouts
  },
  jwt: {
    // Use a stable secret that doesn't change between deployments
    secret: process.env.NEXTAUTH_SECRET || 'helfi-secret-key-production-2024',
    maxAge: 5 * 365 * 24 * 60 * 60, // align with session maxAge (~5 years)
  },
  // Force long-lived, first-party cookies so mobile Safari won’t drop sessions between app switches.
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production' ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 5 * 365 * 24 * 60 * 60, // ~5 years
      },
    },
    callbackUrl: {
      name: process.env.NODE_ENV === 'production' ? '__Secure-next-auth.callback-url' : 'next-auth.callback-url',
      options: {
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    csrfToken: {
      name: process.env.NODE_ENV === 'production' ? '__Host-next-auth.csrf-token' : 'next-auth.csrf-token',
      options: {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    // Apple returns to callback using cross-site form POST. If these cookies are Lax,
    // Safari can drop them and OAuth completes with callback errors.
    pkceCodeVerifier: {
      name: process.env.NODE_ENV === 'production' ? '__Secure-next-auth.pkce.code_verifier' : 'next-auth.pkce.code_verifier',
      options: {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 900, // 15 minutes
      },
    },
    state: {
      name: process.env.NODE_ENV === 'production' ? '__Secure-next-auth.state' : 'next-auth.state',
      options: {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 900, // 15 minutes
      },
    },
    nonce: {
      name: process.env.NODE_ENV === 'production' ? '__Secure-next-auth.nonce' : 'next-auth.nonce',
      options: {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  providers,
  callbacks: {
    async signIn({ user, account, profile }) {
      console.log('🔑 SignIn callback:', { 
        email: user?.email, 
        provider: account?.provider 
      })
      
      if (account?.provider === 'google' || account?.provider === 'apple') {
        try {
          const providerLabel = account?.provider === 'apple' ? 'Apple' : 'Google'
          const provider = String(account?.provider || '').trim()
          const providerAccountId = String((account as any)?.providerAccountId || '').trim()

          // Apple can omit email on later sign-ins, so first try account-link lookup.
          const linkedAccount =
            provider && providerAccountId
              ? await prisma.account.findUnique({
                  where: {
                    provider_providerAccountId: {
                      provider,
                      providerAccountId,
                    },
                  },
                  include: { user: true },
                })
              : null

          let resolvedEmail =
            normalizeEmail(user?.email) ||
            normalizeEmail((profile as any)?.email) ||
            readEmailFromIdToken((account as any)?.id_token) ||
            normalizeEmail(linkedAccount?.user?.email)

          if (!resolvedEmail) {
            console.error('❌ OAuth sign in failed: provider did not return email and no linked account found', {
              provider: account?.provider,
              providerAccountId: providerAccountId || null,
            })
            return false
          }

          // Ensure wallet metering columns exist (avoid column-missing errors on fresh DBs)
          // try {
          //   await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "walletMonthlyUsedCents" INTEGER NOT NULL DEFAULT 0')
          // } catch (e) {
          //   console.warn('walletMonthlyUsedCents ensure failed (safe to ignore if already exists):', e)
          // }
          // try {
          //   await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "walletMonthlyResetAt" TIMESTAMP(3)')
          // } catch (e) {
          //   console.warn('walletMonthlyResetAt ensure failed (safe to ignore if already exists):', e)
          // }
          // Find user by linked account first, then fallback to email match.
          let dbUser =
            linkedAccount?.user ||
            (await prisma.user.findUnique({
              where: { email: resolvedEmail },
            }))

          let isNewUser = false
          if (!dbUser) {
            console.log(`👤 Creating ${providerLabel} user:`, resolvedEmail)
            await ensureFreeCreditColumns()
            dbUser = await prisma.user.create({
              data: {
                email: resolvedEmail,
                name: user.name || resolvedEmail.split('@')[0],
                image: user.image,
                emailVerified: new Date(), // OAuth users are auto-verified
                ...NEW_USER_FREE_CREDITS,
              }
            })
            isNewUser = true
          } else if (!dbUser.emailVerified) {
            // Auto-verify existing users who sign in with OAuth.
            console.log(`🔄 Auto-verifying existing ${providerLabel} user:`, dbUser.email)
            await prisma.user.update({
              where: { id: dbUser.id },
              data: { emailVerified: new Date() }
            })
          }

          if (provider && providerAccountId) {
            await prisma.account.upsert({
              where: {
                provider_providerAccountId: {
                  provider,
                  providerAccountId,
                },
              },
              update: {
                userId: dbUser.id,
                type: String(account?.type || 'oauth'),
                refresh_token: (account as any)?.refresh_token || null,
                access_token: (account as any)?.access_token || null,
                expires_at:
                  typeof (account as any)?.expires_at === 'number' ? (account as any).expires_at : null,
                token_type: (account as any)?.token_type || null,
                scope: (account as any)?.scope || null,
                id_token: (account as any)?.id_token || null,
                session_state: (account as any)?.session_state || null,
              },
              create: {
                userId: dbUser.id,
                type: String(account?.type || 'oauth'),
                provider,
                providerAccountId,
                refresh_token: (account as any)?.refresh_token || null,
                access_token: (account as any)?.access_token || null,
                expires_at:
                  typeof (account as any)?.expires_at === 'number' ? (account as any).expires_at : null,
                token_type: (account as any)?.token_type || null,
                scope: (account as any)?.scope || null,
                id_token: (account as any)?.id_token || null,
                session_state: (account as any)?.session_state || null,
              },
            })
          }
          
          // Send welcome email for new OAuth users (don't await to avoid blocking auth)
          if (isNewUser) {
            const userName = dbUser.name || dbUser.email.split('@')[0]
            console.log(`📧 Sending welcome email to new ${providerLabel} user:`, userName)
            sendWelcomeEmail({
              email: dbUser.email,
              name: userName,
            }).catch(error => {
              console.error(`❌ ${providerLabel} welcome email failed (non-blocking):`, error)
            })

            // Notify owner of new OAuth signup (don't await to avoid blocking auth)
            notifyOwner({
              event: 'signup',
              userEmail: dbUser.email,
              userName: dbUser.name || undefined,
            }).catch(error => {
              console.error('❌ Owner notification failed (non-blocking):', error)
            })

            sendOwnerSignupEmail({
              userEmail: dbUser.email,
              userName: dbUser.name || undefined,
            }).catch(error => {
              console.error('❌ Signup email alert failed (non-blocking):', error)
            })
          }
          
          // Update user ID for session
          user.id = dbUser.id
          user.email = dbUser.email
          if (!user.name) {
            user.name = dbUser.name || dbUser.email.split('@')[0]
          }
          resolvedEmail = dbUser.email
          console.log(`✅ ${providerLabel} user processed:`, { id: dbUser.id, email: dbUser.email, isNew: isNewUser })
        } catch (error) {
          console.error('❌ OAuth user creation error:', error)
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

      // Native OAuth safety: if OAuth fails, route back into native completion endpoint
      // so the app can receive a clear error instead of landing on the web sign-in page.
      try {
        const parsed = new URL(url, actualBaseUrl)
        const isNativeOAuthError =
          parsed.pathname === '/auth/signin' &&
          parsed.searchParams.has('error') &&
          String(parsed.searchParams.get('callbackUrl') || '').includes('/api/native-auth/oauth/complete')
        if (isNativeOAuthError) {
          const oauthError = String(parsed.searchParams.get('error') || 'OAuthSignin').trim()
          return `${actualBaseUrl}/api/native-auth/oauth/complete?error=${encodeURIComponent(oauthError)}`
        }
      } catch {
        // ignore parse issues and continue with normal redirect handling
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
      
      // Default: redirect to dashboard (onboarding redirect will be handled client-side for new users only)
      const defaultRedirect = actualBaseUrl + '/dashboard'
      console.log('🎯 Default redirect to dashboard:', defaultRedirect)
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
            where: { id: token.id as string },
            include: { practitionerAccount: { select: { id: true } } },
          })
          
          if (!dbUser) {
            console.log('🚫 User account deleted - invalidating session:', token.email)
            // Return empty session to force complete logout
            return {
              expires: session.expires,
              user: undefined
            }
          }
          
          const revokedAt = await getSessionRevokedAt(dbUser.id)
          if (revokedAt) {
            const tokenIssuedAt =
              typeof token?.iat === 'number' ? new Date(token.iat * 1000) : null
            if (!tokenIssuedAt || revokedAt > tokenIssuedAt) {
              console.log('🚫 Session revoked by admin:', token.email)
              return {
                expires: session.expires,
                user: undefined
              }
            }
          }

          session.user = {
            id: token.id as string,
            email: token.email as string,
            name: token.name as string,
            image: token.image as string || null,
            needsVerification: !dbUser.emailVerified,
            isPractitioner: !!dbUser.practitionerAccount,
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
    error: '/auth/oauth-error',
  },
  debug: true,
  secret: process.env.NEXTAUTH_SECRET || 'helfi-secret-key-production-2024'
} 
