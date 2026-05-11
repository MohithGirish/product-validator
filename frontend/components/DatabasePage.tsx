
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { ProductData } from '../types';
import { databaseService } from '../services/databaseService';
import { extractProductInfoFromImage, extractBatchFormatFromImage } from '../services/imageExtractionService';
import { PlusIcon } from './icons/PlusIcon';
import { PencilIcon } from './icons/PencilIcon';
import { TrashIcon } from './icons/TrashIcon';
import { XIcon } from './icons/XIcon';
import { SearchIcon } from './icons/SearchIcon';
import CameraModal from './CameraModal';
import Spinner from './common/Spinner';
import { CameraIcon } from './icons/CameraIcon';
import { UploadIcon } from './icons/UploadIcon';
import { XCircleIcon } from './icons/XCircleIcon';
import { downloadDataAsCSV } from '../utils/exportUtils';
import { DocumentScannerIcon } from './icons/DocumentScannerIcon';
import { DownloadIcon } from './icons/DownloadIcon';


const initialFormData: Omit<ProductData, 'id'> = {
    productName: '',
    batchNumberFormat: '',
    barcode: '',
    marketType: 'general',
    mrpApplicable: false,
    mrp: null,
    shelfLife: null,
    shelfLifeUnit: 'days',
    batchInfoText: '',
};

