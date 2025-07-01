import { NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function GET() {
  try {
    // Test connection by fetching account information
    const result = await cloudinary.api.ping()
    
    return NextResponse.json({
      success: true,
      message: 'Cloudinary connection successful',
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      ping_result: result,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Cloudinary connection failed:', error)
    
    return NextResponse.json({
      success: false,
      message: 'Cloudinary connection failed',
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
} 