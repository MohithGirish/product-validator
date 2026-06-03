
import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { databaseService } from '../services/databaseService';
import { User, ValidationRecord } from '../types';
import { downloadDataAsCSV } from '../utils/exportUtils';
import { DownloadIcon } from './icons/DownloadIcon';
import { PlusIcon } from './icons/PlusIcon';
import { TrashIcon } from './icons/TrashIcon';
import { EyeIcon, EyeOffIcon } from './icons/EyeIcon';
import Spinner from './common/Spinner';
import Modal from './common/Modal';
import ConfirmDialog from './common/ConfirmDialog';
import { useToast } from './common/Toast';

const AdminPage: React.FC = () => {
    const { user: currentUser } = useAuth();
    const { showToast } = useToast();
    const [history, setHistory] = useState<ValidationRecord[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const adminCount = users.filter(u => u.role === 'admin').length;
    const staffCount = users.filter(u => u.role === 'staff').length;

    const usernameById = (id: string) => users.find(u => u.id === id)?.username || 'Unknown';

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [historyData, usersData] = await Promise.all([
                databaseService.getHistory(),
                databaseService.getUsers()
            ]);
            // Stable order (mirrors backend): protected admin, other admins, staff;
            // then natural sort by username (User2 before User10), regardless of source order.
            const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
            const rank = (u: User) => (u.isProtected ? 0 : u.role === 'admin' ? 1 : 2);
            const sortedUsers = [...usersData].sort(
                (a, b) => rank(a) - rank(b) || collator.compare(a.username, b.username)
            );
            setUsers(sortedUsers);
            setHistory(historyData);
        } catch (error) {
            console.error("Failed to fetch admin data:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // ── User management state ───────────────────────────────────────────────
    const [isAddUserOpen, setIsAddUserOpen] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState<'admin' | 'staff'>('staff');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [usernameTaken, setUsernameTaken] = useState(false);
    const [isAddingUser, setIsAddingUser] = useState(false);
    const [userToRemove, setUserToRemove] = useState<User | null>(null);

    // Live password rules (mirror of the backend policy).
    const pwRules = [
        { key: 'len', label: 'At least 6 characters', ok: newPassword.length >= 6 },
        { key: 'letter', label: 'Contains a letter (a–z, A–Z)', ok: /[A-Za-z]/.test(newPassword) },
        { key: 'special', label: 'Contains a special character (e.g. @ & * !)', ok: /[^A-Za-z0-9]/.test(newPassword) },
    ];
    const isPasswordValid = pwRules.every(r => r.ok);
    const trimmedUsername = newUsername.trim();
    const canSubmitUser = trimmedUsername.length > 0 && isPasswordValid && !usernameTaken;

    const openAddUser = () => {
        setNewUsername(''); setNewPassword(''); setNewRole('staff');
        setShowNewPassword(false); setUsernameTaken(false);
        setIsAddUserOpen(true);
    };

    // Flag duplicate usernames live (case-insensitive) for inline feedback.
    useEffect(() => {
        const exists = users.some(u => u.username.toLowerCase() === trimmedUsername.toLowerCase());
        setUsernameTaken(trimmedUsername.length > 0 && exists);
    }, [trimmedUsername, users]);

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmitUser) return;
        setIsAddingUser(true);
        try {
            await databaseService.addUser({ username: trimmedUsername, password: newPassword, role: newRole });
            setIsAddUserOpen(false);
            await fetchData();
            showToast(`${trimmedUsername} added as ${newRole}`, 'success');
        } catch (err: any) {
            showToast(err.message || 'Failed to add user.', 'error');
        } finally {
            setIsAddingUser(false);
        }
    };

    const confirmRemoveUser = async () => {
        const target = userToRemove;
        setUserToRemove(null);
        if (!target || target.id === currentUser?.id) return;
        try {
            await databaseService.deleteUser(target.id);
            await fetchData();
            showToast(`${target.username} removed`, 'success');
        } catch (err: any) {
            showToast(err.message || 'Failed to remove user.', 'error');
        }
    };

    const handleDownloadLog = () => {
        // Prepare data for export: Add username and filter out image URLs
        const exportData = history.map(record => ({
            ...record,
            username: usernameById(record.userId),
            // Explicitly exclude image data from the Excel/CSV file
            barcodeImageUrl: undefined,
            batchImageUrl: undefined
        }));

        // Use utility to download, explicitly excluding keys if undefined doesn't catch them all (extra safety)
        downloadDataAsCSV(exportData, 'validation_history_log', ['barcodeImageUrl', 'batchImageUrl']);
        showToast('Audit log exported', 'success');
    };

    if (isLoading) {
        return (
            <div className="max-w-7xl mx-auto">
                <div className="bg-white border border-slate-200/70 rounded-xl shadow-card px-6 py-16 flex flex-col items-center justify-center">
                    <div className="flex items-center justify-center text-blue-600">
                        <Spinner />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-700">Loading admin log…</p>
                    <p className="mt-1 text-xs text-slate-400">Fetching validation activity across all users.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {/* ── User Management ─────────────────────────────────────────── */}
            <div className="bg-white border border-slate-200/70 rounded-xl shadow-card overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">User Management</h1>
                        <p className="mt-1 text-sm text-slate-500">Add or remove people who can sign in to the validator.</p>
                    </div>
                    <button
                        onClick={openAddUser}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition-all shadow-sm flex-shrink-0"
                    >
                        <PlusIcon className="w-4 h-4" /> Add User
                    </button>
                </div>

                {/* User list */}
                <ul className="divide-y divide-slate-100">
                    {users.map(u => {
                        const isSelf = u.id === currentUser?.id;
                        const isProtectedAdmin = Boolean(u.isProtected);
                        const isLastStaff = u.role === 'staff' && staffCount <= 1;
                        const isLastAdmin = u.role === 'admin' && adminCount <= 1;
                        const blockReason =
                            isSelf ? 'You cannot remove your own account' :
                            isProtectedAdmin ? 'The original administrator cannot be removed' :
                            isLastStaff ? 'At least one staff user must remain' :
                            isLastAdmin ? 'At least one administrator must remain' :
                            null;
                        const isLocked = Boolean(blockReason);
                        return (
                            <li key={u.id} className="flex items-center justify-between gap-3 px-6 py-3.5 hover:bg-slate-50 transition-colors">
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                                        u.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                                    }`}>
                                        {u.username.charAt(0).toUpperCase()}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-900 truncate">
                                            {u.username}
                                            {isSelf && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">You</span>}
                                        </p>
                                        <span className={`inline-block mt-0.5 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                                            u.role === 'admin' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-500 border border-slate-200'
                                        }`}>
                                            {u.role}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setUserToRemove(u)}
                                    disabled={isLocked}
                                    title={blockReason || `Remove ${u.username}`}
                                    className="h-9 w-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                    aria-label={blockReason ? `${u.username} — ${blockReason}` : `Remove user ${u.username}`}
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </li>
                        );
                    })}
                    {users.length === 0 && (
                        <li className="px-6 py-8 text-center text-sm text-slate-400">No users found.</li>
                    )}
                </ul>
            </div>

            {/* Header */}
            <div className="bg-white border border-slate-200/70 rounded-xl shadow-card px-6 py-5">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Administrator Log</h1>
                        <p className="mt-1 text-sm text-slate-500">A complete audit trail of all validation activity across users.</p>
                    </div>
                    {history.length > 0 && (
                        <button
                            onClick={handleDownloadLog}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
                        >
                            <DownloadIcon className="w-4 h-4" /> Export Log
                        </button>
                    )}
                </div>
                {history.length > 0 && (
                    <div className="mt-4 flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            <span className="text-slate-500">
                                <span className="font-semibold text-slate-700">{history.filter(r => r.isValid).length}</span> valid
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-red-500" />
                            <span className="text-slate-500">
                                <span className="font-semibold text-slate-700">{history.filter(r => !r.isValid).length}</span> invalid
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-slate-300" />
                            <span className="text-slate-500">
                                <span className="font-semibold text-slate-700">{history.length}</span> total
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {history.length === 0 ? (
                <div className="bg-white border border-slate-200/70 rounded-xl shadow-card px-6 py-16 text-center">
                    <div className="h-14 w-14 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                        <svg className="h-7 w-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                        </svg>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-800">No validation records yet</h3>
                    <p className="text-sm text-slate-400 mt-1">When users perform validations, they will appear here.</p>
                </div>
            ) : (
                <>
                    {/* ── Mobile: card list ── */}
                    <div className="md:hidden space-y-3">
                        {history.map((record) => (
                            <div key={record.id} className={`bg-white rounded-xl border border-slate-200/70 shadow-card p-4 border-l-4 ${record.isValid ? 'border-l-emerald-500' : 'border-l-red-400'}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${
                                        record.isValid
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : 'bg-red-50 text-red-700 border border-red-200'
                                    }`}>
                                        <span className={`h-1.5 w-1.5 rounded-full ${record.isValid ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                        {record.isValid ? 'Valid' : 'Invalid'}
                                    </span>
                                    <span className="text-[11px] text-slate-400 text-right whitespace-nowrap">{new Date(record.timestamp).toLocaleString()}</span>
                                </div>
                                {record.productName && (
                                    <p className="mt-2 text-sm font-bold text-slate-900 leading-snug">{record.productName}</p>
                                )}
                                <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2">
                                    <div className="flex flex-col">
                                        <dt className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">User</dt>
                                        <dd className="text-xs font-semibold text-slate-700 truncate">{usernameById(record.userId)}</dd>
                                    </div>
                                    <div className="flex flex-col">
                                        <dt className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">MRP</dt>
                                        <dd className="text-xs font-mono text-slate-700">{record.extractedPrice || '—'}</dd>
                                    </div>
                                    <div className="flex flex-col">
                                        <dt className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Batch</dt>
                                        <dd className="text-xs font-mono text-slate-700 break-all">{record.extractedBatch || '—'}</dd>
                                    </div>
                                    <div className="flex flex-col">
                                        <dt className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Barcode</dt>
                                        <dd className="text-xs font-mono text-slate-700 break-all">{record.extractedBarcode || '—'}</dd>
                                    </div>
                                    <div className="flex flex-col">
                                        <dt className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Prod. Date</dt>
                                        <dd className="text-xs font-mono text-slate-700">{record.extractedProductionDate || '—'}</dd>
                                    </div>
                                    <div className="flex flex-col">
                                        <dt className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Exp. Date</dt>
                                        <dd className="text-xs font-mono text-slate-700">{record.extractedExpiryDate || '—'}</dd>
                                    </div>
                                </dl>
                            </div>
                        ))}
                    </div>

                    {/* ── Desktop / tablet: full table ── */}
                    <div className="hidden md:block bg-white border border-slate-200/70 rounded-xl shadow-card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                                        <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">User</th>
                                        <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Timestamp</th>
                                        <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Product</th>
                                        <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Batch</th>
                                        <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Barcode</th>
                                        <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Prod / Exp</th>
                                        <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">MRP</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {history.map((record) => (
                                        <tr key={record.id} className="bg-white hover:bg-slate-50 transition-colors">
                                            <td className="px-5 py-3.5">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${
                                                    record.isValid
                                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                      : 'bg-red-50 text-red-700 border border-red-200'
                                                }`}>
                                                    <span className={`h-1.5 w-1.5 rounded-full ${record.isValid ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                                    {record.isValid ? 'Valid' : 'Invalid'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5 font-semibold text-slate-900 whitespace-nowrap">{usernameById(record.userId)}</td>
                                            <td className="px-5 py-3.5 whitespace-nowrap text-slate-600">
                                                <div className="flex flex-col leading-tight">
                                                    <span className="text-xs font-medium text-slate-700">{new Date(record.timestamp).toLocaleDateString()}</span>
                                                    <span className="text-[11px] text-slate-400">{new Date(record.timestamp).toLocaleTimeString()}</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5 text-slate-700">{record.productName || <span className="text-slate-400">—</span>}</td>
                                            <td className="px-5 py-3.5">
                                                {record.extractedBatch
                                                    ? <span className="font-mono text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded">{record.extractedBatch}</span>
                                                    : <span className="text-slate-400">—</span>}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                {record.extractedBarcode
                                                    ? <span className="font-mono text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded">{record.extractedBarcode}</span>
                                                    : <span className="text-slate-400">—</span>}
                                            </td>
                                            <td className="px-5 py-3.5 whitespace-nowrap">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-xs font-mono text-slate-700"><span className="text-slate-400 mr-1">P:</span>{record.extractedProductionDate || '—'}</span>
                                                    <span className="text-xs font-mono text-slate-700"><span className="text-slate-400 mr-1">E:</span>{record.extractedExpiryDate || '—'}</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5 font-mono text-xs text-slate-700">{record.extractedPrice || <span className="text-slate-400 font-sans">—</span>}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* ── Add User modal ─────────────────────────────────────────── */}
            <Modal
                isOpen={isAddUserOpen}
                onClose={() => setIsAddUserOpen(false)}
                title="Add New User"
                subtitle="Create a sign-in account for the validator."
                icon={<PlusIcon className="w-5 h-5 text-white" />}
                footer={
                    <>
                        <button
                            type="button"
                            onClick={() => setIsAddUserOpen(false)}
                            className="bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm px-4 py-2.5 rounded-lg border border-slate-200 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            form="add-user-form"
                            disabled={isAddingUser || !canSubmitUser}
                            className="press flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-4 py-2.5 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isAddingUser ? <Spinner /> : <PlusIcon className="w-4 h-4" />} Add User
                        </button>
                    </>
                }
            >
                <form id="add-user-form" onSubmit={handleAddUser} className="space-y-4">
                    {/* Username */}
                    <div>
                        <label htmlFor="new-username" className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Username</label>
                        <input
                            id="new-username"
                            value={newUsername}
                            onChange={e => setNewUsername(e.target.value)}
                            placeholder="e.g., User5"
                            autoComplete="off"
                            autoFocus
                            className={`w-full px-3 py-2.5 bg-white text-sm text-slate-900 placeholder-slate-400 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition ${
                                usernameTaken ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-blue-500'
                            }`}
                        />
                        {usernameTaken && (
                            <p className="mt-1.5 text-xs text-red-600 font-medium">That username is already taken.</p>
                        )}
                    </div>

                    {/* Password */}
                    <div>
                        <label htmlFor="new-password" className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Password</label>
                        <div className="relative">
                            <input
                                id="new-password"
                                type={showNewPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                placeholder="Create a password"
                                autoComplete="new-password"
                                className="w-full px-3 py-2.5 pr-11 bg-white text-sm text-slate-900 placeholder-slate-400 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                            />
                            <button
                                type="button"
                                onClick={() => setShowNewPassword(v => !v)}
                                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 transition"
                                aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                            >
                                {showNewPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                            </button>
                        </div>

                        {/* Live password-rule checklist */}
                        <ul className="mt-2.5 space-y-1.5 rounded-lg bg-slate-50 border border-slate-100 p-3">
                            {pwRules.map(rule => (
                                <li key={rule.key} className="flex items-center gap-2 text-xs">
                                    <span className={`h-4 w-4 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                                        rule.ok ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'
                                    }`}>
                                        {rule.ok ? (
                                            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        ) : (
                                            <span className="h-1 w-1 rounded-full bg-slate-400" />
                                        )}
                                    </span>
                                    <span className={rule.ok ? 'text-slate-700 font-medium' : 'text-slate-500'}>{rule.label}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Role */}
                    <div>
                        <label htmlFor="new-role" className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Role</label>
                        <div className="relative">
                            <select
                                id="new-role"
                                value={newRole}
                                onChange={e => setNewRole(e.target.value as 'admin' | 'staff')}
                                className="w-full px-3 py-2.5 bg-white border border-slate-200 text-sm text-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition appearance-none pr-8"
                            >
                                <option value="staff">Staff — can validate products and view their own history</option>
                                <option value="admin">Admin — full access, including user management</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                            </div>
                        </div>
                    </div>
                </form>
            </Modal>

            {/* ── Remove-user confirmation ───────────────────────────────── */}
            <ConfirmDialog
                isOpen={!!userToRemove}
                title="Remove user?"
                message={
                    <>Remove <span className="font-semibold text-slate-700">{userToRemove?.username}</span>? They will no longer be able to sign in. This cannot be undone.</>
                }
                confirmLabel="Remove User"
                variant="danger"
                onConfirm={confirmRemoveUser}
                onCancel={() => setUserToRemove(null)}
            />
        </div>
    );
};

export default AdminPage;
