import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import EmailProvider from "next-auth/providers/email";
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import { Resend } from 'resend'

// Fallback configuration to prevent server errors
const googleClientId = process.env.GOOGLE_CLIENT_ID || 'dummy-client-id';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || 'dummy-client-secret';
const nextAuthSecret = process.env.NEXTAUTH_SECRET || 'fallback-secret-key-for-development';
const resendApiKey = process.env.RESEND_API_KEY || "re_Q2Ty3J2n_6TrpJB9dKxky37hbm8i7c4d3";

// DEBUG: Log environment variables (safely)
console.log('=== AUTH DEBUG ===');
console.log('GOOGLE_CLIENT_ID exists:', !!process.env.GOOGLE_CLIENT_ID);
console.log('GOOGLE_CLIENT_ID length:', process.env.GOOGLE_CLIENT_ID?.length || 0);
console.log('GOOGLE_CLIENT_ID preview:', process.env.GOOGLE_CLIENT_ID ? 
  process.env.GOOGLE_CLIENT_ID.substring(0, 10) + '...' + process.env.GOOGLE_CLIENT_ID.substring(process.env.GOOGLE_CLIENT_ID.length - 10) : 'NOT_SET');
console.log('GOOGLE_CLIENT_ID has newline:', process.env.GOOGLE_CLIENT_ID?.includes('\n') || false);
console.log('GOOGLE_CLIENT_SECRET exists:', !!process.env.GOOGLE_CLIENT_SECRET);
console.log('GOOGLE_CLIENT_SECRET length:', process.env.GOOGLE_CLIENT_SECRET?.length || 0);
console.log('NEXTAUTH_URL:', process.env.NEXTAUTH_URL);
console.log('NEXTAUTH_URL has newline:', process.env.NEXTAUTH_URL?.includes('\n') || false);
console.log('==================');

const handler = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  providers: [
    GoogleProvider({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    }),
    EmailProvider({
      from: "Helfi Health <noreply@helfi.ai>",
      sendVerificationRequest: async ({ identifier: email, url, provider, theme }) => {
        console.log('NextAuth: Attempting to send verification email to:', email);
        console.log('NextAuth: Magic link URL:', url);
        
        const resend = new Resend(resendApiKey);
        
        // Generate unsubscribe link for authentication emails (in case user wants to stop receiving them)
        const unsubscribeToken = Buffer.from(`unsubscribe_${email}_helfi`).toString('base64url');
        const unsubscribeUrl = `${process.env.NEXTAUTH_URL || 'https://helfi.ai'}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${unsubscribeToken}`;
        
        try {
          const result = await resend.emails.send({
            from: "Helfi Health <noreply@helfi.ai>",
            to: email,
            subject: "Sign in to Helfi",
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                  <h1 style="color: #10b981; font-size: 32px; margin-bottom: 10px;">Welcome to Helfi!</h1>
                  <p style="color: #6b7280; font-size: 18px;">Click the link below to sign in</p>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${url}" style="background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
                    Sign in to Helfi
                  </a>
                </div>
                
                <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
                  <p style="color: #6b7280; font-size: 14px; margin: 0;">
                    🔒 This is a secure sign-in link that expires in 24 hours.<br>
                    If you didn't request this, you can safely ignore this email.
                  </p>
                </div>
                
                <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; text-align: center;">
                  <p style="color: #9ca3af; font-size: 14px; margin: 0;">
                    This email was sent to ${email}<br>
                    <a href="https://www.helfi.ai" style="color: #10b981;">www.helfi.ai</a>
                  </p>
                  <p style="color: #9ca3af; font-size: 12px; margin: 10px 0 0 0;">
                    Don't want to receive sign-in emails? 
                    <a href="${unsubscribeUrl}" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a>
                  </p>
                </div>
              </div>
            `,
          });
          
          console.log('NextAuth: Email sent successfully:', result);
        } catch (error) {
          console.error("NextAuth: Failed to send verification email:", error);
          throw new Error(`Failed to send verification email: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      },
    }),
  ],
  pages: {
    signIn: '/auth/signin',
    verifyRequest: '/auth/verify-request',
    error: '/auth/error', // Add custom error page
  },
  secret: nextAuthSecret,
  debug: process.env.NODE_ENV === 'development',
  callbacks: {
    async signIn({ user, account, profile, email, credentials }) {
      console.log('NextAuth signIn callback:', { user, account, profile, email, credentials });
      
      // Add additional validation for Google OAuth
      if (account?.provider === 'google') {
        if (!googleClientId.startsWith('dummy') && !googleClientSecret.startsWith('dummy')) {
          return true;
        } else {
          console.error('Google OAuth not properly configured');
          return false;
        }
      }
      
      return true;
    },
    async session({ session, token }) {
      // Add any custom session data here
      return session;
    },
    async jwt({ token, user, account }) {
      // Add any custom JWT data here
      return token;
    },
  },
  events: {
    async signIn(message) {
      console.log('User signed in:', message);
    },
    async signOut(message) {
      console.log('User signed out:', message);
    },
    async createUser(message) {
      console.log('User created:', message);
    },
  },
})

export { handler as GET, handler as POST } 