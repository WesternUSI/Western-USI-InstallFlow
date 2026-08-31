/** Long edge, in pixels, that an uploaded photo is scaled down to. */
const MAX_EDGE = 2048;
const JPEG_QUALITY = 0.85;

/**
 * Site photos arrive straight off phones and cameras at ~4000px and several
 * megabytes, which installers then wait on over mobile data. 2048px still
 * carries more detail than the app ever renders, including the lightbox's 4x
 * zoom, so scaling to that is invisible in use but roughly an order of
 * magnitude smaller.
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
    const scale = MAX_EDGE / Math.max(bitmap.width, bitmap.height);
    if (scale >= 1) return file;

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
