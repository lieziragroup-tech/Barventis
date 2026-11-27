import { useState, useRef, useEffect } from "react";
import { Camera, Save, RotateCcw, Trash2, ArrowLeft } from "lucide-react";

interface Point { x: number; y: number }
interface DrawnLine { start: Point; end: Point; lengthMeter: number }

export function PhotoMeasureFallback({
    onBack,
    onApplyMeasurement,
}: {
    onBack: () => void;
    onApplyMeasurement?: (totalMeter: number, annotatedPhotoBase64: string | null) => void;
}) {
    const [step, setStep] = useState<"camera" | "drawing" | "prompt_scale">("camera");
    const [photo, setPhoto] = useState<string | null>(null);
    
    const [lines, setLines] = useState<DrawnLine[]>([]);
    const [tempStart, setTempStart] = useState<Point | null>(null);
    const [tempEnd, setTempEnd] = useState<Point | null>(null);
    const [scalePxPerM, setScalePxPerM] = useState<number | null>(null);
    const [inputLength, setInputLength] = useState("");

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);

    useEffect(() => {
        if (step === "camera") {
            navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
                .then(stream => { if (videoRef.current) videoRef.current.srcObject = stream; })
                .catch(err => console.error("Camera error:", err));
        } else {
            if (videoRef.current?.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach(t => t.stop());
            }
        }
    }, [step]);

    const handleCapture = () => {
        if (!videoRef.current) return;
        const cvs = document.createElement("canvas");
        cvs.width = videoRef.current.videoWidth || 800;
        cvs.height = videoRef.current.videoHeight || 600;
        cvs.getContext("2d")?.drawImage(videoRef.current, 0, 0);
        setPhoto(cvs.toDataURL("image/jpeg", 0.8));
        setStep("drawing");
    };

    useEffect(() => {
        if (step !== "camera" && photo && canvasRef.current) {
            const ctx = canvasRef.current.getContext("2d");
            if (!ctx) return;
            
            if (!imageRef.current) {
                const img = new Image();
                img.src = photo;
                img.onload = () => {
                    imageRef.current = img;
                    drawCanvas();
                };
            } else {
                drawCanvas();
            }
        }
    }, [step, photo, lines, tempStart, tempEnd]);

    const drawCanvas = () => {
        const cvs = canvasRef.current;
        const ctx = cvs?.getContext("2d");
        if (!cvs || !ctx || !imageRef.current) return;
        
        const rect = cvs.getBoundingClientRect();
        cvs.width = rect.width;
        cvs.height = rect.height;

        ctx.drawImage(imageRef.current, 0, 0, cvs.width, cvs.height);

        ctx.lineWidth = 3;
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        
        lines.forEach(l => {
            ctx.strokeStyle = "#10b981";
            ctx.beginPath();
            ctx.moveTo(l.start.x, l.start.y);
            ctx.lineTo(l.end.x, l.end.y);
            ctx.stroke();
            const midX = (l.start.x + l.end.x) / 2;
            const midY = (l.start.y + l.end.y) / 2;
            ctx.fillStyle = "rgba(0,0,0,0.7)";
            const txt = `${l.lengthMeter.toFixed(2)} m`;
            const txtW = ctx.measureText(txt).width;
            ctx.fillRect(midX - txtW/2 - 6, midY - 12, txtW + 12, 24);
            ctx.fillStyle = "#10b981";
            ctx.fillText(txt, midX, midY + 4);
        });

        if (tempStart && tempEnd) {
            ctx.strokeStyle = "#f59e0b";
            ctx.beginPath();
            ctx.moveTo(tempStart.x, tempStart.y);
            ctx.lineTo(tempEnd.x, tempEnd.y);
            ctx.stroke();
        } else if (tempStart) {
            ctx.fillStyle = "#f59e0b";
            ctx.beginPath();
            ctx.arc(tempStart.x, tempStart.y, 5, 0, Math.PI * 2);
            ctx.fill();
        }
    };

    const handleCanvasClick = (e: React.MouseEvent) => {
        if (step !== "drawing") return;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };

        if (!tempStart) {
            setTempStart(pt);
        } else {
            setTempEnd(pt);
            if (!scalePxPerM) {
                setStep("prompt_scale");
            } else {
                const distPx = Math.hypot(pt.x - tempStart.x, pt.y - tempStart.y);
                const lenM = distPx / scalePxPerM;
                setLines([...lines, { start: tempStart, end: pt, lengthMeter: lenM }]);
                setTempStart(null);
                setTempEnd(null);
            }
        }
    };

    const submitScale = () => {
        const m = parseFloat(inputLength);
        if (isNaN(m) || m <= 0) return alert("Masukkan panjang valid!");
        if (tempStart && tempEnd) {
            const distPx = Math.hypot(tempEnd.x - tempStart.x, tempEnd.y - tempStart.y);
            setScalePxPerM(distPx / m);
            setLines([{ start: tempStart, end: tempEnd, lengthMeter: m }]);
            setTempStart(null);
            setTempEnd(null);
            setStep("drawing");
            setInputLength("");
        }
    };

    const totalJarak = lines.reduce((acc, l) => acc + l.lengthMeter, 0);
    const lubangBor = Math.round(totalJarak / 0.35);
    const kebutuhanObat = totalJarak * 5;

    const handleSave = () => {
        const annotated = canvasRef.current ? canvasRef.current.toDataURL("image/jpeg", 0.85) : photo;
        if (onApplyMeasurement) {
            onApplyMeasurement(totalJarak, annotated);
        } else {
            alert("Foto dan kalkulasi berhasil disimpan!");
            onBack();
        }
    };

    return (
        <div className="flex flex-col h-screen bg-black text-white relative overflow-hidden">
            <div className="absolute top-0 w-full p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/70 to-transparent">
                <button onClick={onBack} className="p-2 bg-black/50 rounded-full text-white">
                    <ArrowLeft size={20} />
                </button>
                <h1 className="font-bold text-lg text-white">
                    {step === "camera" ? "Foto Titik Awal" : "Anotasi & Ukur"}
                </h1>
                <div className="w-9" />
            </div>

            <div className="flex-1 relative overflow-hidden bg-gray-900 flex items-center justify-center">
                {step === "camera" ? (
                    <>
                        <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-64 h-64 border-2 border-white/30 rounded-lg"></div>
                        </div>
                    </>
                ) : (
                    <canvas ref={canvasRef} onClick={handleCanvasClick} className="absolute inset-0 w-full h-full object-contain cursor-crosshair" />
                )}
            </div>

            {step === "prompt_scale" && (
                <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
                    <div className="bg-white text-black p-6 rounded-2xl w-full max-w-sm space-y-4">
                        <h2 className="font-bold text-lg">Sesuaikan Ukuran Asli</h2>
                        <p className="text-sm text-gray-600">Berapa meter ukuran asli dari garis pertama yang baru saja Anda tarik? (Sesuai hasil meteran fisik)</p>
                        <div className="flex items-center gap-2">
                            <input type="number" value={inputLength} onChange={e => setInputLength(e.target.value)} placeholder="Contoh: 4.5" className="flex-1 border border-gray-300 p-3 rounded-lg font-bold text-lg" autoFocus />
                            <span className="font-bold text-gray-500">meter</span>
                        </div>
                        <button onClick={submitScale} className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl active:bg-emerald-700">Terapkan Ukuran</button>
                    </div>
                </div>
            )}

            <div className="bg-gray-900 pb-safe z-10 rounded-t-2xl border-t border-gray-800 absolute bottom-0 w-full">
                {step === "camera" ? (
                    <div className="p-6 flex justify-center">
                        <button onClick={handleCapture} className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-black border-4 border-gray-400 active:bg-gray-200">
                            <Camera size={28} />
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="p-4 flex gap-4">
                            <div className="flex-1 bg-gray-800 rounded-lg p-3">
                                <div className="text-gray-400 text-[10px] uppercase font-bold tracking-wide">Total Panjang Tembok</div>
                                <div className="font-mono text-2xl font-bold text-emerald-400">{totalJarak > 0 ? totalJarak.toFixed(2) : "--"} <span className="text-sm">m'</span></div>
                            </div>
                            <div className="flex-1 bg-gray-800 rounded-lg p-3">
                                <div className="text-gray-400 text-[10px] uppercase font-bold tracking-wide">Estimasi Titik Bor</div>
                                <div className="font-mono text-2xl font-bold text-amber-400">{lubangBor} <span className="text-xs">titik</span></div>
                            </div>
                        </div>
                        <div className="px-4 pb-4">
                            <div className="mb-3 text-xs text-center text-gray-400">
                                {scalePxPerM ? `Kebutuhan Obat Kimia: ${kebutuhanObat.toFixed(1)} Liter. Ketuk layar untuk menambah garis ukur tembok lain.` : "Mulai dengan mengetuk 2 titik awal dan akhir tembok pada foto di atas."}
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setStep("camera")} className="p-4 bg-gray-800 rounded-xl flex items-center justify-center text-white">
                                    <RotateCcw size={20} />
                                </button>
                                <button onClick={() => { setLines([]); setTempStart(null); setTempEnd(null); setScalePxPerM(null); }} className="p-4 bg-rose-900/50 text-rose-400 rounded-xl flex items-center justify-center">
                                    <Trash2 size={20} />
                                </button>
                                <button onClick={handleSave} className="flex-1 bg-emerald-600 active:bg-emerald-700 py-4 rounded-xl flex items-center justify-center font-bold gap-2 text-white disabled:opacity-50" disabled={lines.length === 0}>
                                    <Save size={20} /> Masukkan ke Volume Survey
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
