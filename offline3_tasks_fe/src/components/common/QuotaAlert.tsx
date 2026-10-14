import React from 'react';
import { AlertCircle } from 'lucide-react';

interface QuotaAlertProps {
  message?: string | null;
  className?: string;
}

export const QuotaAlert: React.FC<QuotaAlertProps> = ({ message, className = '' }) => {
  if (!message) return null;

  return (
    <div
      className={`flex items-start gap-3 rounded-md bg-amber-50 border border-amber-300 p-3.5 text-amber-800 ${className}`}
      role="alert"
    >
      <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
      <div className="text-sm font-medium leading-relaxed">{message}</div>
    </div>
  );
};
