import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { getSupabaseClient, getSupabaseUrl, getSupabaseServiceRoleKey, EVIDENCE_BUCKET } from '../../lib/supabase.js';

/**
 * Pemilihan driver penyimpanan otomatis:
 * - Memakai Supabase Storage apabila `VITE_SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` terisi
 *   (kecuali pada saat integration test lokal yang menunjuk ke 127.0.0.1).
 * - Memakai disk lokal `./uploads` untuk pengembangan lokal tanpa cloud.
 */
function useSupabaseStorage(): boolean {
  if (process.env.STORAGE_DRIVER === 'local') return false;
  const url = getSupabaseUrl() || '';
  const key = getSupabaseServiceRoleKey() || '';
  if (!url || !key || /127\.0\.0\.1|localhost/.test(url)) return false;
  return true;
}

const UPLOAD_ROOT = join(process.cwd(), 'uploads');

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export async function savePhoto(buffer: Buffer, extension: string): Promise<string> {
  const folder = new Date().toISOString().slice(0, 7);
  const filename = `${randomUUID()}.${extension}`;
  const storagePath = `${folder}/${filename}`;

  if (useSupabaseStorage()) {
    const supabase = getSupabaseClient();
    const { error } = await supabase.storage
      .from(EVIDENCE_BUCKET)
      .upload(storagePath, buffer, { contentType: MIME_BY_EXT[extension] ?? 'application/octet-stream', upsert: false });
    if (error) throw new Error(`Gagal menyimpan foto ke Supabase Storage: ${error.message}`);
    return storagePath;
  }

  const dir = join(UPLOAD_ROOT, folder);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), buffer);
  return storagePath;
}

export async function readPhoto(storagePath: string): Promise<Buffer> {
  if (useSupabaseStorage()) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).download(storagePath);
    if (error || !data) throw new Error(`Foto tidak ditemukan di Supabase Storage: ${error?.message ?? 'unknown error'}`);
    return Buffer.from(await data.arrayBuffer());
  }

  return readFile(join(UPLOAD_ROOT, storagePath));
}

export async function deletePhoto(storagePath: string): Promise<void> {
  if (useSupabaseStorage()) {
    const supabase = getSupabaseClient();
    await supabase.storage.from(EVIDENCE_BUCKET).remove([storagePath]).catch(() => undefined);
    return;
  }

  await unlink(join(UPLOAD_ROOT, storagePath)).catch(() => undefined);
}
