/**
 * SignatureModal — Tanda Tangan Digital
 *
 * Flow:
 * 1. User menggambar tanda tangan di canvas
 * 2. Tanda tangan di-embed ke halaman terakhir PDF (via jsPDF)
 * 3. Signed PDF disimpan ke Firestore sebagai signedPdfBase64
 */

import { useRef, useState, useEffect, useCallback } from "react";
import { X, RotateCcw, PenLine, Download, Check, Loader2, AlertCircle, ChevronRight } from "lucide-react";
import jsPDF from "jspdf";
import { doc, updateDoc, Timestamp } from '@/shared/lib/firebase';
import { db } from '@/shared/lib/firebase';
import type { Quotation } from '@/entities/types';
import { generateQuotationPDF } from '@/shared/lib/pdfGenerator';
import { getQuotationById } from '@/shared/api/quotationService';
import { generateCompanyQuotationPDF } from '@/shared/api/documentConfig';
import type { TemplateConfig } from '@/shared/api/settingsService';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Props {
    quotation: Quotation;
    signerName: string;
    onClose: () => void;
    onSigned: (signedPdfBase64: string) => void;
    templateConfig?: TemplateConfig;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function base64ToBlob(base64: string, type = "application/pdf"): Blob {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    return new Blob([bytes], { type });
}

function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement("a");
    a.href = url; a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
}

// ─── CANVAS HOOK ──────────────────────────────────────────────────────────────

function useSignatureCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
    const drawing   = useRef(false);
    const lastPos   = useRef<{ x: number; y: number } | null>(null);
    const [isEmpty, setIsEmpty] = useState(true);

    const getPos = (e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width  / rect.width;
        const scaleY = canvas.height / rect.height;
        if ("touches" in e) {
            return {
                x: (e.touches[0].clientX - rect.left) * scaleX,
                y: (e.touches[0].clientY - rect.top)  * scaleY,
            };
        }
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top)  * scaleY,
        };
    };

    const startDraw = useCallback((e: MouseEvent | TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        e.preventDefault();
        drawing.current = true;
        lastPos.current = getPos(e, canvas);
    }, [canvasRef]);

    const draw = useCallback((e: MouseEvent | TouchEvent) => {
        if (!drawing.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        e.preventDefault();
        const ctx = canvas.getContext("2d")!;
        const pos = getPos(e, canvas);
        const last = lastPos.current!;

        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = "#1a1a2e";
        ctx.lineWidth   = 2.5;
        ctx.lineCap     = "round";
        ctx.lineJoin    = "round";
        ctx.stroke();

        lastPos.current = pos;
        setIsEmpty(false);
    }, [canvasRef]);

    const endDraw = useCallback(() => {
        drawing.current = false;
        lastPos.current = null;
    }, []);

    const clear = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
        setIsEmpty(true);
    }, [canvasRef]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.addEventListener("mousedown",  startDraw);
        canvas.addEventListener("mousemove",  draw);
        canvas.addEventListener("mouseup",    endDraw);
        canvas.addEventListener("mouseleave", endDraw);
        canvas.addEventListener("touchstart", startDraw, { passive: false });
        canvas.addEventListener("touchmove",  draw,      { passive: false });
        canvas.addEventListener("touchend",   endDraw);

        return () => {
            canvas.removeEventListener("mousedown",  startDraw);
            canvas.removeEventListener("mousemove",  draw);
            canvas.removeEventListener("mouseup",    endDraw);
            canvas.removeEventListener("mouseleave", endDraw);
            canvas.removeEventListener("touchstart", startDraw);
            canvas.removeEventListener("touchmove",  draw);
            canvas.removeEventListener("touchend",   endDraw);
        };
    }, [startDraw, draw, endDraw, canvasRef]);

    const getDataURL = useCallback(() => {
        return canvasRef.current?.toDataURL("image/png") ?? null;
    }, [canvasRef]);

    return { isEmpty, clear, getDataURL };
}

// ─── EMBED SIGNATURE INTO PDF ─────────────────────────────────────────────────