export const ProductFormModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (product: ProductData) => void;
    product: ProductData | null;
    initialBarcode?: string;
    initialProductName?: string;
}> = ({ isOpen, onClose, onSave, product, initialBarcode, initialProductName }) => {
    const [formData, setFormData] = useState(initialFormData);
    const [step, setStep] = useState<'barcode' | 'details'>('details');
    
    // State for camera
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [cameraTarget, setCameraTarget] = useState<'barcode' | 'batchFormat' | null>(null);

    // State for barcode scanning step
    const [barcodeImageFile, setBarcodeImageFile] = useState<File | null>(null);
    const [barcodeImageUrl, setBarcodeImageUrl] = useState<string | null>(null);
    const barcodeFileInputRef = useRef<HTMLInputElement>(null);
    const [barcodeScanStatus, setBarcodeScanStatus] = useState<'idle' | 'loading' | 'error'>('idle');
    const [barcodeScanError, setBarcodeScanError] = useState<string | null>(null);
    
    // State for batch format inference
    const [batchFormatImageFile, setBatchFormatImageFile] = useState<File | null>(null);
    const [batchFormatImageUrl, setBatchFormatImageUrl] = useState<string | null>(null);
    const batchFileInputRef = useRef<HTMLInputElement>(null);
    const [batchScanStatus, setBatchScanStatus] = useState<'idle' | 'loading' | 'error'>('idle');
    const [batchScanError, setBatchScanError] = useState<string | null>(null);

    // State for interactive batch format editor
    const [activeEditorIndex, setActiveEditorIndex] = useState<number | null>(null);
    const editorRef = useRef<HTMLDivElement>(null);

    const toGeneralizedPattern = (value: string): string =>
        value
            .split('')
            .map((char) => {
                if (/\d/.test(char)) return '#';
                if (/[A-Za-z]/.test(char)) return '@';
                return char;
            })
            .join('');

    const generalizedBatchInfoBlock = (value: string): string =>
        value
            .split('\n')
            .map((line) => toGeneralizedPattern(line))
            .join('\n');

    const resetBarcodeStepState = useCallback(() => {
        setBarcodeImageFile(null);
        setBarcodeImageUrl(null);
        setBarcodeScanStatus('idle');
        setBarcodeScanError(null);
        if (barcodeFileInputRef.current) {
            barcodeFileInputRef.current.value = '';
        }
    }, []);

    const resetBatchStepState = useCallback(() => {
        setBatchFormatImageFile(null);
        setBatchFormatImageUrl(null);
        setBatchScanStatus('idle');
        setBatchScanError(null);
        if (batchFileInputRef.current) {
            batchFileInputRef.current.value = '';
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            resetBarcodeStepState();
            resetBatchStepState();

            if (product) { // Editing existing product
                setFormData({
                    productName: product.productName,
                    batchNumberFormat: product.batchNumberFormat,
                    barcode: product.barcode,
                    marketType: product.marketType,
                    mrpApplicable: product.mrpApplicable,
                    mrp: product.mrp,
                    shelfLife: product.shelfLife,
                    shelfLifeUnit: product.shelfLifeUnit,
                    batchInfoText: product.batchInfoText || '',
                });
                setStep('details');
            } else if (initialBarcode) { // Coming from Validator page
                setFormData({ ...initialFormData, barcode: initialBarcode, productName: initialProductName || '' });
                setStep('details');
            } else { // Adding a new product from scratch
                setFormData(initialFormData);
                setStep('barcode');
            }
        }
    }, [product, initialBarcode, initialProductName, isOpen, resetBarcodeStepState, resetBatchStepState]);

    // Click-away handler for batch format editor
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (editorRef.current && !editorRef.current.contains(event.target as Node)) {
                setActiveEditorIndex(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);


    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        
        if (type === 'checkbox' && e.target instanceof HTMLInputElement) {
            const checked = e.target.checked;
            setFormData(prev => ({ 
                ...prev, 
                [name]: checked,
                mrp: checked ? prev.mrp : null // Clear MRP if not applicable
            }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };
    
    const handleCameraCapture = async (file: File) => {
        setIsCameraOpen(false);
        if (!cameraTarget) return;

        if (cameraTarget === 'barcode') {
            setBarcodeImageFile(file);
            setBarcodeImageUrl(URL.createObjectURL(file));
        } else if (cameraTarget === 'batchFormat') {
            processBatchFormatFile(file);
            inferBatchFormat(file);
        }
    };

    // --- Barcode Step Logic ---
    const handleBarcodeFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
          if (file.size > 4 * 1024 * 1024) { // 4MB limit
            setBarcodeScanError('File size must be less than 4MB.');
            return;
          }
          setBarcodeScanError(null);
          setBarcodeImageFile(file);
          setBarcodeImageUrl(URL.createObjectURL(file));
        }
    };
    
    const handleBarcodeSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!barcodeImageFile) {
            setBarcodeScanError("Please select or capture an image of the barcode.");
            return;
        }
        setBarcodeScanStatus('loading');
        setBarcodeScanError(null);
        try {
            const result = await extractProductInfoFromImage(barcodeImageFile);
            if (!result.barcode) throw new Error("Could not detect a barcode from the image.");

            setFormData(prev => ({ ...prev, barcode: result.barcode, productName: result.productName }));
            setStep('details');
            resetBarcodeStepState();
        } catch (err: any) {
            setBarcodeScanError(err.message || "An error occurred during barcode validation.");
            setBarcodeScanStatus('error');
        } finally {
            setBarcodeScanStatus('idle');
        }
    };
    
    const calculateShelfLife = (prodStr: string | null, expStr: string | null): { shelfLife: number | null, shelfLifeUnit: 'days' | 'months' | null } => {
        if (!prodStr || !expStr) return { shelfLife: null, shelfLifeUnit: null };
        
        const prodDate = new Date(prodStr);
        const expDate = new Date(expStr);

        if (isNaN(prodDate.getTime()) || isNaN(expDate.getTime())) {
            return { shelfLife: null, shelfLifeUnit: null };
        }

        const prodUtc = Date.UTC(prodDate.getFullYear(), prodDate.getMonth(), prodDate.getDate());
        const expUtc = Date.UTC(expDate.getFullYear(), expDate.getMonth(), expDate.getDate());
        const diffDays = Math.max(0, Math.round((expUtc - prodUtc) / (1000 * 60 * 60 * 24)));

        return { shelfLife: diffDays, shelfLifeUnit: 'days' };
    };

    // --- Batch Format Step Logic ---
    const processBatchFormatFile = (file: File) => {
        if (file.size > 4 * 1024 * 1024) { // 4MB limit
            setBatchScanError('File size must be less than 4MB.');
            return;
        }
        setBatchScanError(null);
        setBatchFormatImageFile(file);
        setBatchFormatImageUrl(URL.createObjectURL(file));
    };

    const inferBatchFormat = async (file: File) => {
        setBatchScanStatus('loading');
        setBatchScanError(null);
        try {
            const details = await extractBatchFormatFromImage(file);
            if (!details.batchFormat && !details.batchInfoText) throw new Error("Could not determine batch format from the image.");
            
            const { shelfLife, shelfLifeUnit } = calculateShelfLife(details.productionDate, details.expiryDate);

            setFormData(prev => ({
                ...prev,
                batchNumberFormat: details.batchFormat,
                batchInfoText: details.batchInfoText,
                mrp: details.mrp ?? prev.mrp,
                shelfLife: shelfLife ?? prev.shelfLife,
                shelfLifeUnit: shelfLifeUnit ?? prev.shelfLifeUnit,
                mrpApplicable: details.mrp !== null ? true : prev.mrpApplicable,
            }));

        } catch (err: any) {
            setBatchScanError(err.message || "An error occurred during analysis.");
            setBatchScanStatus('error');
        } finally {
            setBatchScanStatus('idle');
        }
    };

    const handleBatchFormatFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        processBatchFormatFile(file);
        inferBatchFormat(file);
    };

    // --- Batch Format Editor Logic ---
    const handleFormatCharClick = (index: number) => {
        setActiveEditorIndex(index === activeEditorIndex ? null : index);
    };

    const handleFormatChange = (newChar: string) => {
        if (activeEditorIndex !== null) {
            setFormData(prev => {
                const formatChars = [...prev.batchNumberFormat];
                formatChars[activeEditorIndex] = newChar.toUpperCase();
                return { ...prev, batchNumberFormat: formatChars.join('') };
            });
            setActiveEditorIndex(null);
        }
    };


    // --- Main Form Submit ---
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const allProducts = await databaseService.getProducts();
        const duplicate = allProducts.find(p => 
            p.barcode === formData.barcode && 
            p.marketType === formData.marketType && 
            p.id !== product?.id // Don't check against self when editing
        );

        if (duplicate) {
            alert(`Error: A product with barcode "${formData.barcode}" for the "${formData.marketType} market" already exists.`);
            return;
        }

        const productToSave: ProductData = {
          ...formData,
          id: product?.id || `prod-${Date.now()}`,
          mrp: formData.mrp ? parseFloat(String(formData.mrp)) : null,
          shelfLife: formData.shelfLife ? parseInt(String(formData.shelfLife), 10) : null,
        };
        onSave(productToSave);
        onClose();
    };
    
    const getModalTitle = () => {
        if (product) return 'Edit Product';
        if (initialBarcode) return 'Add New Product';
        return `Add New Product - Step ${step === 'barcode' ? 1 : 2} of 2`;
    }

    const renderBarcodeScanner = () => (
        <form onSubmit={handleBarcodeSubmit} className="p-6 sm:p-8 max-h-[90vh] overflow-y-auto hide-scrollbar">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">{getModalTitle()}</h2>
            <p className="text-sm text-gray-500 mb-6">Scan the product barcode to begin.</p>
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition"><XIcon /></button>
            
            <div 
                className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md cursor-pointer hover:border-blue-500 transition"
                onClick={() => barcodeFileInputRef.current?.click()}
            >
                <div className="space-y-1 text-center">
                    {barcodeImageUrl ? (
                        <img src={barcodeImageUrl} alt="Barcode Preview" className="mx-auto h-48 w-auto rounded-md object-contain" />
                    ) : (
                        <>
                            <UploadIcon />
                            <div className="flex text-sm text-gray-600"><p className="pl-1">Upload Barcode Image</p></div>
                            <p className="text-xs text-gray-500">PNG, JPG up to 4MB</p>
                        </>
                    )}
                </div>
            </div>
            <input id="barcode-file-upload" type="file" className="sr-only" ref={barcodeFileInputRef} onChange={handleBarcodeFileChange} accept="image/*"/>
            
            {barcodeImageFile && (
                <div className="mt-4 flex items-center justify-between bg-gray-50 p-3 rounded-md">
                    <p className="text-sm font-medium text-gray-700 truncate">{barcodeImageFile.name}</p>
                    <button type="button" onClick={resetBarcodeStepState} className="ml-4 text-red-500 hover:text-red-700"><XCircleIcon className="w-5 h-5"/></button>
                </div>
            )}

            <div className="mt-4 flex items-center">
                <span className="flex-grow border-t border-gray-300"></span>
                <span className="mx-4 text-gray-500 text-sm font-semibold">OR</span>
                <span className="flex-grow border-t border-gray-300"></span>
            </div>
            <button type="button" onClick={() => { setCameraTarget('barcode'); setIsCameraOpen(true); }} className="w-full mt-4 flex justify-center items-center bg-gray-600 text-white p-3 rounded-lg font-semibold shadow-md hover:bg-gray-700 transition">
                <CameraIcon className="w-5 h-5 mr-2" /> Use Camera
            </button>
            
            {barcodeScanStatus === 'error' && <div className="text-sm text-red-600 mt-4 text-center">{barcodeScanError}</div>}
            
            <div className="mt-8 flex justify-end space-x-3 border-t pt-6">
                <button type="button" onClick={onClose} className="px-5 py-2.5 bg-gray-200 rounded-lg text-sm font-semibold text-gray-800 hover:bg-gray-300 transition">Cancel</button>
                <button type="submit" disabled={barcodeScanStatus === 'loading' || !barcodeImageFile} className="px-5 py-2.5 bg-blue-600 rounded-lg text-sm font-semibold text-white hover:bg-blue-700 transition flex items-center disabled:bg-blue-300">
                    {barcodeScanStatus === 'loading' && <Spinner/>} Next: Add Details
                </button>
            </div>
        </form>
    );

    const renderDetailsForm = () => (
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 max-h-[90vh] overflow-y-auto hide-scrollbar">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">{getModalTitle()}</h2>
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition"><XIcon /></button>
            
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                         <label className="block text-sm font-bold text-gray-700 mb-1">Product Name</label>
                         <input name="productName" value={formData.productName} onChange={handleChange} placeholder="e.g., Dark Fantasy Choco Fills" className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition" required />
                    </div>
                     <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Market Type</label>
                        <div className="relative">
                            <select name="marketType" value={formData.marketType} onChange={handleChange} className="w-full px-3 py-2 bg-gray-100 border border-gray-300 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition appearance-none pr-8">
                                <option value="general">General Market</option>
                                <option value="modern">Modern Market</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                            </div>
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Barcode</label>
                    <input name="barcode" value={formData.barcode} onChange={handleChange} placeholder="Scan or enter barcode" className="w-full px-3 py-2 bg-gray-100 text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition" required readOnly={!!initialBarcode} />
                </div>

                {product?.batchInfoText && (
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                        <h4 className="text-sm font-bold text-gray-600 mb-2 text-center uppercase tracking-wider">Expected Information Block</h4>
                        <div className="whitespace-pre-wrap text-left text-gray-800 text-sm font-mono bg-white p-3 rounded border border-gray-300 max-h-40 overflow-y-auto">
                            {generalizedBatchInfoBlock(product.batchInfoText || '').split('\n').map((line, index) => <div key={index}>{line}</div>)}
                        </div>
                        <div className="mt-3 text-center">
                            <p className="text-xs text-gray-500">This is the generalized reference format currently in the database.</p>
                            {product.batchNumberFormat && (
                                <p className="mt-1 text-sm font-semibold text-blue-800">
                                    Current Saved Format: <span className="font-mono bg-blue-100 px-1.5 py-0.5 rounded">{product.batchNumberFormat}</span>
                                </p>
                            )}
                        </div>
                    </div>
                )}

                <div className="border-t pt-6">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Batch Code Format</label>
                    <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                        <div className="space-y-1 text-center w-full">
                            {batchFormatImageUrl ? (
                                <img src={batchFormatImageUrl} alt="Batch Preview" className="mx-auto h-32 w-auto rounded-md object-contain" />
                            ) : (
                                <UploadIcon />
                            )}
                            {batchScanStatus === 'loading' ? (
                                <div className="flex justify-center items-center h-12">
                                    <Spinner /> <span className="ml-2 text-sm text-gray-500">Analyzing...</span>
                                </div>
                            ) : (
                                <div className="flex text-sm text-gray-600 justify-center">
                                    <label htmlFor="batch-format-file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                                        <span>Upload an image</span>
                                        <input id="batch-format-file-upload" name="batch-format-file-upload" type="file" className="sr-only" ref={batchFileInputRef} onChange={handleBatchFormatFileChange} accept="image/*" />
                                    </label>
                                    <p className="pl-1">or use</p>
                                    <button type="button" onClick={() => { setCameraTarget('batchFormat'); setIsCameraOpen(true); }} className="ml-1 bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none">camera</button>
                                </div>
                            )}
                            <p className="text-xs text-gray-500">to infer format, MRP, and shelf life</p>
                        </div>
                    </div>
                    {batchFormatImageFile && (
                        <div className="mt-4 flex items-center justify-between bg-gray-50 p-3 rounded-md">
                            <p className="text-sm font-medium text-gray-700 truncate">{batchFormatImageFile.name}</p>
                            <button type="button" onClick={resetBatchStepState} className="ml-4 text-red-500 hover:text-red-700"><XCircleIcon className="w-5 h-5"/></button>
                        </div>
                    )}
                    {batchScanStatus === 'error' && <div className="text-sm text-red-600 mt-2 text-center">{batchScanError}</div>}
                </div>

                {formData.batchNumberFormat && (
                    <div className="mt-4">
                        <label className="block text-xs font-medium text-gray-500 mb-2">EDITABLE FORMAT (CLICK TO CHANGE)</label>
                        <div className="flex flex-wrap gap-1 bg-white p-2 border rounded-lg">
                            {formData.batchNumberFormat.split('').map((char, index) => (
                                <div key={index} className="relative">
                                    <button 
                                        type="button"
                                        title={char === '#' ? 'Variable Number' : char === '@' ? 'Variable Alphabet' : `Fixed character: ${char}`}
                                        onClick={() => handleFormatCharClick(index)} 
                                        className={`w-8 h-8 flex items-center justify-center font-mono text-lg rounded transition ${
                                            activeEditorIndex === index 
                                                ? 'bg-yellow-400 text-black ring-2 ring-yellow-600' 
                                                : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                                        }`}
                                    >
                                        {char}
                                    </button>
                                    {activeEditorIndex === index && (
                                        <div ref={editorRef} className="absolute top-full mt-2 z-20 bg-white shadow-lg rounded-lg border p-3 w-48 animate-fade-in">
                                            <p className="text-xs font-bold mb-2 text-center">Change Character</p>
                                            <div className="flex justify-around mb-2">
                                                <button type="button" onClick={() => handleFormatChange('#')} className="w-10 h-10 rounded bg-blue-500 text-white font-mono text-xl hover:bg-blue-600">#</button>
                                                <button type="button" onClick={() => handleFormatChange('@')} className="w-10 h-10 rounded bg-purple-500 text-white font-mono text-xl hover:bg-purple-600">@</button>
                                            </div>
                                            <label className="text-xs font-medium text-gray-600">Or enter a fixed character:</label>
                                             <input 
                                                type="text"
                                                maxLength={1}
                                                onKeyDown={(e) => { if(e.key === "Enter") { e.preventDefault(); handleFormatChange(e.currentTarget.value) }}}
                                                onChange={(e) => handleFormatChange(e.currentTarget.value)}
                                                className="w-full text-center mt-1 p-1 border rounded"
                                                autoFocus
                                            />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="border-t pt-6 mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="flex items-center space-x-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="mrpApplicable"
                                    checked={formData.mrpApplicable}
                                    onChange={handleChange}
                                    className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm font-bold text-gray-700">MRP Applicable</span>
                            </label>
                        </div>
                        {formData.mrpApplicable && (
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">MRP (₹)</label>
                                <input
                                    name="mrp"
                                    type="number"
                                    value={formData.mrp ?? ''}
                                    onChange={handleChange}
                                    placeholder="e.g., 45.00"
                                    step="0.01"
                                    className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                                />
                            </div>
                        )}
                    </div>
                </div>
                <div className="mt-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Shelf Life</label>
                            <input
                                name="shelfLife"
                                type="number"
                                value={formData.shelfLife ?? ''}
                                onChange={handleChange}
                                placeholder="e.g., 180"
                                className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Unit</label>
                            <div className="relative">
                                <select
                                    name="shelfLifeUnit"
                                    value={formData.shelfLifeUnit ?? 'days'}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2 bg-gray-100 border border-gray-300 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition appearance-none pr-8"
                                >
                                    <option value="days">Days</option>
                                    <option value="months">Months</option>
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="mt-8 flex justify-end space-x-3 border-t pt-6 bg-gray-50 -mx-6 -mb-8 px-6 py-4 rounded-b-xl sm:-mx-8 sm:-mb-8 sm:px-8">
                <button type="button" onClick={onClose} className="px-5 py-2.5 bg-gray-200 rounded-lg text-sm font-semibold text-gray-800 hover:bg-gray-300 transition">Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-blue-600 rounded-lg text-sm font-semibold text-white hover:bg-blue-700 transition">Save Product</button>
            </div>
        </form>
    );

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-40 p-4 animate-fade-in" onClick={onClose}>
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
                {step === 'barcode' ? renderBarcodeScanner() : renderDetailsForm()}
            </div>
            <CameraModal 
                isOpen={isCameraOpen}
                onClose={() => setIsCameraOpen(false)}
                onCapture={handleCameraCapture}
            />
        </div>
    );
};

const DeleteConfirmationModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    product: ProductData | null;
}> = ({ isOpen, onClose, onConfirm, product }) => {
    if (!isOpen || !product) return null;

    const AlertIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
    );

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4 animate-fade-in" onClick={onClose}>
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <div className="p-6 sm:p-8">
                    <AlertIcon />
                    <h2 className="text-xl font-bold text-gray-800 text-center mt-4">Confirm Deletion</h2>
                    <p className="text-sm text-gray-500 text-center mt-2">Are you sure you want to permanently delete this product? This action cannot be undone.</p>
                    
                    <div className="mt-6 bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm space-y-2">
                        <div className="flex justify-between">
                            <span className="font-semibold text-gray-600">Product:</span>
                            <span className="font-bold text-gray-800 text-right">{product.productName}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-semibold text-gray-600">Barcode:</span>
                            <span className="font-mono text-gray-800">{product.barcode}</span>
                        </div>
                         <div className="flex justify-between">
                            <span className="font-semibold text-gray-600">Market:</span>
                            <span className="capitalize text-gray-800">{product.marketType}</span>
                        </div>
                    </div>
                    
                    <div className="mt-8 flex justify-end space-x-3">
                        <button onClick={onClose} className="px-5 py-2.5 bg-gray-200 rounded-lg text-sm font-semibold text-gray-800 hover:bg-gray-300 transition">
                            Cancel
                        </button>
                        <button onClick={onConfirm} className="px-5 py-2.5 bg-red-600 rounded-lg text-sm font-semibold text-white hover:bg-red-700 transition">
                            Delete Product
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};


const DatabasePage: React.FC = () => {
    const { user } = useAuth();
    const [products, setProducts] = useState<ProductData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<ProductData | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [productToDelete, setProductToDelete] = useState<ProductData | null>(null);

    const fetchProducts = useCallback(async () => {
        setIsLoading(true);
        const data = await databaseService.getProducts();
        setProducts(data);
        setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);

    const handleOpenModal = (product: ProductData | null = null) => {
        setEditingProduct(product);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingProduct(null);
    };

    const handleSaveProduct = async (product: ProductData) => {
        if (editingProduct) {
            await databaseService.updateProduct(product);
        } else {
            await databaseService.addProduct(product);
        }
        fetchProducts(); // Refresh list
    };
    
    const handleRequestDelete = (product: ProductData) => {
        setProductToDelete(product);
        setIsDeleteModalOpen(true);
    };
    
    const handleConfirmDelete = async () => {
        if (productToDelete) {
            await databaseService.deleteProduct(productToDelete.id);
            fetchProducts();
        }
        setIsDeleteModalOpen(false);
        setProductToDelete(null);
    };

    const handleCancelDelete = () => {
        setIsDeleteModalOpen(false);
        setProductToDelete(null);
    };
    
    const handleDownloadCSV = () => {
        downloadDataAsCSV(products, 'product_database', []);
    };

    const filteredProducts = useMemo(() => {
        return products.filter(p => 
            p.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.barcode.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [products, searchTerm]);

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <ProductFormModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                onSave={handleSaveProduct}
                product={editingProduct}
            />
            <DeleteConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={handleCancelDelete}
                onConfirm={handleConfirmDelete}
                product={productToDelete}
            />

            {/* Header */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-card px-6 py-5">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Product Database</h1>
                        <p className="mt-1 text-sm text-slate-500">Manage all products in the master database.</p>
                    </div>
                    {user?.role === 'admin' && (
                        <div className="flex gap-2 flex-shrink-0">
                            <button
                                onClick={handleDownloadCSV}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition"
                            >
                                <DownloadIcon className="w-4 h-4" /> Export CSV
                            </button>
                            <button
                                onClick={() => handleOpenModal()}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition shadow-sm"
                            >
                                <PlusIcon className="w-4 h-4" /> Add Product
                            </button>
                        </div>
                    )}
                </div>
                <div className="mt-4 relative">
                    <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search by product name or barcode…"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                </div>
            </div>

            {/* Table */}
            {isLoading ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-card px-6 py-16 text-center">
                    <p className="text-sm text-slate-500">Loading products…</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="border-b border-slate-200 bg-slate-50">
                                <tr>
                                    <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Product Name</th>
                                    <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Barcode</th>
                                    <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Market</th>
                                    <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Batch Format</th>
                                    <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">MRP (₹)</th>
                                    <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Shelf Life</th>
                                    {user?.role === 'admin' && (
                                        <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Actions</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredProducts.map(p => (
                                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-5 py-4 font-semibold text-slate-900">{p.productName}</td>
                                        <td className="px-5 py-4 font-mono text-slate-700 text-xs">{p.barcode}</td>
                                        <td className="px-5 py-4">
                                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide ${
                                                p.marketType === 'modern'
                                                  ? 'bg-purple-100 text-purple-700'
                                                  : 'bg-slate-100 text-slate-600'
                                            }`}>{p.marketType}</span>
                                        </td>
                                        <td className="px-5 py-4 font-mono text-slate-700 text-xs">{p.batchNumberFormat}</td>
                                        <td className="px-5 py-4 text-slate-700">{p.mrpApplicable && p.mrp ? `₹${p.mrp.toFixed(2)}` : <span className="text-slate-400">N/A</span>}</td>
                                        <td className="px-5 py-4 text-slate-700">{p.shelfLife && p.shelfLifeUnit ? `${p.shelfLife} ${p.shelfLifeUnit}` : <span className="text-slate-400">N/A</span>}</td>
                                        {user?.role === 'admin' && (
                                            <td className="px-5 py-4 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        onClick={() => handleOpenModal(p)}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                                                        aria-label="Edit product"
                                                    >
                                                        <PencilIcon className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleRequestDelete(p)}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                                                        aria-label="Delete product"
                                                    >
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredProducts.length === 0 && (
                            <div className="px-6 py-16 text-center">
                                <p className="text-sm font-semibold text-slate-800">No products found</p>
                                <p className="text-sm text-slate-400 mt-1">Try a different search term or add a new product.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DatabasePage;
