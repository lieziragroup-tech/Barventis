import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateQuotation,
  terbilangRupiah,
  QuotationItem
} from '../src/shared/utils/quotationEngine.ts'
import { generateQuotationNumber } from '../src/shared/utils/nomorSurat.ts'

test('Quotation Engine: Terbilang Rupiah Bahasa Indonesia Presisi', () => {
  assert.equal(terbilangRupiah(0), 'Nol Rupiah')
  assert.equal(terbilangRupiah(150000), 'Seratus Lima Puluh Ribu Rupiah')
  assert.equal(terbilangRupiah(25500000), 'Dua Puluh Lima Juta Lima Ratus Ribu Rupiah')
  assert.equal(terbilangRupiah(1250000000), 'Satu Miliar Dua Ratus Lima Puluh Juta Rupiah')
})

test('Quotation Engine: Akurasi Kalkulasi Finansial Subtotal, Diskon, PPN 11%', () => {
  const sampleItems: QuotationItem[] = [
    {
      description: 'Perlakuan Anti Rayap Sub-slab Injeksi (SNI 2405)',
      quantity: 100,
      unit: 'm1',
      unitPrice: 100000 // Subtotal: 10,000,000
    },
    {
      description: 'Spraying Perimeter Dinding Parit (SNI 2404)',
      quantity: 200,
      unit: 'm2',
      unitPrice: 50000 // Subtotal: 10,000,000
    }
  ]

  // Total awal: 20,000,000. Diskon 10%: 2,000,000 -> Taxable: 18,000,000. PPN 11%: 1,980,000. Grand total: 19,980,000
  const result = calculateQuotation(sampleItems, 10, true)

  assert.equal(result.subtotal, 20000000)
  assert.equal(result.discountAmount, 2000000)
  assert.equal(result.taxPercent, 11)
  assert.equal(result.taxAmount, 1980000)
  assert.equal(result.grandTotal, 19980000)
  assert.equal(
    result.terbilang,
    'Sembilan Belas Juta Sembilan Ratus Delapan Puluh Ribu Rupiah'
  )
})

test('Quotation Backend: Format Penomoran Terpusat QTN/GEP/YYYYMM/000X', () => {
  const qtnNumber = generateQuotationNumber()
  assert.match(qtnNumber, /^QTN\/GEP\/\d{6}\/\d{4}$/)
})
