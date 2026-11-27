import React, { useState, useEffect } from "react";
import { useOfflineStore } from "../../store/offlineStore";
import { WifiOff, RefreshCw, X, Layers, Check } from "lucide-react";

export function OfflineStatusBar() {
    const { isOnline, isSyncing, pendingQueue, syncAll, initNetworkListeners, clearQueue } = useOfflineStore();
    const [showModal, setShowModal] = useState(false);
    const [toastDismissed, setToastDismissed] = useState(false);

    useEffect(() => {
        const cleanup = initNetworkListeners();
        return cleanup;
    }, [initNetworkListeners]);

    useEffect(() => {
        setToastDismissed(false);
    }, [isOnline, pendingQueue.length]);

    if (isOnline && pendingQueue.length === 0 && !isSyncing) {
        return null;
    }

    if (toastDismissed && !showModal) {
        return (
            <button
                onClick={() => setShowModal(true)}
                className="fixed bottom-16 md:bottom-5 right-4 z-40 bg-slate-900 text-slate-200 text-xs px-3 py-1.5 rounded-lg shadow-md border border-slate-700 flex items-center gap-2 hover:bg-slate-800 transition-colors"
            >
                <span className={`w-2 h-2 rounded-full ${!isOnline ? "bg-amber-400" : "bg-blue-400"}`} />
                <span>{pendingQueue.length} antrean</span>
            </button>
        );
    }

    return (
        <>
            {/* Subtle Floating Status Notification Toast */}
            <div className="fixed bottom-16 md:bottom-5 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-sm animate-in fade-in duration-200 font-sans">
                <div className="rounded-xl p-3 shadow-lg border border-slate-800 bg-slate-900 text-slate-200 text-xs flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                        {!isOnline ? (
                            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                                <WifiOff size={14} />
                            </div>
                        ) : isSyncing ? (
                            <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                                <RefreshCw size={14} className="animate-spin" />
                            </div>
                        ) : (
                            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                                <Check size={14} />
                            </div>
                        )}

                        <div className="truncate">
                            <div className="font-medium text-slate-200 truncate">
                                {!isOnline
                                    ? "Mode Luring (Offline)"
                                    : isSyncing
                                    ? "Menyinkronkan data..."
                                    : `${pendingQueue.length} data tersimpan lokal`}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                                {!isOnline
                                    ? "Data disimpan aman di memori perangkat"
                                    : isSyncing
                                    ? "Mengunggah data pengerjaan"
                                    : "Koneksi telah terhubung kembali"}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        {isOnline && pendingQueue.length > 0 && !isSyncing && (
                            <button
                                onClick={() => syncAll()}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md text-xs transition-colors"
                            >
                                Kirim
                            </button>
                        )}

                        {pendingQueue.length > 0 && (
                            <button
                                onClick={() => setShowModal(true)}
                                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors"
                                title="Lihat antrean"
                            >
                                <Layers size={14} />
                            </button>
                        )}

                        <button
                            onClick={() => setToastDismissed(true)}
                            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors"
                            title="Tutup"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Offline Queue Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-md max-h-[80vh] flex flex-col shadow-xl overflow-hidden font-sans">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="font-semibold text-slate-900 text-sm">Antrean Sinkronisasi Data</h3>
                                <p className="text-xs text-slate-500">
                                    Status: {isOnline ? "Online" : "Offline"} · {pendingQueue.length} data tersimpan
                                </p>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-4 flex-1 overflow-y-auto space-y-2">
                            {pendingQueue.length === 0 ? (
                                <div className="text-center py-8 text-slate-400 text-xs">
                                    Semua data telah tersinkronisasi dengan server.
                                </div>
                            ) : (
                                pendingQueue.map((item, idx) => (
                                    <div
                                        key={item.id}
                                        className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between gap-3 text-xs"
                                    >
                                        <div className="min-w-0">
                                            <div className="font-medium text-slate-800 truncate">
                                                {idx + 1}. {item.title}
                                            </div>
                                            <div className="text-[11px] text-slate-500 mt-0.5">
                                                {new Date(item.timestamp).toLocaleTimeString("id-ID", {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                })}{" "}
                                                · {item.type}
                                            </div>
                                        </div>
                                        <span className="shrink-0 text-[10px] text-slate-500">
                                            Tersimpan
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="p-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                            {pendingQueue.length > 0 && (
                                <button
                                    onClick={() => clearQueue()}
                                    className="text-red-600 hover:text-red-700 px-2 py-1 font-medium"
                                >
                                    Hapus
                                </button>
                            )}
                            <div className="flex items-center gap-2 ml-auto">
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="px-3.5 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
                                >
                                    Tutup
                                </button>
                                {isOnline && pendingQueue.length > 0 && (
                                    <button
                                        disabled={isSyncing}
                                        onClick={async () => {
                                            await syncAll();
                                        }}
                                        className="px-3.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50"
                                    >
                                        {isSyncing ? "Menyinkronkan..." : "Kirim Sekarang"}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
