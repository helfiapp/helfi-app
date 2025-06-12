import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import EmailProvider from "next-auth/providers/email";
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import { Resend } from 'resend'

const handler = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    EmailProvider({
      from: "Helfi Health <noreply@helfi.ai>",
      sendVerificationRequest: async ({ identifier: email, url, provider, theme }) => {
        console.log('NextAuth: Attempting to send verification email to:', email);
        console.log('NextAuth: Magic link URL:', url);
        
        const resend = new Resend(process.env.RESEND_API_KEY || "re_Q2Ty3J2n_6TrpJB9dKxky37hbm8i7c4d3");
        
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
                
                <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; text-align: center;">
                  <p style="color: #9ca3af; font-size: 14px; margin: 0;">
                    This email was sent to ${email}<br>
                    If you didn't request this, you can safely ignore this email.<br>
                    <a href="https://www.helfi.ai" style="color: #10b981;">www.helfi.ai</a>
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
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: true,
  callbacks: {
    async signIn({ user, account, profile, email, credentials }) {
      console.log('NextAuth signIn callback:', { user, account, profile, email, credentials });
      return true;
    },
  },
})

export { handler as GET, handler as POST } 