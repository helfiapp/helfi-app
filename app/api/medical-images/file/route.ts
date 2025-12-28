import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { del, head, put } from '@vercel/blob'
import { decryptBuffer, encryptBuffer } from '@/lib/file-encryption'
import { verifySignedFileToken } from '@/lib/signed-file'

const CACHE_TTL_SECONDS = 60

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = (searchParams.get('token') || '').trim()
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    const payload = verifySignedFileToken(token)
    if (!payload || payload.usage !== 'MEDICAL_IMAGE') {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const fileRecord = await prisma.file.findUnique({
      where: { id: payload.fileId },
    })

    if (!fileRecord || fileRecord.usage !== 'MEDICAL_IMAGE') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    if (payload.userId !== fileRecord.uploadedById) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const metadata = (fileRecord.metadata || {}) as any
    const blobPathname = metadata.blobPathname || fileRecord.cloudinaryId || fileRecord.fileName
    if (!blobPathname) {
      return NextResponse.json({ error: 'File is unavailable' }, { status: 404 })
    }

    const blobInfo = await head(blobPathname)
    if (!blobInfo?.url) {
      return NextResponse.json({ error: 'File is unavailable' }, { status: 404 })
    }

    const blobResponse = await fetch(blobInfo.url, {
      headers: process.env.BLOB_READ_WRITE_TOKEN
        ? { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` }
        : undefined,
    })

    if (!blobResponse.ok) {
      return NextResponse.json({ error: 'File is unavailable' }, { status: 404 })
    }

    let buffer: Buffer = Buffer.from(await blobResponse.arrayBuffer())
    const isEncrypted = metadata?.encrypted === true

    if (isEncrypted) {
      buffer = decryptBuffer(buffer, metadata?.encryption?.iv, metadata?.encryption?.tag)
    } else {
      try {
        const encryptedPayload = encryptBuffer(buffer)
        const upgradedPath = `medical-images/${fileRecord.uploadedById}/${Date.now()}-${fileRecord.id}.bin`
        const upgradedBlob = await put(upgradedPath, encryptedPayload.encrypted, {
          access: 'public',
          contentType: 'application/octet-stream',
          addRandomSuffix: true,
        })

        await prisma.file.update({
          where: { id: fileRecord.id },
          data: {
            fileName: upgradedBlob.pathname,
            cloudinaryId: upgradedBlob.pathname,
            cloudinaryUrl: upgradedBlob.url,
            secureUrl: upgradedBlob.url,
            isPublic: false,
            metadata: {
              ...(metadata || {}),
              blobPathname: upgradedBlob.pathname,
              blobUrl: upgradedBlob.url,
              encrypted: true,
              encryption: {
                algorithm: 'aes-256-gcm',
                iv: encryptedPayload.iv,
                tag: encryptedPayload.tag,
              },
            },
          },
        })

        await del(blobPathname).catch(() => {})
      } catch (upgradeError) {
        console.warn('Medical image encryption upgrade failed:', upgradeError)
      }
    }

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': fileRecord.mimeType || 'application/octet-stream',
        'Cache-Control': `private, max-age=${CACHE_TTL_SECONDS}`,
      },
    })
  } catch (error) {
    console.error('Secure medical image fetch failed:', error)
    return NextResponse.json({ error: 'Failed to load file' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
