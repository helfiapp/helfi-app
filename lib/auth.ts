import { type NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt'
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        // For now, allow any email/password combination to work
        // Later you can add database validation here
        return {
          id: credentials.email,
          email: credentials.email,
          name: credentials.email.split('@')[0]
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
      console.log('SignIn callback:', { user: user?.email, account: account?.provider, profile: profile?.email })
      try {
        // Allow all email and Google signins
        if (account?.provider === 'google' && user?.email) {
          // Create custom database session for Google users
                     try {
             const { createSession } = await import('@/lib/session')
             await createSession(user.email, user.name || user.email.split('@')[0], user.image || undefined)
             console.log('✅ Custom session created for Google user:', user.email)
           } catch (sessionError) {
            console.error('⚠️ Failed to create custom session for Google user:', sessionError)
            // Don't fail the signin if session creation fails
          }
          return true
        }
        if (account?.provider === 'credentials' && user?.email) {
          // Create custom database session for email users
                     try {
             const { createSession } = await import('@/lib/session')
             await createSession(user.email, user.name || user.email.split('@')[0], user.image || undefined)
             console.log('✅ Custom session created for email user:', user.email)
           } catch (sessionError) {
            console.error('⚠️ Failed to create custom session for email user:', sessionError)
            // Don't fail the signin if session creation fails
          }
          return true
        }
        return true
      } catch (error) {
        console.error('SignIn callback error:', error)
        return false
      }
    },
    async redirect({ url, baseUrl }) {
      console.log('Redirect callback:', { url, baseUrl })
      try {
        // If URL is relative, prepend baseUrl
        if (url.startsWith('/')) {
          return `${baseUrl}${url}`
        }
        // If URL is absolute and same origin, allow it
        if (url.startsWith(baseUrl)) {
          return url
        }
        // Default redirect to onboarding after successful auth
        return `${baseUrl}/onboarding`
      } catch (error) {
        console.error('Redirect callback error:', error)
        return `${baseUrl}/onboarding`
      }
    },
    async session({ session, token }) {
      try {
        // Add user info to session from JWT token
        if (token?.email) {
          session.user = {
            email: token.email as string,
            name: token.name as string,
            image: token.image as string || null
          }
        }
        return session
      } catch (error) {
        console.error('Session callback error:', error)
        return session
      }
    },
    async jwt({ token, user, account, profile }) {
      try {
        // Add user info to token on first sign in
        if (user) {
          token.id = user.id
          token.email = user.email
          token.name = user.name
          token.image = user.image
        }
        // For Google OAuth, also store profile image
        if (account?.provider === 'google' && profile) {
          token.image = profile.image || user?.image
        }
        return token
      } catch (error) {
        console.error('JWT callback error:', error)
        return token
      }
    }
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/signin',
  },
  debug: true, // Enable debug logging
  secret: process.env.NEXTAUTH_SECRET || 'helfi-secret-key-production-2024'
} 