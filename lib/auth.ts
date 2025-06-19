import { type NextAuthOptions } from 'next-auth'
import EmailProvider from 'next-auth/providers/email'
import GoogleProvider from 'next-auth/providers/google'

export const authOptions: NextAuthOptions = {
  providers: [
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST || 'smtp.gmail.com',
        port: process.env.EMAIL_SERVER_PORT || 587,
        auth: {
          user: process.env.EMAIL_SERVER_USER || 'noreply@helfi.ai',
          pass: process.env.EMAIL_SERVER_PASSWORD || 'temp_password',
        },
      },
      from: process.env.EMAIL_FROM || 'noreply@helfi.ai',
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      console.log('SignIn callback:', { user: user?.email, account: account?.provider })
      // Allow all email and Google signins (this handles both login and signup)
      return true
    },
    async redirect({ url, baseUrl }) {
      console.log('Redirect callback:', { url, baseUrl })
      // After successful login/signup, redirect to onboarding
      if (url.startsWith(baseUrl)) {
        return url
      }
      return `${baseUrl}/onboarding`
    },
    async session({ session, token }) {
      // Add user info to session
      return session
    },
    async jwt({ token, user, account }) {
      // Add user info to token
      if (user) {
        token.id = user.id
      }
      return token
    }
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/signin',
    verifyRequest: '/auth/verify-request',
  },
  debug: process.env.NODE_ENV === 'development',
  secret: process.env.NEXTAUTH_SECRET || 'helfi-secret-key-production-2024'
} 