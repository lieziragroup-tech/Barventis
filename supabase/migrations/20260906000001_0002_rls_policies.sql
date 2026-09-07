-- Ubah policy untuk mengecek role SuperAdmin dengan TYPE CASTING aman
-- atau mengecek string langsung dari table users agar tidak kena cast enum constraint

-- Contoh fix: kita akan pakai casting ke text untuk komparasi dengan enum, 
-- daripada melempar string yang harus pas dengan enum (jika enum berubah).
