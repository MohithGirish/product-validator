
import React, { useEffect, useState } from 'react';
import { databaseService } from '../services/databaseService';
import { User, ValidationRecord } from '../types';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { XCircleIcon } from './icons/XCircleIcon';
import { downloadDataAsCSV } from '../utils/exportUtils';
import { DownloadIcon } from './icons/DownloadIcon';
import Spinner from './common/Spinner';

const AdminPage: React.FC = () => {
    const [history, setHistory] = useState<ValidationRecord[]>([]);
    const [users, setUsers] = useState<Map<string, string>>(new Map());
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [historyData, usersData] = await Promise.all([
                    databaseService.getHistory(),
                    databaseService.getUsers()
                ]);

                const userMap = new Map(usersData.map(user => [user.id, user.username]));
                setUsers(userMap);
                setHistory(historyData);
            } catch (error) {
                console.error("Failed to fetch admin data:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, []);

    const handleDownloadLog = () => {
        // Prepare data for export: Add username and filter out image URLs
        const exportData = history.map(record => ({
            ...record,
            username: users.get(record.userId) || 'Unknown',
            // Explicitly exclude image data from the Excel/CSV file
            barcodeImageUrl: undefined,
            batchImageUrl: undefined
        }));

        // Use utility to download, explicitly excluding keys if undefined doesn't catch them all (extra safety)
        downloadDataAsCSV(exportData, 'validation_history_log', ['barcodeImageUrl', 'batchImageUrl']);
    };

    if (isLoading) {
        return (
            <div className="max-w-7xl mx-auto">
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-6 py-16 flex flex-col items-center justify-center">
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
            {/* Header */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-6 py-5">
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
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-6 py-16 text-center">
                    <div className="h-14 w-14 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                        <svg className="h-7 w-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                        </svg>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-800">No validation records yet</h3>
                    <p className="text-sm text-slate-400 mt-1">When users perform validations, they will appear here.</p>
                </div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
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
                                        <td className="px-5 py-3.5 font-semibold text-slate-900 whitespace-nowrap">{users.get(record.userId) || 'Unknown'}</td>
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
            )}
        </div>
    );
};

export default AdminPage;
