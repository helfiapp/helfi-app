import { prisma } from '@/lib/prisma'
import { NextRequest } from 'next/server'
import crypto from 'crypto'

// Custom session interface
export interface CustomSession {
  id: string
  userId: string
  email: string
  name?: string | null
  image?: string | null
  expiresAt: Date
}

// Generate a secure session token
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

// Create a new session in database
export async function createSession(email: string, name?: string, image?: string): Promise<string> {
  const sessionToken = generateSessionToken()
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  
  try {
    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email }
    })
    
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: name || email.split('@')[0],
          image: image || null,
        }
      })
    }
    
    // Delete any existing sessions for this user (optional - for single session per user)
    await prisma.session.deleteMany({
      where: { userId: user.id }
    })
    
    // Create new session
    await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires: expiresAt
      }
    })
    
    console.log('Custom session created for:', email, 'Token:', sessionToken.substring(0, 8) + '...')
    return sessionToken
    
  } catch (error) {
    console.error('Error creating custom session:', error)
    throw error
  }
}

// Get session from database
export async function getSession(request: NextRequest): Promise<CustomSession | null> {
  try {
    // Get session token from cookie or Authorization header
    const cookies = request.headers.get('cookie') || ''
    const sessionToken = extractSessionToken(cookies) || 
                        request.headers.get('authorization')?.replace('Bearer ', '')
    
    if (!sessionToken) {
      console.log('No session token found in request')
      return null
    }
    
    console.log('Looking for session with token:', sessionToken.substring(0, 8) + '...')
    
    // Find session in database
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: {
        user: true
      }
    })
    
    if (!session) {
      console.log('Session not found in database')
      return null
    }
    
    // Check if expired
    if (session.expires < new Date()) {
      console.log('Session expired, deleting')
      await prisma.session.delete({
        where: { sessionToken }
      })
      return null
    }
    
    console.log('Valid session found for user:', session.user.email)
    
    return {
      id: session.id,
      userId: session.userId,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
      expiresAt: session.expires
    }
    
  } catch (error) {
    console.error('Error getting custom session:', error)
    return null
  }
}

// Extract session token from cookie string
function extractSessionToken(cookieString: string): string | null {
  // Look for our custom session cookie
  const match = cookieString.match(/helfi-session=([^;]+)/)
  if (match) {
    return match[1]
  }
  
  // Also check for NextAuth session token as fallback
  const nextAuthMatch = cookieString.match(/next-auth\.session-token=([^;]+)/)
  if (nextAuthMatch) {
    return nextAuthMatch[1]
  }
  
  return null
}

// Delete session
export async function deleteSession(sessionToken: string): Promise<void> {
  try {
    await prisma.session.delete({
      where: { sessionToken }
    })
    console.log('Session deleted:', sessionToken.substring(0, 8) + '...')
  } catch (error) {
    console.error('Error deleting session:', error)
  }
}

// Clean up expired sessions (utility function)
export async function cleanupExpiredSessions(): Promise<void> {
  try {
    const result = await prisma.session.deleteMany({
      where: {
        expires: {
          lt: new Date()
        }
      }
    })
    console.log('Cleaned up', result.count, 'expired sessions')
  } catch (error) {
    console.error('Error cleaning up sessions:', error)
  }
} 