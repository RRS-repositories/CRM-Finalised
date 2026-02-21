
import React, { useState, useEffect } from 'react';
import { useCRM } from '../context/CRMContext';
import { Shield, Key, Users, Copy, Eye, EyeOff, Edit, Check, X, AlertTriangle, Trash2, LifeBuoy, CheckCircle, Clock, ExternalLink } from 'lucide-react';
import { Role, User } from '../types';

// Strict Hierarchy: Management > IT > Payments > Admin > Sales
const ROLE_HIERARCHY: Role[] = ['Management', 'IT', 'Payments', 'Admin', 'Sales'];

const AdminPanel: React.FC = () => {
  const { users, updateUserRole, updateUserStatus, deleteUser, currentUser, tickets, fetchTickets, resolveTicket, addNotification } = useCRM();
  const [activeTab, setActiveTab] = useState<'users' | 'api-keys' | 'tickets'>('users');
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});

  // Edit State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | ''>('');
  const [showRoleModal, setShowRoleModal] = useState(false);

  // Confirmation State
  const [confirmAction, setConfirmAction] = useState<{
    type: 'approve' | 'role_change';
    userId: string;
    newValue?: any;
    message: string;
  } | null>(null);

  // Delete State
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2 | 3>(1);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Fetch tickets when tab is active
  useEffect(() => {
    if (activeTab === 'tickets') {
      fetchTickets();
    }
  }, [activeTab, fetchTickets]);

  // Ensure current user is Management
  if (currentUser?.role !== 'Management') {
    return (
      <div className="flex items-center justify-center h-full text-red-500 font-bold dark:bg-slate-900">
        Access Denied. Management privileges required.
      </div>
    );
  }

  const toggleKey = (key: string) => {
    setShowKey(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const copyToClipboard = (text: string | undefined) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  // --- Handlers ---

  const initiateRoleEdit = (user: User) => {
    // Only allow editing if the user is not the main system admin (Management)
    if (user.email === 'info@fastactionclaims.co.uk') return;

    setEditingUser(user);
    setSelectedRole(user.role);
    setShowRoleModal(true);
  };

  const confirmRoleChange = () => {
    if (!editingUser || !selectedRole) return;

    setConfirmAction({
      type: 'role_change',
      userId: editingUser.id,
      newValue: selectedRole,
      message: `Are you sure you want to change ${editingUser.fullName}'s role to ${selectedRole}?`
    });
    setShowRoleModal(false);
  };

  const handleStatusToggle = (user: User, value: boolean) => {
    // Logic: If turning OFF approved -> Require Confirmation
    const requiresConfirm = !value;

    if (requiresConfirm) {
      setConfirmAction({
        type: 'approve',
        userId: user.id,
        newValue: value,
        message: `Are you sure you want to revoke approval for ${user.fullName}? They will strictly be unable to log in.`
      });
    } else {
      // Safe action (Approving) happens immediately
      updateUserStatus(user.id, { isApproved: value });
    }
  };

  const executeConfirmAction = () => {
    if (!confirmAction) return;

    if (confirmAction.type === 'role_change') {
      updateUserRole(confirmAction.userId, confirmAction.newValue);
    } else if (confirmAction.type === 'approve') {
      updateUserStatus(confirmAction.userId, { isApproved: confirmAction.newValue });
    }

    setConfirmAction(null);
    setEditingUser(null);
  };

  const initiateDelete = (user: User) => {
    if (user.email === 'info@fastactionclaims.co.uk') return;
    setUserToDelete(user);
    setDeleteStep(1);
    setDeleteConfirmText('');
  };

  const cancelDelete = () => {
    setUserToDelete(null);
    setDeleteStep(1);
    setDeleteConfirmText('');
  };

  const handleDeleteStep = async () => {
    if (deleteStep === 1) {
      setDeleteStep(2);
    } else if (deleteStep === 2) {
      setDeleteStep(3);
    } else if (deleteStep === 3 && deleteConfirmText === 'DELETE' && userToDelete) {
      await deleteUser(userToDelete.id);
      cancelDelete();
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 p-6 relative transition-colors">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 dark:text-white flex items-center gap-2">
            <Shield className="text-brand-orange" />
            Management Panel
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage system access, role hierarchy, and secure credentials.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200 dark:border-slate-700 mb-6">
        <button
          onClick={() => setActiveTab('users')}
          className={`pb-3 px-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'users' ? 'border-brand-orange text-navy-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-navy-700 dark:hover:text-gray-200'}`}
        >
          <Users size={16} /> User Authorization
        </button>
        <button
          onClick={() => setActiveTab('api-keys')}
          className={`pb-3 px-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'api-keys' ? 'border-brand-orange text-navy-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-navy-700 dark:hover:text-gray-200'}`}
        >
          <Key size={16} /> API Credentials
        </button>
        <button
          onClick={() => setActiveTab('tickets')}
          className={`pb-3 px-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'tickets' ? 'border-brand-orange text-navy-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-navy-700 dark:hover:text-gray-200'}`}
        >
          <LifeBuoy size={16} /> Support Tickets
          {tickets.filter(t => t.status === 'open').length > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {tickets.filter(t => t.status === 'open').length}
            </span>
          )}
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 flex-1 overflow-hidden">

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-300px)]">
            <table className="w-full text-left">
              <thead className="bg-gray-50 dark:bg-slate-700 border-b border-gray-100 dark:border-slate-600">
                <tr>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">User</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">Role</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase text-center">Login Approval</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase text-right">Edit Role</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase text-right">Delete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                    <td className="px-6 py-4">
                      <div className="font-medium text-navy-900 dark:text-white">{user.fullName}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
                      {user.id === currentUser.id && <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded mt-1 inline-block">You</span>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border capitalize ${user.role === 'Management' ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-100 dark:border-purple-800' : 'bg-gray-50 dark:bg-slate-700 text-gray-700 dark:text-gray-300 border-gray-100 dark:border-slate-600'
                        }`}>
                        {user.role}
                      </span>
                    </td>
                    {/* Approval Toggle */}
                    <td className="px-6 py-4 text-center">
                      {user.id !== currentUser.id && (
                        <button
                          onClick={() => handleStatusToggle(user, !user.isApproved)}
                          className={`w-10 h-5 rounded-full relative transition-colors duration-200 ease-in-out ${user.isApproved ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'}`}
                          title={user.isApproved ? "User can login" : "User cannot login"}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${user.isApproved ? 'translate-x-5' : 'translate-x-0'}`}></span>
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {user.id !== currentUser.id && (
                        <button
                          onClick={() => initiateRoleEdit(user)}
                          className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-600 rounded text-gray-500 dark:text-gray-400 hover:text-navy-700 dark:hover:text-white"
                          title="Edit Role"
                        >
                          <Edit size={16} />
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {user.id !== currentUser.id && user.email !== 'info@fastactionclaims.co.uk' && (
                        <button
                          onClick={() => initiateDelete(user)}
                          className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          title="Delete User"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* API Keys Tab */}
        {activeTab === 'api-keys' && (
          <div className="p-8">
            <h3 className="text-lg font-bold text-navy-900 dark:text-white mb-4">Environment Credentials</h3>
            <div className="space-y-4 max-w-3xl">
              {['gemini'].map((keyType) => {
                let label = '';
                let desc = '';
                let val = '';

                if (keyType === 'gemini') { label = 'Google Gemini API'; desc = 'AI Assistant & Content Gen'; val = process.env.API_KEY || ''; }

                return (
                  <div key={keyType} className="border border-gray-200 dark:border-slate-700 rounded-lg p-4 bg-gray-50 dark:bg-slate-700">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-bold text-gray-800 dark:text-white text-sm">{label}</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{desc}</p>
                      </div>
                      <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-bold px-2 py-1 rounded">ACTIVE</span>
                    </div>
                    <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded p-2 mt-2">
                      <code className="text-sm font-mono text-gray-600 dark:text-gray-300 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                        {showKey[keyType] ? val : '••••••••••••••••••••••••••••••••••••••••'}
                      </code>
                      <button onClick={() => toggleKey(keyType)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded text-gray-500 dark:text-gray-400" title={showKey[keyType] ? "Hide" : "Show"}>
                        {showKey[keyType] ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <button onClick={() => copyToClipboard(val)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded text-gray-500 dark:text-gray-400" title="Copy">
                        <Copy size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tickets Tab */}
        {activeTab === 'tickets' && (
          <div className="overflow-y-auto max-h-[calc(100vh-300px)]">
            {tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
                <LifeBuoy size={48} className="mb-3 opacity-50" />
                <p className="text-lg font-medium">No support tickets</p>
                <p className="text-sm">All clear! No tickets have been raised.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-700">
                {tickets.map(ticket => (
                  <div key={ticket.id} className="p-5 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {ticket.status === 'open' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800">
                              <Clock size={10} /> OPEN
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">
                              <CheckCircle size={10} /> RESOLVED
                            </span>
                          )}
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            #{ticket.id}
                          </span>
                        </div>
                        <h4 className="font-semibold text-gray-900 dark:text-white text-sm">{ticket.title}</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">{ticket.description}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 dark:text-gray-500">
                          <span>By: <strong className="text-gray-600 dark:text-gray-300">{ticket.userName}</strong></span>
                          <span>{new Date(ticket.createdAt).toLocaleString()}</span>
                          {ticket.resolvedByName && (
                            <span>Resolved by: <strong className="text-green-600 dark:text-green-400">{ticket.resolvedByName}</strong></span>
                          )}
                        </div>
                        {ticket.screenshotUrl && (
                          <a
                            href={ticket.screenshotUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            <ExternalLink size={12} /> View Screenshot
                          </a>
                        )}
                      </div>
                      {ticket.status === 'open' && (
                        <button
                          onClick={async () => {
                            const result = await resolveTicket(ticket.id);
                            if (result.success) {
                              addNotification('success', `Ticket #${ticket.id} resolved`);
                            } else {
                              addNotification('error', result.message);
                            }
                          }}
                          className="shrink-0 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Check size={14} /> Resolve
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Role Selection Modal */}
      {showRoleModal && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg max-w-sm w-full p-6">
            <h3 className="font-bold text-lg mb-2 text-navy-900 dark:text-white">Edit Role</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Select authority level for {editingUser.fullName}</p>

            <div className="space-y-2 mb-6">
              {ROLE_HIERARCHY.map((role, index) => (
                <label key={role} className={`flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition-colors ${selectedRole === role ? 'bg-orange-50 dark:bg-orange-900/20 border-brand-orange' : 'hover:bg-slate-50 dark:hover:bg-slate-700 border-gray-200 dark:border-slate-700'}`}>
                  <input
                    type="radio"
                    name="role"
                    value={role}
                    checked={selectedRole === role}
                    onChange={(e) => setSelectedRole(e.target.value as Role)}
                    className="text-brand-orange focus:ring-brand-orange"
                  />
                  <div className="flex-1 flex justify-between items-center">
                    <span className="font-medium text-sm text-gray-700 dark:text-gray-300">{role}</span>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowRoleModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">Cancel</button>
              <button onClick={confirmRoleChange} className="px-4 py-2 text-sm bg-navy-700 hover:bg-navy-800 text-white rounded-lg font-medium">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg max-w-sm w-full p-6 text-center">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="text-red-600 dark:text-red-400" size={24} />
            </div>
            <h3 className="font-bold text-lg mb-2 text-navy-900 dark:text-white">Please Confirm</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">{confirmAction.message}</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setConfirmAction(null)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-700">Cancel</button>
              <button onClick={executeConfirmAction} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">Yes, Proceed</button>
            </div>
          </div>
        </div>
      )}

      {/* 3-Step Delete Verification Modal */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg max-w-sm w-full p-6 text-center">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="text-red-600 dark:text-red-400" size={24} />
            </div>

            {/* Step indicator */}
            <div className="flex items-center justify-center gap-1.5 mb-4">
              {[1, 2, 3].map(step => (
                <div
                  key={step}
                  className={`w-2 h-2 rounded-full transition-colors ${step <= deleteStep ? 'bg-red-500' : 'bg-gray-300 dark:bg-slate-600'}`}
                />
              ))}
              <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-2">Step {deleteStep} of 3</span>
            </div>

            {/* Step 1 */}
            {deleteStep === 1 && (
              <>
                <h3 className="font-bold text-lg mb-2 text-navy-900 dark:text-white">Delete User?</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                  Do you want to delete <strong>{userToDelete.fullName}</strong> ({userToDelete.email})?
                </p>
                <div className="flex justify-center gap-3">
                  <button onClick={cancelDelete} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-700">Cancel</button>
                  <button onClick={handleDeleteStep} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">Yes, Delete</button>
                </div>
              </>
            )}

            {/* Step 2 */}
            {deleteStep === 2 && (
              <>
                <h3 className="font-bold text-lg mb-2 text-navy-900 dark:text-white">Are You Sure?</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                  Are you sure you want to delete <strong>{userToDelete.fullName}</strong>? This action cannot be undone and all data associated with this user will be permanently removed.
                </p>
                <div className="flex justify-center gap-3">
                  <button onClick={cancelDelete} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-700">Cancel</button>
                  <button onClick={handleDeleteStep} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">Yes, I'm Sure</button>
                </div>
              </>
            )}

            {/* Step 3 */}
            {deleteStep === 3 && (
              <>
                <h3 className="font-bold text-lg mb-2 text-navy-900 dark:text-white">Final Confirmation</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  This will permanently delete <strong>{userToDelete.fullName}</strong>. Type <span className="font-mono font-bold text-red-600">DELETE</span> below to confirm.
                </p>
                <div className="mb-6">
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-center font-mono bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    placeholder="Type DELETE to confirm"
                    autoFocus
                  />
                </div>
                <div className="flex justify-center gap-3">
                  <button onClick={cancelDelete} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-700">Cancel</button>
                  <button
                    onClick={handleDeleteStep}
                    disabled={deleteConfirmText !== 'DELETE'}
                    className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${deleteConfirmText === 'DELETE' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-200 dark:bg-slate-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'}`}
                  >
                    Permanently Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminPanel;
