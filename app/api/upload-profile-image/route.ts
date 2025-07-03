import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(request: NextRequest) {
  try {
    console.log('=== PROFILE IMAGE UPLOAD START ===');
    console.log('Request headers:', {
      'content-type': request.headers.get('content-type'),
      'user-agent': request.headers.get('user-agent'),
      'cookie': request.headers.get('cookie') ? 'present' : 'missing',
      'authorization': request.headers.get('authorization') ? 'present' : 'missing'
    });
    
    // Check authentication with detailed logging
    console.log('Checking authentication...');
    const session = await getServerSession(authOptions);
    console.log('Session result:', {
      hasSession: !!session,
      hasUser: !!session?.user,
      userEmail: session?.user?.email,
      userId: session?.user?.id
    });
    
    if (!session?.user?.email) {
      console.log('❌ Authentication failed - no session or user email');
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    console.log('✅ Authentication successful for user:', session.user.email);

    const formData = await request.formData();
    const imageFile = formData.get('image') as File;

    if (!imageFile) {
      console.log('❌ No image file provided in form data');
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    }

    // Validate file type
    if (!imageFile.type.startsWith('image/')) {
      console.log('❌ Invalid file type:', imageFile.type);
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }

    // Validate file size (5MB limit)
    if (imageFile.size > 5 * 1024 * 1024) {
      console.log('❌ File too large:', imageFile.size);
      return NextResponse.json({ error: 'File size must be less than 5MB' }, { status: 400 });
    }

    console.log('✅ File validation passed:', {
      name: imageFile.name,
      type: imageFile.type,
      size: imageFile.size,
      userEmail: session.user.email
    });

    // Convert file to buffer for Cloudinary upload
    console.log('Converting file to buffer...');
    const imageBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(imageBuffer);
    console.log('✅ Buffer created, size:', buffer.length);

    // Test Cloudinary configuration
    console.log('Testing Cloudinary configuration...');
    console.log('Cloudinary config:', {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? 'present' : 'missing',
      api_key: process.env.CLOUDINARY_API_KEY ? 'present' : 'missing',
      api_secret: process.env.CLOUDINARY_API_SECRET ? 'present' : 'missing'
    });

    // Upload to Cloudinary with profile image specific settings
    console.log('Starting Cloudinary upload...');
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: 'helfi/profile-images',
          public_id: `user_${session.user.email?.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`,
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' },  // Smart crop focusing on face
            { quality: 'auto', fetch_format: 'auto' }  // Optimize quality and format
          ],
          invalidate: true,  // Clear CDN cache
          overwrite: true    // Allow overwriting
        },
        (error, result) => {
          if (error) {
            console.error('❌ Cloudinary upload error:', error);
            reject(error);
          } else {
            console.log('✅ Cloudinary upload successful');
            resolve(result);
          }
        }
      ).end(buffer);
    });

    const cloudinaryResult = uploadResult as any;
    
    console.log('Cloudinary upload result:', {
      publicId: cloudinaryResult.public_id,
      secureUrl: cloudinaryResult.secure_url,
      bytes: cloudinaryResult.bytes
    });

    // Find user by email
    console.log('Finding user in database...');
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      console.log('❌ User not found in database:', session.user.email);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    console.log('✅ User found in database:', { id: user.id, email: user.email });

    // Create File record in database
    console.log('Creating file record in database...');
    const fileRecord = await prisma.file.create({
      data: {
        originalName: imageFile.name,
        fileName: cloudinaryResult.public_id,
        fileSize: cloudinaryResult.bytes,
        mimeType: imageFile.type,
        cloudinaryId: cloudinaryResult.public_id,
        cloudinaryUrl: cloudinaryResult.url,
        secureUrl: cloudinaryResult.secure_url,
        uploadedById: user.id,
        fileType: 'IMAGE',
        usage: 'PROFILE_IMAGE',
        isPublic: false,
        metadata: {
          width: cloudinaryResult.width,
          height: cloudinaryResult.height,
          format: cloudinaryResult.format,
          originalSize: imageFile.size,
          optimizedSize: cloudinaryResult.bytes
        }
      }
    });

    console.log('✅ File record created:', { id: fileRecord.id });

    // Update user's profile image URL
    console.log('Updating user profile image...');
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        image: cloudinaryResult.secure_url,
        updatedAt: new Date()
      }
    });

    console.log('✅ Profile image upload complete - Database updated');

    return NextResponse.json({
      success: true,
      imageUrl: cloudinaryResult.secure_url,
      cloudinaryId: cloudinaryResult.public_id,
      fileId: fileRecord.id,
      optimizations: {
        originalSize: imageFile.size,
        optimizedSize: cloudinaryResult.bytes,
        savings: Math.round(((imageFile.size - cloudinaryResult.bytes) / imageFile.size * 100)),
        cdnUrl: cloudinaryResult.secure_url
      }
    });

  } catch (error) {
    console.error('❌ Profile image upload error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed'
    }, { status: 500 });
  }
} 