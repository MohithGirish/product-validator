// Shrinks photos before they are saved to validation history: a small
// thumbnail for the history list and a larger copy for the full-size viewer.
// Phone photos are several MB; these keep each record to a few hundred KB.

export const THUMBNAIL_SIZE = 240;
export const FULL_IMAGE_SIZE = 1280;

/**
 * Returns `dataUrl` re-encoded as a JPEG whose longer side is at most `maxSize`
 * pixels (never upscaled). Returns null if the image can't be decoded.
 */
export const downscaleDataUrl = (dataUrl: string, maxSize: number, quality = 0.75): Promise<string | null> =>
  new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });

/** Returns thumbnail and full-size copies of an optional photo (both null when there is none). */
export const prepareHistoryImage = async (
  dataUrl: string | null | undefined
): Promise<{ thumb: string | null; full: string | null }> => {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return { thumb: null, full: null };
  const [thumb, full] = await Promise.all([
    downscaleDataUrl(dataUrl, THUMBNAIL_SIZE, 0.6),
    downscaleDataUrl(dataUrl, FULL_IMAGE_SIZE),
  ]);
  return { thumb, full };
};
