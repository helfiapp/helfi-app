import { NextRequest, NextResponse } from 'next/server';
import { extractAdminFromHeaders } from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const authHeader = req.headers.get('authorization');
  const admin = extractAdminFromHeaders(authHeader);
  if (!admin) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const contentType = req.headers.get('content-type');
    
    console.log('=== FOOD UPLOAD DEBUG ===');
    console.log('Content-Type:', contentType);
    console.log('OpenAI API Key exists:', !!process.env.OPENAI_API_KEY);
    
    if (contentType?.includes('multipart/form-data')) {
      const formData = await req.formData();
      const imageFile = formData.get('image') as File;
      
      console.log('Image file received:', !!imageFile);
      console.log('Image file name:', imageFile?.name);
      console.log('Image file size:', imageFile?.size);
      console.log('Image file type:', imageFile?.type);
      
      return NextResponse.json({
        success: true,
        debug: {
          hasApiKey: !!process.env.OPENAI_API_KEY,
          imageReceived: !!imageFile,
          imageName: imageFile?.name,
          imageSize: imageFile?.size,
          imageType: imageFile?.type,
          contentType
        }
      });
    }
    
    return NextResponse.json({
      error: 'No multipart data received',
      contentType
    }, { status: 400 });
    
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({
      error: 'Debug failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 
