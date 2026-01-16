
import React from 'react';
import { Moon, Sun, LogOut, ClipboardList } from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { ViewState } from '../types';

const Settings: React.FC = () => {
  const { theme, toggleTheme, logout, setCurrentView } = useCRM();

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 p-6">
      <h1 className="text-2xl font-bold text-navy-900 dark:text-white mb-6">Settings</h1>

      <div className="max-w-2xl space-y-6">
        {/* Theme Section */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="p-6">
            <h3 className="text-lg font-bold text-navy-900 dark:text-white mb-4">Theme</h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${theme === 'light' ? 'bg-amber-100 text-amber-600' : 'bg-slate-700 text-slate-400'}`}>
                  <Sun size={20} />
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Light Mode</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Default appearance</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                  <Moon size={20} />
                </div>
                <div className="flex flex-col items-end">
                  <p className="font-medium text-gray-900 dark:text-white">Dark Mode</p>
                  <label className="relative inline-flex items-center cursor-pointer mt-1">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={theme === 'dark'}
                      onChange={toggleTheme}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Client Intake Section */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="p-6">
            <h3 className="text-lg font-bold text-navy-900 dark:text-white mb-4">External Tools</h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                  <ClipboardList size={20} />
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Client Intake Form</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Open the public-facing intake flow</p>
                </div>
              </div>
              <button
                onClick={() => setCurrentView(ViewState.CLIENT_INTAKE)}
                className="bg-navy-900 hover:bg-navy-800 text-white dark:bg-blue-600 dark:hover:bg-blue-500 font-bold py-2 px-6 rounded-lg transition-colors border-none shadow-sm"
              >
                Open Form
              </button>
            </div>
          </div>
        </div>

        {/* Sign Out Section - Always Last */}
        <div className="pt-6 mt-6 border-t border-gray-200 dark:border-slate-700">
          <button
            onClick={logout}
            className="w-full bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors border border-red-200 dark:border-red-900"
          >
            <LogOut size={18} /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
