import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import bcrypt from 'bcryptjs'

export async function GET(request: NextRequest) {
  try {
    // JWT authentication check
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only SUPER_ADMIN can view admin list
    if (admin.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const admins = await prisma.adminUser.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
        createdBy: true
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ admins })

  } catch (error) {
    console.error('Error fetching admin list:', error)
    return NextResponse.json({ error: 'Failed to fetch admin list' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // JWT authentication check
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { action, email, name, password, role, currentPassword, newPassword } = await request.json()

    switch (action) {
      case 'create':
        // Only SUPER_ADMIN can create new admins
        if (admin.role !== 'SUPER_ADMIN') {
          return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
        }

        if (!email || !name || !password || !role) {
          return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
        }

        // Check if admin email already exists
        const existingAdmin = await prisma.adminUser.findUnique({
          where: { email: email.toLowerCase() }
        })

        if (existingAdmin) {
          return NextResponse.json({ error: 'Admin with this email already exists' }, { status: 409 })
        }

        // Hash the password
        const saltRounds = 12
        const hashedPassword = await bcrypt.hash(password, saltRounds)

        // Create new admin
        const newAdmin = await prisma.adminUser.create({
          data: {
            email: email.toLowerCase(),
            password: hashedPassword,
            name,
            role,
            createdBy: admin.adminId
          }
        })

        return NextResponse.json({ 
          success: true, 
          message: 'Admin created successfully',
          adminId: newAdmin.id 
        })

      case 'change_password':
        if (!currentPassword || !newPassword) {
          return NextResponse.json({ error: 'Current and new passwords are required' }, { status: 400 })
        }

        // Get current admin data
        const currentAdmin = await prisma.adminUser.findUnique({
          where: { id: admin.adminId }
        })

        if (!currentAdmin) {
          return NextResponse.json({ error: 'Admin not found' }, { status: 404 })
        }

        // Verify current password
        const passwordMatch = await bcrypt.compare(currentPassword, currentAdmin.password)
        if (!passwordMatch) {
          return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 })
        }

        // Hash new password
        const newHashedPassword = await bcrypt.hash(newPassword, 12)

        // Update password
        await prisma.adminUser.update({
          where: { id: admin.adminId },
          data: { password: newHashedPassword }
        })

        return NextResponse.json({ 
          success: true, 
          message: 'Password changed successfully' 
        })

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

  } catch (error) {
    console.error('Error in admin management:', error)
    return NextResponse.json({ error: 'Failed to perform admin action' }, { status: 500 })
  }
} 