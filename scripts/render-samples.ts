import { mkdirSync, writeFileSync } from 'node:fs';
import { generateQuotationPDF } from '../src/shared/lib/pdfGenerator';
import { SAMPLES } from './sample-data';

const OUT = process.env.PDF_OUT ?? './out/pdf-samples';
mkdirSync(OUT, { recursive: true });
for (const [name, data] of Object.entries(SAMPLES)) {
  const blob = generateQuotationPDF(data);
  writeFileSync(`${OUT}/${name}.pdf`, Buffer.from(await blob.arrayBuffer()));
  console.log('ok', name);
}
