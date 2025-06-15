import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    })
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      console.log('SignIn callback:', { user: user?.email, account: account?.provider })
      return true
    },
    async redirect({ url, baseUrl }) {
      console.log('Redirect callback:', { url, baseUrl })
      // After successful login, redirect to onboarding
      return `${baseUrl}/onboarding`
    }
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/signin' // Redirect errors back to signin
  },
  debug: true,
  secret: process.env.NEXTAUTH_SECRET
})

export { handler as GET, handler as POST } 