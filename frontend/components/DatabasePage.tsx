
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
            <div className="mb-6">
                <h2 className="text-lg font-semibold text-slate-900 tracking-tight">{getModalTitle()}</h2>
                <p className="text-sm text-slate-500 mt-1">Scan the product barcode to begin.</p>
            </div>
            <button type="button" onClick={onClose} className="absolute top-4 right-4 h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors" aria-label="Close"><XIcon /></button>

            <div
                className="flex justify-center items-center px-6 py-10 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 group border-slate-300 hover:border-blue-500 hover:bg-blue-50/40"
                onClick={() => barcodeFileInputRef.current?.click()}
            >
                <div className="text-center flex flex-col items-center justify-center">
                    {barcodeImageUrl ? (
                        <img src={barcodeImageUrl} alt="Barcode Preview" className="mx-auto h-44 w-auto rounded-lg object-contain" />
                    ) : (
                        <>
                            <div className="h-14 w-14 rounded-xl bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center mb-3 transition-colors">
                                <span className="text-slate-500 group-hover:text-blue-600 transition-colors scale-125">
                                    <UploadIcon />
                                </span>
                            </div>
                            <p className="text-sm font-semibold text-slate-700">Upload barcode image</p>
                            <p className="text-xs text-slate-400 mt-1">PNG, JPG up to 4 MB</p>
                        </>
                    )}
                </div>
            </div>
            <input id="barcode-file-upload" type="file" className="sr-only" ref={barcodeFileInputRef} onChange={handleBarcodeFileChange} accept="image/*"/>

            {barcodeImageFile && (
                <div className="mt-4 flex items-center justify-between bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-lg">
                    <p className="text-sm font-medium text-slate-700 truncate">{barcodeImageFile.name}</p>
                    <button type="button" onClick={resetBarcodeStepState} className="ml-4 text-slate-400 hover:text-red-500 transition-colors" aria-label="Remove image"><XCircleIcon className="w-5 h-5"/></button>
                </div>
            )}

            <div className="mt-4 flex items-center gap-3">
                <span className="flex-1 border-t border-slate-200"></span>
                <span className="text-xs font-semibold text-slate-400">OR</span>
                <span className="flex-1 border-t border-slate-200"></span>
            </div>
            <button
                type="button"
                onClick={() => { setCameraTarget('barcode'); setIsCameraOpen(true); }}
                className="w-full mt-4 flex justify-center items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors shadow-sm"
            >
                <CameraIcon className="w-4 h-4" /> Use Camera
            </button>

            {barcodeScanStatus === 'error' && (
                <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-200 p-3" role="alert">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-sm text-red-700">{barcodeScanError}</p>
                </div>
            )}

            <div className="mt-8 flex justify-end gap-3 border-t border-slate-100 pt-6">
                <button type="button" onClick={onClose} className="bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm px-4 py-2.5 rounded-lg border border-slate-200 transition-colors">Cancel</button>
                <button type="submit" disabled={barcodeScanStatus === 'loading' || !barcodeImageFile} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-4 py-2.5 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {barcodeScanStatus === 'loading' && <Spinner/>} Next: Add Details
                </button>
            </div>
        </form>
    );

    const renderDetailsForm = () => (
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 max-h-[90vh] overflow-y-auto hide-scrollbar">
            <div className="mb-6">
                <h2 className="text-lg font-semibold text-slate-900 tracking-tight">{getModalTitle()}</h2>
                <p className="text-sm text-slate-500 mt-1">Configure product metadata, batch format, and shelf-life.</p>
            </div>
            <button type="button" onClick={onClose} className="absolute top-4 right-4 h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors" aria-label="Close"><XIcon /></button>

            <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                         <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Product Name</label>
                         <input name="productName" value={formData.productName} onChange={handleChange} placeholder="e.g., Dark Fantasy Choco Fills" className="w-full px-3 py-2.5 bg-white text-sm text-slate-900 placeholder-slate-400 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition" required />
                    </div>
                     <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Market Type</label>
                        <div className="relative">
                            <select name="marketType" value={formData.marketType} onChange={handleChange} className="w-full px-3 py-2.5 bg-white border border-slate-200 text-sm text-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition appearance-none pr-8">
                                <option value="general">General Market</option>
                                <option value="modern">Modern Market</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                            </div>
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Barcode</label>
                    <input name="barcode" value={formData.barcode} onChange={handleChange} placeholder="Scan or enter barcode" className={`w-full px-3 py-2.5 text-sm font-mono text-slate-900 placeholder-slate-400 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${initialBarcode ? 'bg-slate-50' : 'bg-white'}`} required readOnly={!!initialBarcode} />
                </div>

                {product?.batchInfoText && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 text-center">Expected Information Block</h4>
                        <div className="whitespace-pre-wrap text-left text-slate-800 text-sm font-mono bg-white p-3 rounded-lg border border-slate-200 max-h-40 overflow-y-auto">
                            {generalizedBatchInfoBlock(product.batchInfoText || '').split('\n').map((line, index) => <div key={index}>{line}</div>)}
                        </div>
                        <div className="mt-3 text-center">
                            <p className="text-xs text-slate-500">Generalized reference format currently in the database.</p>
                            {product.batchNumberFormat && (
                                <p className="mt-1.5 text-xs text-slate-600">
                                    <span className="font-semibold text-slate-700">Saved format:</span> <span className="font-mono text-sm bg-slate-100 text-slate-800 px-2 py-0.5 rounded">{product.batchNumberFormat}</span>
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Batch format inference — visually distinct slate-50 section */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-semibold text-slate-900">Batch Code Format</h3>
                            <p className="text-xs text-slate-500 mt-0.5">Upload a batch image to auto-infer format, MRP, and shelf-life.</p>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">Auto</span>
                    </div>

                    <div className="flex justify-center items-center px-6 py-8 border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl bg-white transition-colors">
                        <div className="text-center flex flex-col items-center justify-center w-full">
                            {batchFormatImageUrl ? (
                                <img src={batchFormatImageUrl} alt="Batch Preview" className="mx-auto h-32 w-auto rounded-lg object-contain mb-3" />
                            ) : (
                                <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
                                    <span className="text-slate-500 scale-110"><UploadIcon /></span>
                                </div>
                            )}
                            {batchScanStatus === 'loading' ? (
                                <div className="flex justify-center items-center h-12 text-blue-600">
                                    <Spinner /> <span className="ml-1 text-sm font-medium text-slate-600">Analyzing…</span>
                                </div>
                            ) : (
                                <div className="flex text-sm text-slate-600 justify-center items-center gap-1">
                                    <label htmlFor="batch-format-file-upload" className="relative cursor-pointer font-semibold text-blue-600 hover:text-blue-700 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500 rounded">
                                        <span>Upload an image</span>
                                        <input id="batch-format-file-upload" name="batch-format-file-upload" type="file" className="sr-only" ref={batchFileInputRef} onChange={handleBatchFormatFileChange} accept="image/*" />
                                    </label>
                                    <span className="text-slate-400">or use</span>
                                    <button type="button" onClick={() => { setCameraTarget('batchFormat'); setIsCameraOpen(true); }} className="font-semibold text-blue-600 hover:text-blue-700 focus:outline-none">camera</button>
                                </div>
                            )}
                            <p className="text-xs text-slate-400 mt-1">PNG, JPG up to 4 MB</p>
                        </div>
                    </div>

                    {batchFormatImageFile && (
                        <div className="flex items-center justify-between bg-white border border-slate-200 px-3 py-2.5 rounded-lg">
                            <p className="text-sm font-medium text-slate-700 truncate">{batchFormatImageFile.name}</p>
                            <button type="button" onClick={resetBatchStepState} className="ml-4 text-slate-400 hover:text-red-500 transition-colors" aria-label="Remove image"><XCircleIcon className="w-5 h-5"/></button>
                        </div>
                    )}

                    {batchScanStatus === 'error' && (
                        <div className="flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-200 p-3" role="alert">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <p className="text-sm text-red-700">{batchScanError}</p>
                        </div>
                    )}

                    {formData.batchNumberFormat && (
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Editable Format (click to change)</label>
                            <div className="flex flex-wrap gap-1 bg-white p-2.5 border border-slate-200 rounded-lg">
                                {formData.batchNumberFormat.split('').map((char, index) => (
                                    <div key={index} className="relative">
                                        <button
                                            type="button"
                                            title={char === '#' ? 'Variable Number' : char === '@' ? 'Variable Alphabet' : `Fixed character: ${char}`}
                                            onClick={() => handleFormatCharClick(index)}
                                            className={`w-8 h-8 flex items-center justify-center font-mono text-lg rounded transition-colors ${
                                                activeEditorIndex === index
                                                    ? 'bg-amber-400 text-slate-900 ring-2 ring-amber-500'
                                                    : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                                            }`}
                                        >
                                            {char}
                                        </button>
                                        {activeEditorIndex === index && (
                                            <div ref={editorRef} className="absolute top-full mt-2 z-20 bg-white shadow-xl rounded-xl border border-slate-200 p-3 w-52 animate-fade-in">
                                                <p className="text-xs font-semibold text-slate-700 mb-2 text-center">Change Character</p>
                                                <div className="flex justify-around mb-2 gap-2">
                                                    <button type="button" onClick={() => handleFormatChange('#')} className="flex-1 h-10 rounded-lg bg-blue-600 text-white font-mono text-xl hover:bg-blue-700 transition-colors">#</button>
                                                    <button type="button" onClick={() => handleFormatChange('@')} className="flex-1 h-10 rounded-lg bg-slate-700 text-white font-mono text-xl hover:bg-slate-800 transition-colors">@</button>
                                                </div>
                                                <label className="text-xs font-medium text-slate-500">Or enter a fixed character:</label>
                                                <input
                                                    type="text"
                                                    maxLength={1}
                                                    onKeyDown={(e) => { if(e.key === "Enter") { e.preventDefault(); handleFormatChange(e.currentTarget.value) }}}
                                                    onChange={(e) => handleFormatChange(e.currentTarget.value)}
                                                    className="w-full text-center mt-1 px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    autoFocus
                                                />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="border-t border-slate-100 pt-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className="flex items-center space-x-3 cursor-pointer h-full">
                                <input
                                    type="checkbox"
                                    name="mrpApplicable"
                                    checked={formData.mrpApplicable}
                                    onChange={handleChange}
                                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm font-semibold text-slate-700">MRP Applicable</span>
                            </label>
                        </div>
                        {formData.mrpApplicable && (
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">MRP (₹)</label>
                                <input
                                    name="mrp"
                                    type="number"
                                    value={formData.mrp ?? ''}
                                    onChange={handleChange}
                                    placeholder="e.g., 45.00"
                                    step="0.01"
                                    className="w-full px-3 py-2.5 bg-white text-sm text-slate-900 placeholder-slate-400 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                                />
                            </div>
                        )}
                    </div>
                </div>
                <div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Shelf Life</label>
                            <input
                                name="shelfLife"
                                type="number"
                                value={formData.shelfLife ?? ''}
                                onChange={handleChange}
                                placeholder="e.g., 180"
                                className="w-full px-3 py-2.5 bg-white text-sm text-slate-900 placeholder-slate-400 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Unit</label>
                            <div className="relative">
                                <select
                                    name="shelfLifeUnit"
                                    value={formData.shelfLifeUnit ?? 'days'}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2.5 bg-white border border-slate-200 text-sm text-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition appearance-none pr-8"
                                >
                                    <option value="days">Days</option>
                                    <option value="months">Months</option>
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="mt-8 flex justify-end gap-3 border-t border-slate-100 bg-slate-50 -mx-6 -mb-6 px-6 py-4 rounded-b-xl sm:-mx-8 sm:-mb-8 sm:px-8 sm:py-5">
                <button type="button" onClick={onClose} className="bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm px-4 py-2.5 rounded-lg border border-slate-200 transition-colors">Cancel</button>
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-4 py-2.5 rounded-lg shadow-sm transition-colors">Save Product</button>
            </div>
        </form>
    );

    return (
        <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-40 p-4 animate-fade-in" onClick={onClose}>
            <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl animate-slide-up" onClick={(e) => e.stopPropagation()}>
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

    return (
        <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-50 p-4 animate-fade-in" onClick={onClose}>
            <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md animate-slide-up" onClick={(e) => e.stopPropagation()}>
                <div className="p-6 sm:p-7">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="h-12 w-12 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0 ring-4 ring-red-50/60">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Delete product?</h2>
                            <p className="text-sm text-slate-500 mt-0.5">This action cannot be undone.</p>
                        </div>
                    </div>

                    <div className="mt-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm space-y-2.5">
                        <div className="flex justify-between gap-3">
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Product</span>
                            <span className="font-semibold text-slate-800 text-right truncate">{product.productName}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Barcode</span>
                            <span className="font-mono text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded">{product.barcode}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Market</span>
                            <span className="capitalize text-slate-800 font-medium">{product.marketType}</span>
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end gap-3">
                        <button onClick={onClose} className="bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm px-4 py-2.5 rounded-lg border border-slate-200 transition-colors">
                            Cancel
                        </button>
                        <button onClick={onConfirm} className="bg-red-600 hover:bg-red-700 text-white font-semibold text-sm px-4 py-2.5 rounded-lg shadow-sm transition-colors">
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
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-6 py-5">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Product Database</h1>
                        <p className="mt-1 text-sm text-slate-500">Manage all products in the master database.</p>
                    </div>
                    {user?.role === 'admin' && (
                        <div className="flex gap-2 flex-shrink-0">
                            <button
                                onClick={handleDownloadCSV}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
                            >
                                <DownloadIcon className="w-4 h-4" /> Export CSV
                            </button>
                            <button
                                onClick={() => handleOpenModal()}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
                            >
                                <PlusIcon className="w-4 h-4" /> Add Product
                            </button>
                        </div>
                    )}
                </div>
                <div className="mt-4 relative">
                    <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search by product name or barcode…"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                </div>
            </div>

            {/* Table */}
            {isLoading ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-6 py-16 flex flex-col items-center justify-center">
                    <div className="text-blue-600"><Spinner /></div>
                    <p className="mt-3 text-sm font-semibold text-slate-700">Loading products…</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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
                                    <tr key={p.id} className="group hover:bg-slate-50 transition-colors">
                                        <td className="px-5 py-4 font-semibold text-slate-900">{p.productName}</td>
                                        <td className="px-5 py-4">
                                            <span className="font-mono text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded">{p.barcode}</span>
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                                                p.marketType === 'modern'
                                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                                            }`}>{p.marketType}</span>
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className="font-mono text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded">{p.batchNumberFormat}</span>
                                        </td>
                                        <td className="px-5 py-4 text-slate-700">{p.mrpApplicable && p.mrp ? `₹${p.mrp.toFixed(2)}` : <span className="text-slate-400">—</span>}</td>
                                        <td className="px-5 py-4 text-slate-700">{p.shelfLife && p.shelfLifeUnit ? `${p.shelfLife} ${p.shelfLifeUnit}` : <span className="text-slate-400">—</span>}</td>
                                        {user?.role === 'admin' && (
                                            <td className="px-5 py-4 text-right">
                                                <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => handleOpenModal(p)}
                                                        className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                                        aria-label="Edit product"
                                                    >
                                                        <PencilIcon className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleRequestDelete(p)}
                                                        className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
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
                                <div className="h-14 w-14 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                                    <SearchIcon className="h-7 w-7 text-slate-400" />
                                </div>
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
