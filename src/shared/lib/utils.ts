import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function formatRupiah(amount?: number | null): string {
    const valid = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        minimumFractionDigits: 0,
    }).format(valid);
}

export function formatDate(date?: Date | string | null): string {
    if (!date) return "-";
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(d);
}

export function formatDateTime(date?: Date | string | null): string {
    if (!date) return "-";
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(d);
}

export const SERVICE_LABELS: Record<string, string> = {
    pest_control: "Pest Control",
    anti_rayap: "Anti Rayap",
    spraying: "Spraying",
    fogging: "Fogging",
    baiting_tikus: "Baiting Tikus",
    injeksi: "Injeksi",
    pipanisasi: "Pipanisasi",
    baiting_system: "Baiting System",
};

export const ROLE_LABELS: Record<string, string> = {
    MASTER_SUPER_ADMIN: "Master Super Admin",
  SUPERADMIN: "Direktur (Superadmin)",
    ADMIN: "Admin",
    MARKETING: "Marketing",
    TEKNISI_LAPANGAN: "Teknisi Lapangan",
};
