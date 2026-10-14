import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FolderKanban, CheckSquare, ShieldCheck, LogOut, User as UserIcon } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { currentUser, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? 'bg-indigo-50 text-indigo-700 font-semibold'
        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
    }`;

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Left: Brand & Navigation */}
          <div className="flex items-center gap-8">
            <Link to="/projects" className="flex items-center gap-2.5 text-indigo-600 font-bold text-lg">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm">
                <FolderKanban className="w-5 h-5" />
              </div>
              <span className="text-gray-900 font-extrabold tracking-tight">TaskManager</span>
            </Link>

            <div className="hidden md:flex items-center gap-1">
              <NavLink to="/projects" className={navLinkClasses}>
                <FolderKanban className="w-4 h-4" />
                <span>Projects</span>
              </NavLink>

              <NavLink to="/tasks" className={navLinkClasses}>
                <CheckSquare className="w-4 h-4" />
                <span>My Tasks</span>
              </NavLink>

              {/* Admin navigation link ONLY visible if isAdmin */}
              {isAdmin && (
                <NavLink to="/admin" className={navLinkClasses}>
                  <ShieldCheck className="w-4 h-4 text-purple-600" />
                  <span className="text-purple-700">Admin Panel</span>
                </NavLink>
              )}
            </div>
          </div>

          {/* Right: User Profile & Logout */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-600">
                <UserIcon className="w-4 h-4" />
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-sm font-semibold text-gray-800 leading-tight">
                  {currentUser?.username}
                </div>
                <div className="text-xs text-gray-500 flex items-center gap-1">
                  <span
                    className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold uppercase tracking-wider ${
                      isAdmin ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {currentUser?.role}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 hover:text-red-600 hover:border-red-300 transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};
