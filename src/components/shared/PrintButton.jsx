import { Printer } from 'lucide-react';

export default function PrintButton({
  onClick,
  disabled = false,
  label = 'Print',
  className = '',
  title = 'Cetak tampilan tabel',
  allowedRoles,
  currentRole,
  style = {}
}) {
  // Role check only if allowedRoles is explicitly provided and currentRole exists
  if (allowedRoles && currentRole && !allowedRoles.includes(currentRole)) {
    return null;
  }

  const handlePrint = () => {
    if (onClick) {
      onClick();
    } else {
      window.print();
    }
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      disabled={disabled}
      className={`btn btn-secondary no-print ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '7px',
        padding: '8px 14px',
        fontSize: '0.85rem',
        opacity: disabled ? 0.7 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style
      }}
      title={title}
    >
      <Printer size={15} />
      <span>{label}</span>
    </button>
  );
}
