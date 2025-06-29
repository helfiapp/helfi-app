import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// GET - Fetch all email templates
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    
    // Verify admin token (basic check - in production you'd verify JWT properly)
    const adminUser = await prisma.adminUser.findFirst({
      where: { 
        email: 'info@sonicweb.com.au',
        isActive: true 
      }
    })

    if (!adminUser || !bcrypt.compareSync(token, adminUser.password)) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Fetch all active email templates
    const templates = await prisma.emailTemplate.findMany({
      where: { isActive: true },
      orderBy: [
        { isBuiltIn: 'desc' }, // Built-in templates first
        { category: 'asc' },
        { name: 'asc' }
      ]
    })

    return NextResponse.json({ templates })
  } catch (error) {
    console.error('Error fetching email templates:', error)
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
  }
}

// POST - Create new email template
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    
    // Verify admin token
    const adminUser = await prisma.adminUser.findFirst({
      where: { 
        email: 'info@sonicweb.com.au',
        isActive: true 
      }
    })

    if (!adminUser || !bcrypt.compareSync(token, adminUser.password)) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { name, category, subject, content } = await request.json()

    if (!name || !subject || !content) {
      return NextResponse.json({ error: 'Name, subject, and content are required' }, { status: 400 })
    }

    // Create new template
    const template = await prisma.emailTemplate.create({
      data: {
        name,
        category: category || 'CUSTOM',
        subject,
        content,
        isBuiltIn: false,
        createdBy: adminUser.id
      }
    })

    return NextResponse.json({ template }, { status: 201 })
  } catch (error) {
    console.error('Error creating email template:', error)
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  }
}

// PUT - Update email template
export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    
    // Verify admin token
    const adminUser = await prisma.adminUser.findFirst({
      where: { 
        email: 'info@sonicweb.com.au',
        isActive: true 
      }
    })

    if (!adminUser || !bcrypt.compareSync(token, adminUser.password)) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { id, name, category, subject, content } = await request.json()

    if (!id || !name || !subject || !content) {
      return NextResponse.json({ error: 'ID, name, subject, and content are required' }, { status: 400 })
    }

    // Update template
    const template = await prisma.emailTemplate.update({
      where: { id },
      data: {
        name,
        category: category || 'CUSTOM',
        subject,
        content,
        updatedAt: new Date()
      }
    })

    return NextResponse.json({ template })
  } catch (error) {
    console.error('Error updating email template:', error)
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
  }
}

// DELETE - Delete email template
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    
    // Verify admin token
    const adminUser = await prisma.adminUser.findFirst({
      where: { 
        email: 'info@sonicweb.com.au',
        isActive: true 
      }
    })

    if (!adminUser || !bcrypt.compareSync(token, adminUser.password)) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const url = new URL(request.url)
    const id = url.searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    }

    // Check if template exists and is not built-in
    const template = await prisma.emailTemplate.findUnique({
      where: { id }
    })

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    if (template.isBuiltIn) {
      return NextResponse.json({ error: 'Cannot delete built-in templates' }, { status: 400 })
    }

    // Soft delete by marking as inactive
    await prisma.emailTemplate.update({
      where: { id },
      data: { isActive: false }
    })

    return NextResponse.json({ message: 'Template deleted successfully' })
  } catch (error) {
    console.error('Error deleting email template:', error)
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
  }
} 