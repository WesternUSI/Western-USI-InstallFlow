/** Long edge, in pixels, that an uploaded photo is scaled down to. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.7;

/**
 * Site photos arrive straight off phones and cameras at ~4000px and several
 * megabytes, which installers then wait on over mobile data and which fill
 * storage. 1600px at 0.7 is still sharp on any screen and in the completion
 * emails, at roughly 200-400KB a photo. Smaller images are re-encoded too, so
 * a large PNG under 1600px still shrinks.
 *
 * Returns the original file untouched whenever it is already small enough, or
 * whenever decoding or re-encoding fails, so a photo always uploads even if
 * the browser cannot do the conversion.
 */
export async function resizeImageForUpload(file: File): Promise<File> {
  // GIFs would lose their animation, and non-images have nothing to resize.
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
    });
    // A re-encode that came out larger is not worth keeping.
    if (blob === null || blob.size >= file.size) return file;

    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
