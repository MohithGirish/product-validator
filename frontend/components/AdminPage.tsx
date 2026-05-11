
import React, { useEffect, useState } from 'react';
import { databaseService } from '../services/databaseService';
import { User, ValidationRecord } from '../types';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { XCircleIcon } from './icons/XCircleIcon';
import { downloadDataAsCSV } from '../utils/exportUtils';
import { DownloadIcon } from './icons/DownloadIcon';

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
            <div className="flex justify-center items-center h-64">
                <div className="text-center text-gray-500">
                    <svg className="mx-auto h-12 w-12 animate-spin text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="mt-4 text-lg font-semibold">Loading Admin Log...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto">
            <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Administrator Log</h1>
                    <p className="mt-2 text-gray-500">A complete log of all validation activities across all users.</p>
                </div>
                <button
                    onClick={handleDownloadLog}
                    className="mt-4 sm:mt-0 flex items-center justify-center bg-green-600 text-white px-4 py-2.5 rounded-lg font-semibold shadow-md hover:bg-green-700 transition cursor-pointer"
                >
                    <DownloadIcon className="w-5 h-5 mr-2" /> Export Log to Excel
                </button>
            </div>

            {history.length === 0 ? (
                <div className="text-center mt-10 bg-white p-10 rounded-xl shadow-lg">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    </svg>
                    <h3 className="mt-4 text-lg font-medium text-gray-900">No Validation Records Found</h3>
                    <p className="mt-1 text-sm text-gray-500">No user has performed a validation yet.</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-500">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3">Status</th>
                                    <th scope="col" className="px-6 py-3">User</th>
                                    <th scope="col" className="px-6 py-3">Timestamp</th>
                                    <th scope="col" className="px-6 py-3">Product Name</th>
                                    <th scope="col" className="px-6 py-3">Batch Number</th>
                                    <th scope="col" className="px-6 py-3">Barcode</th>
                                    <th scope="col" className="px-6 py-3">Dates (Prod/Exp)</th>
                                    <th scope="col" className="px-6 py-3">Price (MRP)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map((record) => (
                                    <tr key={record.id} className="bg-white border-b hover:bg-gray-50">
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${record.isValid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {record.isValid ? 'Valid' : 'Invalid'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-medium text-gray-900">{users.get(record.userId) || 'Unknown'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">{new Date(record.timestamp).toLocaleDateString()} <span className="text-xs text-gray-400">{new Date(record.timestamp).toLocaleTimeString()}</span></td>
                                        <td className="px-6 py-4">{record.productName || 'N/A'}</td>
                                        <td className="px-6 py-4 font-mono">{record.extractedBatch || 'N/A'}</td>
                                        <td className="px-6 py-4 font-mono text-gray-900">{record.extractedBarcode || 'N/A'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-xs font-mono"><span className="text-gray-400 mr-1">P:</span>{record.extractedProductionDate || '-'}</span>
                                                <span className="text-xs font-mono"><span className="text-gray-400 mr-1">E:</span>{record.extractedExpiryDate || '-'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-mono">{record.extractedPrice || 'N/A'}</td>
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
