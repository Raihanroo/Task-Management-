import React from 'react';
import { ShieldAlert, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface BannedModalProps {
  isOpen: boolean;
  onClose: () => void;
  message?: string | null;
}

export const BannedModal: React.FC<BannedModalProps> = ({ isOpen, onClose, message }) => {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleAcknowledge = () => {
    onClose();
    navigate('/login?banned=true');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Dark persistent backdrop */}
      <div className="fixed inset-0 bg-red-950 bg-opacity-70 backdrop-blur-sm transition-opacity" />

      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-md transform rounded-xl bg-white p-6 text-center shadow-2xl transition-all border-2 border-red-500">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 mb-4">
            <ShieldAlert className="h-8 w-8 text-red-600" />
          </div>

          <h3 className="text-xl font-bold text-gray-900 mb-2">Account Temporarily Banned</h3>

          <p className="text-sm text-gray-600 mb-6 leading-relaxed">
            {message || 'Your account is temporarily banned. Please contact support or an administrator.'}
          </p>

          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 text-left mb-6">
            <strong>Security Notice:</strong> Your active session has been immediately revoked by the security interceptor. You cannot access workspaces or create resources while suspended.
          </div>

          <button
            type="button"
            onClick={handleAcknowledge}
            className="w-full inline-flex justify-center items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            <span>Return to Login</span>
          </button>
        </div>
      </div>
    </div>
  );
};