async function embedSignatureIntoPdf(
    pdfBase64: string,
    signatureDataUrl: string,
    signerName: string,
    noSurat: string,
    tanggal: Date,
): Promise<Blob> {
    // Load existing PDF pages as images via canvas (browser-native)
    const srcBlob = base64ToBlob(pdfBase64);
    const srcUrl  = URL.createObjectURL(srcBlob);

    // Use PDF.js via CDN to render existing pages
    // We'll use a simpler approach: load the existing PDF with jsPDF and add a signature page
    // Since jsPDF can't parse existing PDFs, we add the signature to a new "halaman tanda tangan"

    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

    // ── Load existing PDF pages as images ─────────────────────────────────────
    // We use the browser's built-in PDF rendering via an iframe trick
    // For now, use jsPDF to create a combined doc: re-generate isn't an option,
    // so we embed the original PDF bytes and add a signature page.

    // Strategy: use pdf-lib approach via fetch + ArrayBuffer
    // Since we can't import pdf-lib directly, we'll use jsPDF to:
    // 1. Load original PDF as embedded content
    // 2. Add new signature page at the end

    // Actually — most practical approach for browser:
    // Create a NEW jsPDF with the signature page that references the original
    // The signed blob = original PDF bytes + signature metadata stored separately

    // Simplest robust approach: create signature certificate page
    const PAGE_W = 210;
    const PAGE_H = 297;
    const ML = 20;

    // Header bar
    doc.setFillColor(26, 92, 56); // #1a5c38
    doc.rect(0, 0, PAGE_W, 8, "F");

    // Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(26, 92, 56);
    doc.text("HALAMAN TANDA TANGAN DIGITAL", PAGE_W / 2, 22, { align: "center" });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(85, 85, 85);
    doc.text("Dokumen ini telah ditandatangani secara digital", PAGE_W / 2, 29, { align: "center" });

    // Divider
    doc.setDrawColor(26, 92, 56);
    doc.setLineWidth(0.5);
    doc.line(ML, 33, PAGE_W - ML, 33);

    // Document info box
    doc.setFillColor(242, 248, 245);
    doc.roundedRect(ML, 37, PAGE_W - ML * 2, 38, 3, 3, "F");
    doc.setDrawColor(200, 230, 215);
    doc.setLineWidth(0.3);
    doc.roundedRect(ML, 37, PAGE_W - ML * 2, 38, 3, 3, "S");

    const infoItems = [
        ["Nomor Surat", noSurat],
        ["Tanggal Surat", tanggal.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })],
        ["Ditandatangani Oleh", signerName],
        ["Tanggal Tanda Tangan", new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })],
    ];

    let iy = 44;
    infoItems.forEach(([label, val]) => {
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        doc.text(label + ":", ML + 4, iy);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(26, 26, 26);
        doc.text(val, ML + 52, iy);
        iy += 8;
    });

    // Signature box
    const sigBoxY = 85;
    const sigBoxH = 70;

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.4);
    doc.roundedRect(ML, sigBoxY, PAGE_W - ML * 2, sigBoxH, 3, 3, "FD");

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    doc.text("TANDA TANGAN", PAGE_W / 2, sigBoxY + 7, { align: "center" });

    // Embed signature image
    const sigImg = new Image();
    await new Promise<void>((resolve) => {
        sigImg.onload = () => resolve();
        sigImg.src    = signatureDataUrl;
    });

    // Draw sig on canvas to trim whitespace
    const trimCanvas = document.createElement("canvas");
    trimCanvas.width  = 600;
    trimCanvas.height = 200;
    const tctx = trimCanvas.getContext("2d")!;
    tctx.fillStyle = "white";
    tctx.fillRect(0, 0, 600, 200);
    // Center the signature
    const scale = Math.min(560 / sigImg.width, 180 / sigImg.height);
    const sw = sigImg.width  * scale;
    const sh = sigImg.height * scale;
    tctx.drawImage(sigImg, (600 - sw) / 2, (200 - sh) / 2, sw, sh);
    const trimmedDataUrl = trimCanvas.toDataURL("image/png");

    // Place in PDF
    doc.addImage(trimmedDataUrl, "PNG", ML + 5, sigBoxY + 10, PAGE_W - ML * 2 - 10, 50);

    // Name line
    const lineY = sigBoxY + sigBoxH - 14;
    doc.setDrawColor(26, 26, 26);
    doc.setLineWidth(0.5);
    doc.line(ML + 30, lineY, PAGE_W - ML - 30, lineY);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(26, 26, 26);
    doc.text(signerName, PAGE_W / 2, lineY + 5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text("PT Guci Emas Pratama", PAGE_W / 2, lineY + 10, { align: "center" });

    // Validity note
    const noteY = 168;
    doc.setFillColor(255, 251, 235);
    doc.roundedRect(ML, noteY, PAGE_W - ML * 2, 28, 2, 2, "F");
    doc.setDrawColor(253, 230, 138);
    doc.setLineWidth(0.3);
    doc.roundedRect(ML, noteY, PAGE_W - ML * 2, 28, 2, 2, "S");

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(120, 80, 0);
    doc.text("Catatan Keabsahan", ML + 4, noteY + 7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(140, 100, 20);
    const noteText = "Tanda tangan digital ini dibuat dan disimpan dalam sistem ERP PT Guci Emas Pratama. " +
        "Dokumen ini sah dan dapat dipertanggungjawabkan sebagai bukti persetujuan resmi.";
    const noteLines = doc.splitTextToSize(noteText, PAGE_W - ML * 2 - 8) as string[];
    noteLines.forEach((line, i) => doc.text(line, ML + 4, noteY + 14 + i * 5));

    // Timestamp & hash (simulated)
    const tsY = 205;
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    const ts = new Date().toISOString();
    doc.text(`Timestamp: ${ts}`, ML, tsY);
    doc.text(`Dokumen: ${noSurat.replace(/\//g, "-")}`, ML, tsY + 5);

    // Footer bar
    doc.setFillColor(26, 92, 56);
    doc.rect(0, PAGE_H - 8, PAGE_W, 8, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(255, 255, 255);
    doc.text("PT GUCI EMAS PRATAMA  ·  Sistem ERP  ·  Tanda Tangan Digital", PAGE_W / 2, PAGE_H - 3, { align: "center" });

    URL.revokeObjectURL(srcUrl);
    return doc.output("blob");
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function SignatureModal({ quotation, signerName, onClose, onSigned, templateConfig }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { isEmpty, clear, getDataURL } = useSignatureCanvas(canvasRef);

    const [step,    setStep]    = useState<"draw" | "preview" | "saving" | "done">("draw");
    const [preview, setPreview] = useState<string | null>(null); // data URL of sig
    const [error,   setError]   = useState("");

    // Resize canvas on mount
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        canvas.width  = rect.width  * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        const ctx = canvas.getContext("2d")!;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }, []);

    const handlePreview = () => {
        const dataUrl = getDataURL();
        if (!dataUrl || isEmpty) return;
        setPreview(dataUrl);
        setStep("preview");
    };

    const handleSave = async () => {
        if (!preview) return;
        // Daftar penawaran tidak memuat PDF/foto survei → ambil data lengkap dulu.
        const full = (await getQuotationById(quotation.id)) ?? quotation;
        if (!full.pdfBase64) {
            setError("PDF tidak ditemukan. Tidak bisa menambahkan tanda tangan.");
            return;
        }

        setStep("saving");
        setError("");

        try {
            // Re-generate PDF with signature embedded directly in Penutup section
            const signedBlob = await generateCompanyQuotationPDF({
                noSurat: quotation.noSurat,
                tanggal: quotation.tanggal instanceof Date ? quotation.tanggal : new Date((quotation.tanggal as unknown as { seconds: number }).seconds * 1000),
                kepadaNama: quotation.kepadaNama,
                kepadaAlamatLines: quotation.kepadaAlamatLines,
                kepadaUp: quotation.kepadaUp,
                jenisLayanan: quotation.jenisLayanan,
                perihal: quotation.perihal,
                items: quotation.items,
                biayaTambahan: quotation.biayaTambahan,
                diskonPct: quotation.diskonPct,
                ppn: quotation.ppn,
                ppnDppFaktor: quotation.ppnDppFaktor,
                garansiTahun: quotation.garansiTahun,
                jenisGaransi: quotation.jenisGaransi,
                marketingNama: quotation.marketingNama,
                marketingWa: quotation.marketingWa,
                // Technical data stored in quotation
                surveyPhotos: full.surveyPhotos,
                chemicals: quotation.chemicals,
                metode: quotation.metode,
                focusTarget: quotation.focusTarget,
                teknikPelaksanaan: quotation.teknikPelaksanaan,
                // Embed signature
                signatureBase64: preview,
                // Template kustom perusahaan
                templateConfig,
            }, quotation.companyId);

            // Convert to base64
            const signedPdfBase64 = await blobToBase64(signedBlob);

            // Save to Firestore
            await updateDoc(doc(db, "quotations", quotation.id), {
                signedPdfBase64,
                signedAt:  Timestamp.fromDate(new Date()),
                signedBy:  signerName,
            });

            setStep("done");
            onSigned(signedPdfBase64);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Gagal menyimpan tanda tangan.");
            setStep("preview");
        }
    };

    const handleDownloadSigned = async () => {
        if (!preview) return;
        const full = (await getQuotationById(quotation.id)) ?? quotation;
        const signedBlob = await generateCompanyQuotationPDF({
            noSurat: quotation.noSurat,
            tanggal: quotation.tanggal instanceof Date ? quotation.tanggal : new Date((quotation.tanggal as unknown as { seconds: number }).seconds * 1000),
            kepadaNama: quotation.kepadaNama,
            kepadaAlamatLines: quotation.kepadaAlamatLines,
            kepadaUp: quotation.kepadaUp,
            jenisLayanan: quotation.jenisLayanan,
            perihal: quotation.perihal,
            items: quotation.items,
            biayaTambahan: quotation.biayaTambahan,
            diskonPct: quotation.diskonPct,
            ppn: quotation.ppn,
            ppnDppFaktor: quotation.ppnDppFaktor,
            garansiTahun: quotation.garansiTahun,
            jenisGaransi: quotation.jenisGaransi,
            marketingNama: quotation.marketingNama,
            marketingWa: quotation.marketingWa,
            surveyPhotos: full.surveyPhotos,
            chemicals: quotation.chemicals,
            metode: quotation.metode,
            focusTarget: quotation.focusTarget,
            teknikPelaksanaan: quotation.teknikPelaksanaan,
            signatureBase64: preview,
            templateConfig,
        }, quotation.companyId);
        downloadBlob(signedBlob, `${quotation.noSurat.replace(/\//g, "-")}-SIGNED.pdf`);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={step === "draw" || step === "done" ? onClose : undefined} />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[98vh] md:max-h-[95vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center">
                            <PenLine size={18} className="text-purple-600" />
                        </div>
                        <div>
                            <h2 className="font-bold text-slate-900 text-sm">Tanda Tangan Digital</h2>
                            <p className="text-xs text-slate-400">{quotation.noSurat}</p>
                        </div>
                    </div>
                    {(step === "draw" || step === "done") && (
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                            <X size={16} />
                        </button>
                    )}
                </div>

                {/* Steps indicator */}
                <div className="flex items-center gap-0 px-6 py-3 bg-slate-50 border-b border-slate-100">
                    {[
                        { key: "draw",    label: "Gambar" },
                        { key: "preview", label: "Preview" },
                        { key: "saving",  label: "Simpan" },
                        { key: "done",    label: "Selesai" },
                    ].map((s, i, arr) => {
                        const stepOrder = ["draw", "preview", "saving", "done"];
                        const curr = stepOrder.indexOf(step);
                        const si   = stepOrder.indexOf(s.key);
                        const done = si < curr;
                        const active = si === curr;
                        return (
                            <div key={s.key} className="flex items-center">
                                <div className="flex items-center gap-1.5">
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition-all
                                        ${done   ? "bg-green-500 text-white"
                                        : active ? "bg-purple-600 text-white"
                                                 : "bg-slate-200 text-slate-400"}`}>
                                        {done ? <Check size={10} /> : i + 1}
                                    </div>
                                    <span className={`text-xs font-medium ${active ? "text-purple-700" : done ? "text-green-600" : "text-slate-400"}`}>
                                        {s.label}
                                    </span>
                                </div>
                                {i < arr.length - 1 && (
                                    <ChevronRight size={12} className="mx-2 text-slate-300" />
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto">

                    {/* ── STEP: DRAW ─────────────────────────────────────────── */}
                    {step === "draw" && (
                        <div className="p-6">
                            <div className="mb-4">
                                <p className="text-sm font-semibold text-slate-700 mb-1">
                                    Gambar tanda tangan kamu di bawah ini
                                </p>
                                <p className="text-xs text-slate-400">
                                    Gunakan mouse atau sentuh layar untuk menggambar
                                </p>
                            </div>

                            {/* Canvas area */}
                            <div className="relative rounded-xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-white overflow-hidden"
                                style={{ height: "200px" }}>
                                <canvas
                                    ref={canvasRef}
                                    className="absolute inset-0 w-full h-full cursor-crosshair"
                                    style={{ touchAction: "none" }}
                                />
                                {isEmpty && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="text-center">
                                            <PenLine size={28} className="text-slate-200 mx-auto mb-2" />
                                            <p className="text-xs text-slate-300">Mulai menggambar di sini</p>
                                        </div>
                                    </div>
                                )}
                                {/* Guide line */}
                                <div className="absolute bottom-10 left-8 right-8 border-b border-slate-200 pointer-events-none" />
                                <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-slate-300 pointer-events-none">
                                    Tanda Tangan
                                </p>
                            </div>

                            {/* Signer info */}
                            <div className="mt-4 flex items-center gap-3 bg-purple-50 rounded-xl px-4 py-3">
                                <div className="w-8 h-8 rounded-full bg-purple-200 flex items-center justify-center text-purple-700 font-bold text-sm">
                                    {signerName.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-purple-900">{signerName}</p>
                                    <p className="text-xs text-purple-500">PT Guci Emas Pratama</p>
                                </div>
                                <div className="ml-auto text-xs text-purple-400">
                                    {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── STEP: PREVIEW ──────────────────────────────────────── */}
                    {step === "preview" && preview && (
                        <div className="p-6">
                            <p className="text-sm font-semibold text-slate-700 mb-3">Preview tanda tangan</p>

                            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                                {/* Mock document header */}
                                <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-2.5 flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                                    <span className="ml-2 text-xs text-slate-300 font-mono">{quotation.noSurat}-SIGNED.pdf</span>
                                </div>

                                <div className="p-5 bg-gradient-to-b from-slate-50 to-white">
                                    {/* Simulated doc content */}
                                    <div className="mb-4 space-y-1.5">
                                        <div className="h-2 bg-slate-100 rounded w-3/4" />
                                        <div className="h-2 bg-slate-100 rounded w-full" />
                                        <div className="h-2 bg-slate-100 rounded w-5/6" />
                                    </div>

                                    {/* Signature section */}
                                    <div className="border border-dashed border-purple-200 rounded-lg p-4 bg-purple-50/50">
                                        <p className="text-xs text-slate-400 text-center mb-2 uppercase tracking-wide font-medium">Tanda Tangan</p>
                                        <div className="flex justify-center">
                                            <img src={preview} alt="Tanda tangan"
                                                className="max-h-20 max-w-full object-contain"
                                                style={{ filter: "contrast(1.2)" }} />
                                        </div>
                                        <div className="mt-2 border-t border-slate-300 pt-2 text-center">
                                            <p className="text-xs font-bold text-slate-700">{signerName}</p>
                                            <p className="text-xs text-slate-400">PT Guci Emas Pratama</p>
                                        </div>
                                    </div>

                                    {/* Valid badge */}
                                    <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-green-600 bg-green-50 rounded-lg py-1.5">
                                        <Check size={11} />
                                        <span className="font-medium">Ditandatangani secara digital</span>
                                    </div>
                                </div>
                            </div>

                            {error && (
                                <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
                                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── STEP: SAVING ───────────────────────────────────────── */}
                    {step === "saving" && (
                        <div className="p-10 flex flex-col items-center justify-center gap-4">
                            <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center">
                                <Loader2 size={28} className="text-purple-600 animate-spin" />
                            </div>
                            <div className="text-center">
                                <p className="font-semibold text-slate-800">Menyimpan tanda tangan...</p>
                                <p className="text-sm text-slate-400 mt-1">Mohon tunggu sebentar</p>
                            </div>
                        </div>
                    )}

                    {/* ── STEP: DONE ─────────────────────────────────────────── */}
                    {step === "done" && (
                        <div className="p-8 flex flex-col items-center justify-center gap-4">
                            <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center">
                                <Check size={28} className="text-green-600" />
                            </div>
                            <div className="text-center">
                                <h3 className="font-bold text-slate-900 text-lg">Tanda Tangan Tersimpan!</h3>
                                <p className="text-sm text-slate-400 mt-1">
                                    PDF yang sudah ditandatangani tersedia untuk diunduh
                                </p>
                            </div>
                            <button
                                onClick={handleDownloadSigned}
                                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors">
                                <Download size={15} />
                                Download PDF Bertanda Tangan
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer actions */}
                <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
                    {step === "draw" && (
                        <>
                            <button onClick={clear} disabled={isEmpty}
                                className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40">
                                <RotateCcw size={13} /> Ulangi
                            </button>
                            <button onClick={handlePreview} disabled={isEmpty}
                                className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 disabled:opacity-40 transition-colors">
                                Preview <ChevronRight size={14} />
                            </button>
                        </>
                    )}

                    {step === "preview" && (
                        <>
                            <button onClick={() => { setStep("draw"); setPreview(null); setError(""); clear(); }}
                                className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                                <RotateCcw size={13} /> Gambar Ulang
                            </button>
                            <button onClick={handleSave}
                                className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 transition-colors">
                                <Check size={14} /> Simpan & Terapkan
                            </button>
                        </>
                    )}

                    {step === "done" && (
                        <button onClick={onClose}
                            className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-800 text-white text-sm font-semibold rounded-xl hover:bg-slate-900 transition-colors">
                            Selesai
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}