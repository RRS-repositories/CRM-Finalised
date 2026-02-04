import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useCRM } from '../context/CRMContext';

const Settings: React.FC = () => {
    const { theme, toggleTheme } = useCRM();

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
            </div>
        </div>
    );
};

export default Settings;
