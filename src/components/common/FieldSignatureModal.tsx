import React, { useRef, useState, useEffect } from "react";
import { X, RotateCcw, Check, PenTool } from "lucide-react";

interface FieldSignatureModalProps {
    isOpen: boolean;
    title?: string;
    subtitle?: string;
    onClose: () => void;
    onSave: (signatureBase64: string, signerName: string) => void;
}

export function FieldSignatureModal({
    isOpen,
    title = "Tanda Tangan Digital Klien",
    subtitle = "Bubuhkan tanda tangan pada area canvas di bawah ini sebagai bukti penyelesaian pekerjaan.",
    onClose,
    onSave,
}: FieldSignatureModalProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasDrawn, setHasDrawn] = useState(false);
    const [signerName, setSignerName] = useState("");

    useEffect(() => {
        if (!isOpen) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * 2;
        canvas.height = rect.height * 2;
        ctx.scale(2, 2);

        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
    }, [isOpen]);

    if (!isOpen) return null;

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        setIsDrawing(true);
        setHasDrawn(true);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
        const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

        ctx.beginPath();
        ctx.moveTo(clientX - rect.left, clientY - rect.top);
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
        const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

        ctx.lineTo(clientX - rect.left, clientY - rect.top);
        ctx.stroke();
    };

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasDrawn(false);
    };

    const handleSave = () => {
        const canvas = canvasRef.current;
        if (!canvas || !hasDrawn) return;
        const dataUrl = canvas.toDataURL("image/png");
        onSave(dataUrl, signerName || "Klien / PIC Lapangan");
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 font-sans">
            <div className="bg-white rounded-xl w-full max-w-md overflow-hidden shadow-xl flex flex-col">
                {/* Header */}
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h3 className="font-semibold text-slate-900 text-sm">{title}</h3>
                        <p className="text-[11px] text-slate-500">Berita Acara & Pengesahan Lapangan</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md text-slate-400 hover:bg-slate-100 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-4 space-y-3">
                    <p className="text-xs text-slate-600">{subtitle}</p>

                    <div>
                        <label className="text-[11px] font-medium text-slate-700 block mb-1">
                            Nama Klien / Penandatangan:
                        </label>
                        <input
                            type="text"
                            placeholder="Nama PIC atau Klien..."
                            value={signerName}
                            onChange={(e) => setSignerName(e.target.value)}
                            className="w-full h-9 px-3 text-xs rounded-lg border border-slate-200 focus:border-slate-800"
                        />
                    </div>

                    {/* Canvas Container */}
                    <div className="border border-slate-300 rounded-xl bg-slate-50 overflow-hidden relative touch-none select-none">
                        <canvas
                            ref={canvasRef}
                            className="w-full h-44 cursor-crosshair block"
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                        />

                        {!hasDrawn && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-400 text-xs">
                                Tanda tangani pada area ini
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between text-xs">
                        <span className="text-[11px] text-slate-400">
                            {hasDrawn ? "Tanda tangan terisi" : "Area tanda tangan kosong"}
                        </span>
                        <button
                            type="button"
                            onClick={clearCanvas}
                            disabled={!hasDrawn}
                            className="text-xs text-slate-600 hover:text-red-600 flex items-center gap-1 disabled:opacity-30 disabled:pointer-events-none font-medium"
                        >
                            <RotateCcw size={12} /> Bersihkan
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2 text-xs">
                    <button
                        onClick={onClose}
                        className="px-3.5 py-1.5 rounded-lg text-slate-600 hover:bg-slate-200 font-medium"
                    >
                        Batal
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!hasDrawn}
                        className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1"
                    >
                        <Check size={14} /> Simpan Tanda Tangan
                    </button>
                </div>
            </div>
        </div>
    );
}
