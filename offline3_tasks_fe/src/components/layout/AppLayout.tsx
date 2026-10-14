import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { BannedModal } from '../common/BannedModal';
import { useAuth } from '../../context/AuthContext';

export const AppLayout: React.FC = () => {
  const { isBannedModalOpen, closeBannedModal, bannedMessage } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Global Banned Lockout Modal */}
      <BannedModal
        isOpen={isBannedModalOpen}
        onClose={closeBannedModal}
        message={bannedMessage}
      />
    </div>
  );
};
