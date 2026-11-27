export function translateDbError(err) {
  if (!err) return "Terjadi kesalahan yang tidak diketahui.";
  
  const msg = err.message || err.error_description || String(err);
  const code = err.code;

  if (code === '23503') {
    return "Data ini tidak bisa dihapus karena masih terkait/terpakai di modul lain (seperti resep atau transaksi).";
  }
  if (code === '23505') {
    return "Data dengan nama atau kode ini sudah ada (Duplikat). Silakan gunakan yang lain.";
  }
  if (code === '42501' || msg.includes('RLS') || msg.includes('policy')) {
    return "Akses ditolak: Anda tidak memiliki hak akses untuk melakukan tindakan ini.";
  }
  if (code === 'PGRST116') {
    return "Data tidak ditemukan.";
  }
  if (msg.includes('Failed to fetch') || msg.includes('network error')) {
    return "Gagal terhubung ke server. Silakan periksa koneksi internet Anda.";
  }
  if (msg.includes('JWT') || msg.includes('token')) {
    return "Sesi Anda telah berakhir. Silakan login kembali.";
  }

  return msg; // Fallback to original message
}
