
import React, { useState, useRef, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { extractProductInfoFromImage, extractBatchCodeFromImage, OcrEngine } from '../services/imageExtractionService';
import { ValidationStatus, ValidationRecord, ProductData } from '../types';
import { databaseService } from '../services/databaseService';
import ResultModal from './ResultModal';
import Spinner from './common/Spinner';
import { UploadIcon } from './icons/UploadIcon';
import { XCircleIcon } from './icons/XCircleIcon';
import CameraModal from './CameraModal';
import { CameraIcon } from './icons/CameraIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { ProductFormModal } from './DatabasePage';
import { validateFullCode } from '../utils/validateProduct';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import Portal from './common/Portal';

/* ── Step Progress Indicator ─────────────────────────────── */
const StepIndicator: React.FC<{ step: 'barcode' | 'market_select' | 'batch' }> = ({ step }) => {
    const steps = [
        { key: 'barcode',  label: 'Scan Barcode' },
        { key: 'batch',    label: 'Validate Batch' },
    ] as const;

    const activeIndex = step === 'market_select' ? 0 : step === 'barcode' ? 0 : 1;

    return (
        <div className="flex items-center gap-0 mb-6">
            {steps.map((s, i) => {
                const isDone    = activeIndex > i;
                const isActive  = activeIndex === i;
                return (
                    <React.Fragment key={s.key}>
                        <div className="flex flex-col items-center">
                            <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200 ${
                                isDone   ? 'bg-blue-600 text-white shadow-sm' :
                                isActive ? 'bg-blue-600 text-white ring-4 ring-blue-100 scale-110 shadow-sm' :
                                           'bg-slate-100 text-slate-400 border border-slate-200'
                            }`}>
                                {isDone ? (
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                ) : i + 1}
                            </div>
                            <span className={`eyebrow mt-2 whitespace-nowrap ${isActive || isDone ? '!text-blue-700' : '!text-slate-400'}`}>
                                {s.label}
                            </span>
                        </div>
                        {i < steps.length - 1 && (
                            <div className={`flex-1 h-px mx-3 mb-6 rounded transition-colors ${isDone ? 'bg-blue-600' : 'bg-slate-200'}`} />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

/* ── Product Not Found Modal ─────────────────────────────── */
const ProductNotFoundModal: React.FC<{ isOpen: boolean; onClose: () => void; }> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <Portal>
    <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-[60] p-4 animate-fade-in" onClick={onClose}>
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 text-center">
            <div className="h-14 w-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                <XCircleIcon className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Product Not Found</h2>
            <p className="text-sm text-slate-500 mt-1.5">The scanned barcode does not match any product in the database.</p>
            <button
                onClick={onClose}
                className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-4 py-2.5 rounded-lg shadow-sm transition-colors"
            >
                OK
            </button>
        </div>
      </div>
    </div>
    </Portal>
  );
};

/* ── Image Uploader ──────────────────────────────────────── */
const ImageUploader: React.FC<{
    id: string;
    imageUrl: string | null;
    imageFile: File | null;
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClear: () => void;
    onCameraClick: () => void;
    fileInputRef: React.RefObject<HTMLInputElement>;
}> = ({ id, imageUrl, imageFile, onFileChange, onClear, onCameraClick, fileInputRef }) => (
    <div className="space-y-3">
        {/* Drop zone */}
        <div
            className={`flex justify-center items-center px-6 py-10 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 group ${
                imageUrl
                  ? 'border-blue-400 bg-blue-50/40'
                  : 'border-slate-300 hover:border-blue-500 hover:bg-blue-50/40'
            }`}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            aria-label="Upload image"
        >
            <div className="text-center flex flex-col items-center justify-center">
                {imageUrl ? (
                    <img src={imageUrl} alt="Preview" className="mx-auto h-44 w-auto rounded-lg object-contain" />
                ) : (
                    <>
                        <div className="h-14 w-14 rounded-xl bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center mb-3 transition-colors">
                            <span className="text-slate-500 group-hover:text-blue-600 transition-colors scale-125">
                                <UploadIcon />
                            </span>
                        </div>
                        <p className="text-sm font-semibold text-slate-700">Click to upload an image</p>
                        <p className="text-xs text-slate-400 mt-1">PNG, JPG up to 4 MB</p>
                    </>
                )}
            </div>
        </div>
        <input
            id={id}
            name={id}
            type="file"
            className="sr-only"
            ref={fileInputRef}
            onChange={onFileChange}
            accept="image/png, image/jpeg, image/gif"
        />

        {imageFile && (
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-lg">
                <span className="text-sm text-slate-700 truncate font-medium">{imageFile.name}</span>
                <button type="button" onClick={onClear} className="ml-3 text-slate-400 hover:text-red-500 transition flex-shrink-0" aria-label="Remove image">
                    <XCircleIcon className="w-5 h-5" />
                </button>
            </div>
        )}

        {/* Camera divider */}
        <div className="flex items-center gap-3">
            <span className="flex-1 border-t border-slate-200" />
            <span className="eyebrow !text-slate-400">OR</span>
            <span className="flex-1 border-t border-slate-200" />
        </div>
        <button
            type="button"
            onClick={onCameraClick}
            className="w-full flex justify-center items-center gap-2 bg-slate-900 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors shadow-sm"
        >
            <CameraIcon className="w-4 h-4" />
            Use Camera
        </button>
    </div>
);


/* ── Main Validator Page ─────────────────────────────────── */
const ValidatorPage: React.FC = () => {
  const { addHistoryRecord, user } = useAuth();

  const [step, setStep] = useState<'barcode' | 'market_select' | 'batch'>('barcode');

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);

  const [barcodeImageUrl, setBarcodeImageUrl] = useState<string | null>(null);
  const [barcodeImageDataUrl, setBarcodeImageDataUrl] = useState<string | null>(null);

  const [status, setStatus] = useState<ValidationStatus>(ValidationStatus.IDLE);
  const [error, setError] = useState<string | null>(null);

  const [foundProduct, setFoundProduct] = useState<ProductData | null>(null);
  const [matchingProducts, setMatchingProducts] = useState<ProductData[]>([]);
  const [extractedBarcode, setExtractedBarcode] = useState<string>('');
  const [extractedProductName, setExtractedProductName] = useState<string>('');

  const [ocrEngine, setOcrEngine] = useState<OcrEngine>('gemini');

  const [resultForModal, setResultForModal] = useState<Omit<ValidationRecord, 'id' | 'timestamp' | 'userId'> | null>(null);

  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [showBarcodeSuccessPopup, setShowBarcodeSuccessPopup] = useState(false);
  const [isProductNotFoundModalOpen, setIsProductNotFoundModalOpen] = useState(false);

  // Lock background scroll for the inline overlays this page owns directly
  // (success popup / not-found). Child components lock for their own modals.
  useBodyScrollLock(showBarcodeSuccessPopup || isProductNotFoundModalOpen);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetImageInput = useCallback(() => {
    setImageUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    setImageFile(null);
    setImageDataUrl(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const resetState = useCallback(() => {
    setStatus(ValidationStatus.IDLE);
    setFoundProduct(null);
    setMatchingProducts([]);
    setExtractedBarcode('');
    setExtractedProductName('');
    setResultForModal(null);
    setOcrEngine('gemini');
    setStep('barcode');
    setBarcodeImageUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    setBarcodeImageDataUrl(null);
    setShowBarcodeSuccessPopup(false);
    resetImageInput();
  }, [resetImageInput]);

  const processFile = (file: File) => {
    if (file.size > 4 * 1024 * 1024) {
        setError('File size must be less than 4 MB.');
        return;
    }
    setError(null);
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
    const reader = new FileReader();
    reader.onloadend = () => {
        if (typeof reader.result === 'string') setImageDataUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleCapture = (file: File) => {
    if (file) { processFile(file); setIsCameraOpen(false); }
  };

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageFile) { setError('Please select or capture an image of the barcode.'); return; }
    setStatus(ValidationStatus.LOADING);
    setError(null);
    try {
      const { barcode, productName, engine } = await extractProductInfoFromImage(imageFile);
      if (!barcode) throw new Error('Could not read barcode from the image.');
      setExtractedBarcode(barcode);
      setExtractedProductName(productName);
      if (engine) setOcrEngine(engine);

      const products = await databaseService.findProductsByBarcode(barcode);
      if (products.length === 0) {
        setStatus(ValidationStatus.IDLE);
        if (user?.role === 'admin') setIsAddProductModalOpen(true);
        else setIsProductNotFoundModalOpen(true);
      } else if (products.length === 1) {
        setFoundProduct(products[0]);
        setBarcodeImageUrl(imageUrl);
        setBarcodeImageDataUrl(imageDataUrl);
        setShowBarcodeSuccessPopup(true);
        setTimeout(() => { setShowBarcodeSuccessPopup(false); setStep('batch'); resetImageInput(); setStatus(ValidationStatus.IDLE); }, 2000);
      } else {
        setMatchingProducts(products);
        setBarcodeImageUrl(imageUrl);
        setBarcodeImageDataUrl(imageDataUrl);
        setStep('market_select');
        setStatus(ValidationStatus.IDLE);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to validate barcode. Please try again.');
      setStatus(ValidationStatus.ERROR);
    }
  };

  const handleMarketSelect = (product: ProductData) => {
    setFoundProduct(product);
    setShowBarcodeSuccessPopup(true);
    setTimeout(() => { setShowBarcodeSuccessPopup(false); setStep('batch'); resetImageInput(); setStatus(ValidationStatus.IDLE); }, 2000);
  };

  const handleSaveNewProduct = async (productData: ProductData) => {
    await databaseService.addProduct(productData);
    setIsAddProductModalOpen(false);
    setFoundProduct(productData);
    setBarcodeImageUrl(imageUrl);
    setBarcodeImageDataUrl(imageDataUrl);
    setStep('batch');
    resetImageInput();
    setStatus(ValidationStatus.IDLE);
  };

  const handleCloseAddProductModal = () => {
    setIsAddProductModalOpen(false);
    setError(`Product with barcode "${extractedBarcode}" not found.`);
    setStatus(ValidationStatus.ERROR);
  };

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageFile || !foundProduct) { setError('Please select or capture an image of the batch code.'); return; }
    setStatus(ValidationStatus.LOADING);
    setError(null);
    try {
        const { batchCode: rawBatchCode, productionDate, expiryDate, price, batchInfoText, engine } = await extractBatchCodeFromImage(imageFile, foundProduct.batchNumberFormat);
        if (engine) setOcrEngine(engine);

        // Verify the ENTIRE printed code block against the master record, not just
        // the batch-code line: format, MRP, shelf-life, date validity, and per-line info block.
        const { isValid, failureReason, checks } = validateFullCode({
            product: foundProduct,
            batchCode: rawBatchCode,
            barcode: extractedBarcode,
            productionDate,
            expiryDate,
            price,
            scannedInfoText: batchInfoText || '',
        });

        const byKey = (k: string) => checks.find(c => c.key === k)?.passed ?? false;

        const validationResult: Omit<ValidationRecord, 'id' | 'timestamp' | 'userId'> = {
            extractedBatch: rawBatchCode,
            extractedBarcode: extractedBarcode,
            isValid,
            failureReason,
            productName: foundProduct?.productName,
            expectedBatchFormat: foundProduct?.batchNumberFormat,
            validationMethod: 'ocr',
            barcodeImageUrl: barcodeImageDataUrl,
            batchImageUrl: imageDataUrl,
            extractedProductionDate: productionDate,
            extractedExpiryDate: expiryDate,
            extractedPrice: price,
            marketType: foundProduct?.marketType,
            checks,
            detailMatches: {
                productName: Boolean(foundProduct?.productName),
                expectedBatchFormat: Boolean(foundProduct?.batchNumberFormat),
                extractedBatch: byKey('batchCode'),
                extractedBarcode: byKey('barcode'),
                extractedProductionDate: byKey('dates'),
                extractedExpiryDate: byKey('dates'),
                extractedPrice: checks.some(c => c.key === 'mrp') ? byKey('mrp') : Boolean(price),
            },
        };

        setResultForModal(validationResult);
        addHistoryRecord(validationResult);
        setIsResultModalOpen(true);
        setStatus(ValidationStatus.IDLE);
    } catch (err: any) {
        setError(err.message || 'Failed to validate batch code. Please try again.');
        setStatus(ValidationStatus.ERROR);
    }
  };

  const closeResultModal = () => { setIsResultModalOpen(false); resetState(); };

  return (
    <>
      {/* Product Identified Popup */}
      {showBarcodeSuccessPopup && foundProduct && (
        <Portal>
        <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-[60] p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border-t-4 border-emerald-500 w-full max-w-sm p-5 text-center animate-slide-up">
            <div className="h-14 w-14 rounded-full bg-emerald-50 ring-4 ring-emerald-50/60 flex items-center justify-center mx-auto mb-3">
                <CheckCircleIcon className="h-8 w-8 text-emerald-500" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Product Identified</h2>
            <p className="text-sm text-slate-500 mt-1">Proceeding to batch validation…</p>
            <div className="mt-4 border-t border-slate-100 pt-4 text-left space-y-2.5">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Product</span>
                  <span className="font-semibold text-slate-800 text-right ml-3 truncate">{foundProduct.productName}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Market</span>
                  <span className="font-semibold text-slate-800 capitalize">{foundProduct.marketType}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Barcode</span>
                  <span className="font-mono text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">{extractedBarcode}</span>
                </div>
            </div>
          </div>
        </div>
        </Portal>
      )}

      <div className="max-w-2xl mx-auto">
        {/* Mode badge row — quiet status indicator, not a decorative animation */}
        <div className="flex justify-end mb-3">
          <span className={`inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide transition-colors ${
            ocrEngine === 'gemini'
              ? 'bg-brand-50 text-brand-700 border border-brand-100'
              : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            <span className={`inline-block rounded-full h-1.5 w-1.5 ${ocrEngine === 'gemini' ? 'bg-brand-600' : 'bg-amber-500'}`} />
            {ocrEngine === 'gemini' ? 'Cloud OCR' : 'Local OCR'}
          </span>
        </div>
        {/* Step Indicator — shown on barcode and batch steps */}
        {(step === 'barcode' || step === 'batch') && <StepIndicator step={step} />}

        {/* ── Step 1: Barcode ─────────────────────────────── */}
        {step === 'barcode' && (
            <div className="bg-white rounded-xl border border-slate-200/70 shadow-card overflow-hidden animate-slide-up">
              <div className="px-6 py-5 border-b border-slate-100 border-l-4 border-l-blue-600">
                  <p className="eyebrow !text-blue-700 mb-1">Step 01 · Identify</p>
                  <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Scan Barcode</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Upload or capture the product barcode to identify it.</p>
              </div>
              <div className="p-6">
                <form onSubmit={handleBarcodeSubmit} className="space-y-5">
                    <ImageUploader
                        id="barcode-file-upload"
                        imageUrl={imageUrl}
                        imageFile={imageFile}
                        onFileChange={handleImageChange}
                        onClear={resetImageInput}
                        onCameraClick={() => setIsCameraOpen(true)}
                        fileInputRef={fileInputRef}
                    />
                    {error && (
                        <div className="flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-200 p-3" role="alert">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    )}
                    <button
                        type="submit"
                        disabled={status === ValidationStatus.LOADING || !imageFile}
                        className="press w-full flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-4 py-2.5 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {status === ValidationStatus.LOADING ? <><Spinner /> Identifying…</> : 'Find Product by Barcode'}
                    </button>
                </form>
              </div>
            </div>
        )}

        {/* ── Step 1b: Market Select ───────────────────────── */}
        {step === 'market_select' && (
            <div className="bg-white rounded-xl border border-slate-200/70 shadow-card overflow-hidden animate-slide-up">
                <div className="px-6 py-5 border-b border-slate-100 border-l-4 border-l-blue-600">
                    <p className="eyebrow !text-blue-700 mb-1">Step 01 · Select Market</p>
                    <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Multiple Markets Found</h2>
                    <p className="text-sm text-slate-500 mt-0.5">The barcode matches products for more than one market. Select the correct one.</p>
                </div>
                <div className="p-6 space-y-3">
                    {matchingProducts.map(product => (
                        <button
                            key={product.id}
                            onClick={() => handleMarketSelect(product)}
                            className="w-full text-left p-4 border border-slate-200 rounded-xl hover:border-blue-500 hover:bg-blue-50/40 hover:shadow-sm transition-all group"
                        >
                            <p className="font-semibold text-slate-800 group-hover:text-blue-700 transition-colors">{product.productName}</p>
                            <span className="inline-block mt-1.5 text-[10px] font-bold uppercase tracking-wide bg-blue-600 text-white px-2 py-0.5 rounded">
                                {product.marketType} Market
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        )}

        {/* ── Step 2: Batch ────────────────────────────────── */}
        {step === 'batch' && foundProduct && (
            <div className="bg-white rounded-xl border border-slate-200/70 shadow-card overflow-hidden animate-slide-up">
                <div className="px-6 py-5 border-b border-slate-100 border-l-4 border-l-blue-600">
                    <p className="eyebrow !text-blue-700 mb-1">Step 02 · Verify</p>
                    <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Validate Batch Code</h2>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Product: <span className="font-semibold text-slate-700">{foundProduct.productName}</span>
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{foundProduct.marketType}</span>
                    </p>
                </div>
                <div className="p-6 space-y-5">
                    {/* Reference block */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {barcodeImageDataUrl && (
                            <div className="sm:col-span-1">
                                <p className="eyebrow mb-2">Specimen · Step 1</p>
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 flex items-center justify-center min-h-[80px]">
                                    <img src={barcodeImageDataUrl} alt="Scanned product barcode" className="max-h-24 object-contain rounded" />
                                </div>
                            </div>
                        )}
                        <div className={barcodeImageDataUrl ? 'sm:col-span-2' : 'sm:col-span-3'}>
                            <p className="eyebrow mb-2">Reference · Master Record</p>
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 min-h-[80px] flex flex-col justify-center">
                                <pre className="whitespace-pre-wrap text-slate-800 text-sm font-mono leading-relaxed">
                                    {foundProduct.batchInfoText || 'No reference text available.'}
                                </pre>
                                <div className="mt-2 pt-2 border-t border-slate-200">
                                    <span className="eyebrow mr-1">Format</span>
                                    <code className="font-mono text-sm bg-slate-100 text-slate-800 px-2 py-0.5 rounded">{foundProduct.batchNumberFormat}</code>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Upload */}
                    <form onSubmit={handleBatchSubmit} className="space-y-5">
                        <div>
                            <p className="eyebrow mb-2">Specimen · Batch Code</p>
                            <ImageUploader
                                id="batch-file-upload"
                                imageUrl={imageUrl}
                                imageFile={imageFile}
                                onFileChange={handleImageChange}
                                onClear={resetImageInput}
                                onCameraClick={() => setIsCameraOpen(true)}
                                fileInputRef={fileInputRef}
                            />
                        </div>
                        {error && (
                            <div className="flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-200 p-3" role="alert">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                        )}
                        <div className="flex gap-3 pt-1">
                            <button
                                type="button"
                                onClick={resetState}
                                className="w-1/3 flex justify-center items-center bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm px-4 py-2.5 rounded-lg border border-slate-200 transition-colors"
                            >
                                Start Over
                            </button>
                            <button
                                type="submit"
                                disabled={status === ValidationStatus.LOADING || !imageFile}
                                className="press w-2/3 flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-4 py-2.5 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {status === ValidationStatus.LOADING ? <><Spinner /> Validating…</> : 'Validate Batch Code'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}
      </div>

      <ProductNotFoundModal
        isOpen={isProductNotFoundModalOpen}
        onClose={() => { setIsProductNotFoundModalOpen(false); resetState(); }}
      />
      <CameraModal isOpen={isCameraOpen} onClose={() => setIsCameraOpen(false)} onCapture={handleCapture} />
      <ResultModal isOpen={isResultModalOpen} onClose={closeResultModal} result={resultForModal} />
      <ProductFormModal
        isOpen={isAddProductModalOpen}
        onClose={handleCloseAddProductModal}
        onSave={handleSaveNewProduct}
        product={null}
        initialBarcode={extractedBarcode}
        initialProductName={extractedProductName}
      />
    </>
  );
};

export default ValidatorPage;
