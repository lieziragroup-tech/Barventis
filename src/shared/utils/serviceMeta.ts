import { Shield, Home, Wind, Map, CheckSquare, Target, Sparkles, type LucideIcon } from 'lucide-react';
import { ApplicationMethod, ServiceType } from '@/entities/types';

interface ServiceTypeMeta {
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  badgeClass: string;
  description: string;
}

/**
 * Dua Layanan Utama PT Guci Emas Pratama (Selaras dengan Jarivis & Modul Quotation AR/PCO):
 * 1. GENERAL_PEST_CONTROL -> "Pest Control"
 * 2. TERMITE_CONTROL      -> "Anti Rayap"
 * (Nilai enum lama tetap dipertahankan di peta metadata untuk kompatibilitas mundur database)
 */
export const PRIMARY_SERVICE_TYPES: ServiceType[] = [
  'GENERAL_PEST_CONTROL',
  'TERMITE_CONTROL',
];

export const SERVICE_TYPE_META: Partial<Record<ServiceType, ServiceTypeMeta>> = {
  GENERAL_PEST_CONTROL: {
    label: 'Pest Control',
    shortLabel: 'Pest Control',
    icon: Shield,
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    description: 'Pengendalian hama terpadu (Serangga merayap/terbang, Rodent/Tikus, Vektor, & Fumigasi).',
  },
  TERMITE_CONTROL: {
    label: 'Anti Rayap',
    shortLabel: 'Anti Rayap',
    icon: Home,
    badgeClass: 'bg-purple-50 text-purple-900 border-purple-200',
    description: 'Pengendalian rayap pra/pasca konstruksi (Drilling/Injeksi, Soil Treatment, Baiting & Garansi).',
  },
  FUMIGATION: {
    label: 'Pest Control (Fumigasi)',
    shortLabel: 'Pest Control',
    icon: Wind,
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    description: 'Prosedur fumigasi ruang tertutup/pergudangan (Sub-layanan Pest Control).',
  },
  RODENT_CONTROL: {
    label: 'Pest Control (Rodent)',
    shortLabel: 'Pest Control',
    icon: Target,
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    description: 'Sistem pengendalian terpadu hama pengerat/tikus (Sub-layanan Pest Control).',
  },
  MOSQUITO_CONTROL: {
    label: 'Pest Control (Vektor)',
    shortLabel: 'Pest Control',
    icon: Map,
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    description: 'Fogging spasial dan pengendalian vektor nyamuk/lalat (Sub-layanan Pest Control).',
  },
  BIRD_CONTROL: {
    label: 'Pest Control',
    shortLabel: 'Pest Control',
    icon: CheckSquare,
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    description: 'Pengendalian hama lingkungan terpadu.',
  },
  BED_BUG_CONTROL: {
    label: 'Pest Control',
    shortLabel: 'Pest Control',
    icon: Sparkles,
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    description: 'Pengendalian hama sanitasi ruangan.',
  },
  DISINFECTION: {
    label: 'Pest Control',
    shortLabel: 'Pest Control',
    icon: Sparkles,
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    description: 'Sterilisasi dan pengendalian vektor lingkungan.',
  },
};

export const SERVICE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'Semua Layanan' },
  { value: 'GENERAL_PEST_CONTROL', label: 'Pest Control' },
  { value: 'TERMITE_CONTROL', label: 'Anti Rayap' },
];

export const APPLICATION_METHOD_LABELS: Partial<Record<ApplicationMethod, string>> = {
  SPRAYING: 'Penyemprotan (Spraying)',
  BAITING: 'Sistem Umpan (Baiting)',
  DRILLING: 'Pengeboran & Injeksi (Drilling)',
  TRENCHING: 'Parit Kimia (Trenching)',
  FOGGING: 'Pengasapan (Fogging)',
  MISTING: 'Pengabutan (Misting)',
  DUSTING: 'Penaburan Bubuk (Dusting)',
  GEL_INJECTION: 'Gel Umpan Titik Injeksi',
};

export const APPLICATION_METHOD_OPTIONS: { value: ApplicationMethod; label: string }[] = (
  Object.entries(APPLICATION_METHOD_LABELS) as [ApplicationMethod, string][]
).map(([value, label]) => ({ value, label }));

export function getServiceTypeMeta(type: ServiceType): ServiceTypeMeta {
  return SERVICE_TYPE_META[type] ?? SERVICE_TYPE_META.GENERAL_PEST_CONTROL!;
}