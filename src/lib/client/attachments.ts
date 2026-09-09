"use client";
export type Attachment = { name: string; type: string; data: string };

const MAX_SIDE = 1800;
const MAX_BYTES = 2_500_000;

/** Reads an image file, shrinks it if it's large, and returns base64 for upload. */
export async function readImageForUpload(file: File): Promise<Attachment> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error(`${file.name}: only PNG, JPG, WEBP or GIF images.`);
  if (file.size > 25_000_000) throw new Error(`${file.name}: image is too large (max 25 MB).`);
  const bitmap = await createImageBitmap(file).catch(() => null);
  const needsResize = bitmap && (bitmap.width > MAX_SIDE || bitmap.height > MAX_SIDE || file.size > MAX_BYTES) && file.type !== "image/gif";
  if (bitmap && needsResize) {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    const dataUrl = canvas.toDataURL(type, 0.9);
    return { name: file.name, type, data: dataUrl.split(",")[1] };
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { name: file.name, type: file.type, data: btoa(bin) };
}
