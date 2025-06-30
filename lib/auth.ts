import { type NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { prisma } from '@/lib/prisma'

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
          // Find or create user in database
          let user = await prisma.user.findUnique({
            where: { email: credentials.email.toLowerCase() }
          })

          if (!user) {
            console.log('👤 Creating new user:', credentials.email)
            user = await prisma.user.create({
              data: {
                email: credentials.email.toLowerCase(),
                name: credentials.email.split('@')[0],
              }
            })
          }

          console.log('✅ User found/created:', { id: user.id, email: user.email })
          
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

          if (!dbUser) {
            console.log('👤 Creating Google user:', user.email)
            dbUser = await prisma.user.create({
              data: {
                email: user.email!.toLowerCase(),
                name: user.name || user.email!.split('@')[0],
                image: user.image
              }
            })
          }
          
          // Update user ID for session
          user.id = dbUser.id
          console.log('✅ Google user processed:', { id: dbUser.id, email: dbUser.email })
        } catch (error) {
          console.error('❌ Google user creation error:', error)
          return false
        }
      }
      
      return true
    },
    async redirect({ url, baseUrl }) {
      console.log('🔄 Redirect callback:', { url, baseUrl })
      try {
        // Handle signout redirects
        if (url.includes('signout') || url.includes('signOut')) {
          return baseUrl
        }
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
        console.error('❌ Redirect callback error:', error)
        return `${baseUrl}/onboarding`
      }
    },
    async session({ session, token }) {
      console.log('📋 Session callback:', { 
        tokenEmail: token?.email,
        tokenId: token?.id 
      })
      
      try {
        // Add user info to session from JWT token
        if (token?.email) {
          session.user = {
            id: token.id as string,
            email: token.email as string,
            name: token.name as string,
            image: token.image as string || null
          }
        }
        
        console.log('✅ Session created:', { 
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