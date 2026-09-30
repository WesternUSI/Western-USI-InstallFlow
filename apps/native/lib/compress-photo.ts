import type { ImagePickerAsset } from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/** Long edge, in pixels, that a photo is scaled down to before upload. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.7;

/**
 * Camera photos come off the phone at ~4000px and 2-4MB. 1600px at 0.7 is
 * still sharp in the app, the admin panel and the completion emails, at
 * roughly 200-400KB. Matches the web panel's `resizeImageForUpload`.
 *
 * Falls back to the original photo if the conversion fails, so a photo
 * always uploads.
 */
export async function compressPhoto(asset: ImagePickerAsset): Promise<string> {
  try {
    const context = ImageManipulator.manipulate(asset.uri);
    if (Math.max(asset.width, asset.height) > MAX_EDGE) {
      context.resize(asset.width >= asset.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
    }
    const image = await context.renderAsync();
    const result = await image.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
    return result.uri;
  } catch {
    return asset.uri;
  }
}
