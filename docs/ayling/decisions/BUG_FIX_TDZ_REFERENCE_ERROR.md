# Bug Triage & Fix: ReferenceError TDZ in DailyInventory

**ID**: BUG-20261023-TDZ-REF  
**Status**: FIXED & VERIFIED  

---

## 1. Root Cause
- Di awal render `DailyInventory`, mutasi `ref.current = state` ditempatkan langsung di body komponen sebelum deklarasi `useState([items, setItems])` dan `useState([inventory, setInventory])`.
- Rolldown/Vite minifier menempatkan pengaksesan variabel dalam Temporal Dead Zone (TDZ), memicu runtime error:
  `ReferenceError: Cannot access 'q' before initialization`.

## 2. Resolusi
1. Pindahkan mutasi ref ke dalam `useEffect` terisolasi atau setelah seluruh deklarasi `useState`.
2. Hapus deklarasi ganda `performSaveRef`.
3. Validasi build bundle production dan run full test suite.

## 3. Hasil Pengujian
- `npm run build`: **PASS (Clean bundle)**.
- `npm test`: **12/12 test files passed, 222/222 unit tests passed (100% PASS)**.
