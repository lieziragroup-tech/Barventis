import { useNavigate } from "react-router-dom";
import { Button } from '@/shared/ui/button';
import { ShieldX } from "lucide-react";

export function UnauthorizedPage() {
    const navigate = useNavigate();
    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-100 text-red-600 mb-4">
                    <ShieldX size={32} />
                </div>
                <h1 className="text-xl font-bold text-slate-900 mb-2">Akses Ditolak</h1>
                <p className="text-slate-500 text-sm mb-6">
                    Kamu tidak punya akses ke halaman ini.
                    <br />
                    Hubungi administrator jika ini adalah kesalahan.
                </p>
                <Button onClick={() => navigate("/dashboard")}>
                    Kembali ke Dashboard
                </Button>
            </div>
        </div>
    );
}
