-- 0004_add_recipe_image_url.sql
--
-- Root cause fix untuk error:
--   "Could not find the 'image_url' column of 'recipes' in the schema cache"
--
-- Kode aplikasi (src/pages/shared/Recipes.jsx: handleAddNewRecipe, handleSaveRecipe;
-- src/services/api.js: createRecipe, updateRecipe) sudah lama membaca & menulis
-- field `image_url` untuk fitur upload gambar menu, tapi kolom ini tidak pernah
-- benar-benar dibuat di tabel `public.recipes` — schema drift antara kode dan DB.
--
-- ALTER ini idempotent (aman dijalankan berkali-kali / di environment manapun).

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN public.recipes.image_url IS
  'URL gambar menu (opsional), diisi lewat form Recipes.jsx / PosUpload auto-create.';

-- Setelah migration ini di-apply, refresh schema cache PostgREST supaya
-- Supabase langsung mengenali kolom baru tanpa perlu restart project:
NOTIFY pgrst, 'reload schema';
