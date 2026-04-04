interface StatusBadgeProps {
  status: string;
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  ACTIVE: {
    label: "Hiệu lực",
    className: "bg-green-100 text-green-800 border-green-200",
  },
  CANCEL: {
    label: "Đã hủy",
    className: "bg-red-100 text-red-800 border-red-200",
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_MAP[status?.toUpperCase()] ?? {
    label: status || "—",
    className: "bg-gray-100 text-gray-600 border-gray-200",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}
