import React, { useState } from 'react';
import { changePassword } from '@/shared/api/auth';
import { useAuthStore } from '@/app/store/authStore';
import { X, Lock, Eye, EyeOff, Loader2, KeyRound } from 'lucide-react';

interface ChangePasswordModalProps {
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ onClose }) => {
  const user = useAuthStore(st => st.user);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError('Kata sandi baru tidak cocok dengan konfirmasi.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Kata sandi baru minimal 6 karakter.');
      return;
    }

    setIsLoading(true);
    try {
      const msg = await changePassword(oldPassword, newPassword, user?.email);
      setSuccess(msg);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Gagal mengubah kata sandi.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center pt-10 sm:pt-0 pb-10 sm:pb-0 p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col max-h-[85dvh]">
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              <KeyRound size={16} />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-slate-800 text-sm">Ubah Kata Sandi</h2>
              {user?.email && (
                <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {success ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <KeyRound size={32} />
              </div>
              <h3 className="text-emerald-700 font-bold mb-2">Kata Sandi Diperbarui</h3>
              <p className="text-xs text-slate-600 mb-6">{success}</p>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg font-medium">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Kata Sandi Saat Ini</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type={showOldPassword ? 'text' : 'password'}
                    required
                    placeholder="Masukkan kata sandi saat ini"
                    value={oldPassword}
                    onChange={e => setOldPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-2 bg-slate-50 rounded-lg border border-slate-300 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPassword(!showOldPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showOldPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Kata Sandi Baru</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    placeholder="Minimal 6 karakter"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-2 bg-slate-50 rounded-lg border border-slate-300 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Konfirmasi Kata Sandi Baru</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    placeholder="Ulangi kata sandi baru"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-2 bg-slate-50 rounded-lg border border-slate-300 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="pt-4 flex gap-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-semibold text-sm transition-colors hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isLoading && <Loader2 size={16} className="animate-spin" />}
                  Simpan Sandi
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
