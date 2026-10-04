import { prisma } from '@/lib/prisma'

export async function savePrivateBarcodeCorrection(userId: string, barcode: string, nutrition: {
  name: string; brand?: string | null; servingSize?: string | null;
  calories?: number | null; proteinG?: number | null; carbsG?: number | null; fatG?: number | null;
  fiberG?: number | null; sugarG?: number | null; quantityG?: number | null; piecesPerServing?: number | null;
}, source: 'user-label' | 'user-diary', report = false) {
  return prisma.barcodeUserCorrection.upsert({
    where: { userId_barcode: { userId, barcode } },
    create: { userId, barcode, ...nutrition, source, reportCount: report ? 1 : 0 },
    update: { ...nutrition, source, version: { increment: 1 }, ...(report ? { reportCount: { increment: 1 } } : {}) },
  })
}
