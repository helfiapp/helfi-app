import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
  api_key: process.env.CLOUDINARY_API_KEY?.trim(),
  api_secret: process.env.CLOUDINARY_API_SECRET?.trim(),
});

export async function POST(request: NextRequest) {
  console.log('🧪 DEBUG UPLOAD API - Starting detailed error tracking...');
  
  try {
    // Step 1: Check authentication
    console.log('🔍 Step 1: Checking authentication...');
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      console.log('❌ Authentication failed - no session or user email');
      return NextResponse.json({ 
        success: false, 
        error: 'Not authenticated',
        debug: { step: 'authentication', session: !!session, userEmail: session?.user?.email }
      }, { status: 401 });
    }
    console.log('✅ Authentication successful for user:', session.user.email);

    // Step 2: Parse form data
    console.log('🔍 Step 2: Parsing form data...');
    let formData;
    try {
      formData = await request.formData();
      console.log('✅ Form data parsed successfully');
    } catch (error) {
      console.log('❌ Form data parsing failed:', error);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to parse form data',
        debug: { step: 'formData', error: error instanceof Error ? error.message : 'Unknown error' }
      }, { status: 400 });
    }

    const imageFile = formData.get('image') as File;
    if (!imageFile) {
      console.log('❌ No image file provided in form data');
      return NextResponse.json({ 
        success: false, 
        error: 'No image file provided',
        debug: { step: 'fileExtraction', formDataKeys: Array.from(formData.keys()) }
      }, { status: 400 });
    }
    console.log('✅ Image file extracted:', { name: imageFile.name, type: imageFile.type, size: imageFile.size });

    // Step 3: Validate file
    console.log('🔍 Step 3: Validating file...');
    if (!imageFile.type.startsWith('image/')) {
      return NextResponse.json({ 
        success: false, 
        error: 'File must be an image',
        debug: { step: 'fileValidation', actualType: imageFile.type }
      }, { status: 400 });
    }
    if (imageFile.size > 5 * 1024 * 1024) {
      return NextResponse.json({ 
        success: false, 
        error: 'File size must be less than 5MB',
        debug: { step: 'fileValidation', actualSize: imageFile.size, maxSize: 5 * 1024 * 1024 }
      }, { status: 400 });
    }
    console.log('✅ File validation passed');

    // Step 4: Convert to buffer
    console.log('🔍 Step 4: Converting file to buffer...');
    let buffer;
    try {
      const imageBuffer = await imageFile.arrayBuffer();
      buffer = Buffer.from(imageBuffer);
      console.log('✅ Buffer conversion successful, size:', buffer.length);
    } catch (error) {
      console.log('❌ Buffer conversion failed:', error);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to convert file to buffer',
        debug: { step: 'bufferConversion', error: error instanceof Error ? error.message : 'Unknown error' }
      }, { status: 500 });
    }

    // Step 5: Check Cloudinary configuration
    console.log('🔍 Step 5: Checking Cloudinary configuration...');
    const cloudinaryConfig = {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    };
    
    console.log('📋 Cloudinary config check:', {
      cloud_name: cloudinaryConfig.cloud_name ? `${cloudinaryConfig.cloud_name.substring(0, 5)}...` : 'MISSING',
      api_key: cloudinaryConfig.api_key ? `${cloudinaryConfig.api_key.substring(0, 5)}...` : 'MISSING',
      api_secret: cloudinaryConfig.api_secret ? `${cloudinaryConfig.api_secret.substring(0, 5)}...` : 'MISSING'
    });

    if (!cloudinaryConfig.cloud_name || !cloudinaryConfig.api_key || !cloudinaryConfig.api_secret) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing Cloudinary configuration',
        debug: { 
          step: 'cloudinaryConfig',
          missingVars: {
            cloud_name: !cloudinaryConfig.cloud_name,
            api_key: !cloudinaryConfig.api_key,
            api_secret: !cloudinaryConfig.api_secret
          }
        }
      }, { status: 500 });
    }

    // Step 6: Upload to Cloudinary
    console.log('🔍 Step 6: Uploading to Cloudinary...');
    let cloudinaryResult;
    try {
      cloudinaryResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            resource_type: 'image',
            folder: 'helfi/profile-images',
            public_id: `user_${session.user.email?.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`,
            transformation: [
              { width: 400, height: 400, crop: 'fill', gravity: 'face' },
              { quality: 'auto', fetch_format: 'auto' }
            ],
            invalidate: true,
            overwrite: true
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
      
      console.log('✅ Cloudinary upload completed:', {
        publicId: (cloudinaryResult as any).public_id,
        secureUrl: (cloudinaryResult as any).secure_url,
        bytes: (cloudinaryResult as any).bytes
      });
    } catch (error) {
      console.log('❌ Cloudinary upload failed:', error);
      return NextResponse.json({ 
        success: false, 
        error: 'Cloudinary upload failed',
        debug: { 
          step: 'cloudinaryUpload', 
          error: error instanceof Error ? error.message : 'Unknown error',
          errorDetails: error
        }
      }, { status: 500 });
    }

    // Step 7: Find user in database
    console.log('🔍 Step 7: Finding user in database...');
    let user;
    try {
      user = await prisma.user.findUnique({
        where: { email: session.user.email }
      });
      
      if (!user) {
        console.log('❌ User not found in database:', session.user.email);
        return NextResponse.json({ 
          success: false, 
          error: 'User not found',
          debug: { step: 'userLookup', email: session.user.email }
        }, { status: 404 });
      }
      
      console.log('✅ User found in database:', { id: user.id, email: user.email });
    } catch (error) {
      console.log('❌ Database user lookup failed:', error);
      return NextResponse.json({ 
        success: false, 
        error: 'Database user lookup failed',
        debug: { 
          step: 'userLookup', 
          error: error instanceof Error ? error.message : 'Unknown error',
          errorDetails: error
        }
      }, { status: 500 });
    }

    // Step 8: Create File record
    console.log('🔍 Step 8: Creating File record...');
    let fileRecord;
    try {
      fileRecord = await prisma.file.create({
        data: {
          originalName: imageFile.name,
          fileName: (cloudinaryResult as any).public_id,
          fileSize: (cloudinaryResult as any).bytes,
          mimeType: imageFile.type,
          cloudinaryId: (cloudinaryResult as any).public_id,
          cloudinaryUrl: (cloudinaryResult as any).url,
          secureUrl: (cloudinaryResult as any).secure_url,
          uploadedById: user.id,
          fileType: 'IMAGE',
          usage: 'PROFILE_IMAGE',
          isPublic: false,
          metadata: {
            width: (cloudinaryResult as any).width,
            height: (cloudinaryResult as any).height,
            format: (cloudinaryResult as any).format,
            originalSize: imageFile.size,
            optimizedSize: (cloudinaryResult as any).bytes
          }
        }
      });
      
      console.log('✅ File record created:', { id: fileRecord.id });
    } catch (error) {
      console.log('❌ File record creation failed:', error);
      return NextResponse.json({ 
        success: false, 
        error: 'File record creation failed',
        debug: { 
          step: 'fileRecordCreation', 
          error: error instanceof Error ? error.message : 'Unknown error',
          errorDetails: error
        }
      }, { status: 500 });
    }

    // Step 9: Update user profile image
    console.log('🔍 Step 9: Updating user profile image...');
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { 
          image: (cloudinaryResult as any).secure_url,
          updatedAt: new Date()
        }
      });
      
      console.log('✅ User profile image updated');
    } catch (error) {
      console.log('❌ User profile image update failed:', error);
      return NextResponse.json({ 
        success: false, 
        error: 'User profile image update failed',
        debug: { 
          step: 'userProfileUpdate', 
          error: error instanceof Error ? error.message : 'Unknown error',
          errorDetails: error
        }
      }, { status: 500 });
    }

    console.log('🎉 DEBUG UPLOAD API - All steps completed successfully!');

    return NextResponse.json({
      success: true,
      imageUrl: (cloudinaryResult as any).secure_url,
      cloudinaryId: (cloudinaryResult as any).public_id,
      fileId: fileRecord.id,
      debug: {
        allStepsCompleted: true,
        finalStep: 'userProfileUpdate'
      }
    });

  } catch (error) {
    console.error('❌ DEBUG UPLOAD API - Unexpected error:', error);
    return NextResponse.json({
      success: false,
      error: 'Unexpected error in debug API',
      debug: {
        step: 'unexpectedError',
        error: error instanceof Error ? error.message : 'Unknown error',
        errorDetails: error,
        stack: error instanceof Error ? error.stack : undefined
      }
    }, { status: 500 });
  }
} 