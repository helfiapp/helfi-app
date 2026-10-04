import type { ImagePickerAsset } from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'

export async function prepareFoodPhotoForUpload(asset: ImagePickerAsset) {
  const fallbackName = asset.fileName || `food-${Date.now()}.jpg`
  try {
    const resizedWidth = asset.width && asset.width > 1800 ? 1800 : undefined
    const prepared = await ImageManipulator.manipulateAsync(
      asset.uri,
      resizedWidth ? [{ resize: { width: resizedWidth } }] : [],
      {
        compress: 0.82,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    )
    const baseName = fallbackName.replace(/\.[^.]+$/, '') || `food-${Date.now()}`
    return {
      uri: prepared.uri,
      type: 'image/jpeg',
      name: `${baseName}.jpg`,
    }
  } catch {
    return {
      uri: asset.uri,
      type: asset.mimeType || 'image/jpeg',
      name: fallbackName,
    }
  }
}
