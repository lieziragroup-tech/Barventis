import jsPDF from "jspdf";
import "jspdf-autotable";
import type { SPK } from '@/entities/types';

export function exportInstructionSheet(spk: SPK) {
    const doc = new jsPDF("p", "mm", "a4");

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("INSTRUCTION SHEET", 105, 20, { align: "center" });

    // Table Content
    const body = [
        ["KEPADA", ":", spk.technicianName || "-"],
        ["JADWAL KERJA", ":", spk.scheduleDate ? new Date(spk.scheduleDate).toLocaleDateString() : "-"],
        ["NAMA KONSUMEN", ":", spk.customerName || "-"],
        ["ALAMAT PEKERJAAN", ":", spk.lokasi || "-"],
        ["PESTISIDA / CHEMICAL", ":", "-"], 
        ["SERANGAN RAYAP/HAMA", ":", spk.notes || "-"],
        ["JENIS LANTAI/KUSEN/PLAFON", ":", "-"],
        ["SURVEYOR", ":", spk.createdByName || "-"],
        ["NOTE", ":", "Dokumentasi Foto + Denah di tandai pekerjaan"],
        ["PROYEK", ":", spk.serviceType],
        ["ACC VOLUME KERJA", ":", "Sesuai Quotation"],
    ];

    (doc as any).autoTable({
        startY: 30,
        body: body,
        theme: "plain",
        styles: { fontSize: 10, cellPadding: 2 },
        columnStyles: {
            0: { fontStyle: "bold", cellWidth: 50 },
            1: { cellWidth: 5 },
            2: { cellWidth: 130 }
        }
    });

    const finalY = (doc as any).lastAutoTable.finalY || 30;

    // Alat Pekerjaan & Chemical
    (doc as any).autoTable({
        startY: finalY + 10,
        head: [["Alat Pekerjaan", "Chemical"]],
        body: [
            ["- Mesin Inject", "- Safe 1"],
            ["- Tanki", "- Cypergard"],
            ["- Drum (Selang + Stick Inject)", "-"],
            ["- Bor + Mata Bor (Granit + Kayu)", "-"],
            ...(spk.alatPekerjaan?.map(a => [`- ${a}`, "-"]) || [])
        ],
        theme: "grid",
        headStyles: { fillColor: [200, 200, 200], textColor: 0, fontStyle: "bold" },
        styles: { fontSize: 10, cellPadding: 3 }
    });

    doc.save(`Instruction_Sheet_${spk.quotationNoSurat || spk.id}.pdf`);
}
