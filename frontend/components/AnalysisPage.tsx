import React, { useState, useRef, useCallback } from 'react';
import { analyzeImage, OcrEngine } from '../services/imageExtractionService';
import Spinner from './common/Spinner';
import { UploadIcon } from './icons/UploadIcon';
import { XCircleIcon } from './icons/XCircleIcon';
import CameraModal from './CameraModal';
import { CameraIcon } from './icons/CameraIcon';
import { ValidationStatus } from '../types';

const AnalysisPage: React.FC = () => {
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [prompt, setPrompt] = useState<string>('');
    const [status, setStatus] = useState<ValidationStatus>(ValidationStatus.IDLE);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<string | null>(null);
    const [engine, setEngine] = useState<OcrEngine | null>(null);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const resetImageInput = useCallback(() => {
        setImageFile(null);
        setImageUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, []);

    const resetState = useCallback(() => {
        resetImageInput();
        setPrompt('');
        setStatus(ValidationStatus.IDLE);
        setError(null);
        setResult(null);
        setEngine(null);
    }, [resetImageInput]);

    const processFile = (file: File) => {
        if (file.size > 4 * 1024 * 1024) {
            setError('File size must be less than 4 MB.');
            return;
        }
        setError(null);
        setImageFile(file);
        setImageUrl(URL.createObjectURL(file));
    };

    const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) processFile(file);
    };

    const handleCapture = (file: File) => {
        if (file) { processFile(file); setIsCameraOpen(false); }
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!imageFile) { setError('Please provide an image.'); return; }
        setStatus(ValidationStatus.LOADING);
        setError(null);
        setResult(null);
        setEngine(null);
        try {
            const data = await analyzeImage(imageFile, prompt);
            setResult(data.result);
            if (data.engine) setEngine(data.engine);
            setStatus(ValidationStatus.SUCCESS);
        } catch (err: any) {
            setError(err.message || 'Failed to analyze image. Please try again.');
            setStatus(ValidationStatus.ERROR);
        }
    };

    return (
        <>
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-card px-6 py-5">
                <p className="eyebrow !text-blue-700 mb-1">OCR Workbench</p>
                <h1 className="text-2xl font-bold text-slate-900">Image Analysis</h1>
                <p className="mt-1 text-sm text-slate-500">Upload a product label image to extract text and detected fields via OCR.</p>
            </div>

            {/* Main card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
                <form onSubmit={handleSubmit}>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Image uploader */}
                        <div className="space-y-3">
                            <p className="text-sm font-semibold text-slate-700">Image to Analyze</p>
                            <div
                                className={`flex justify-center px-6 pt-8 pb-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                                    imageUrl
                                      ? 'border-blue-400 bg-blue-50/50'
                                      : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50/30'
                                }`}
                                onClick={() => fileInputRef.current?.click()}
                                role="button"
                                aria-label="Upload image"
                            >
                                <div className="text-center">
                                    {imageUrl ? (
                                        <img src={imageUrl} alt="Preview" className="mx-auto h-44 w-auto rounded-lg object-contain" />
                                    ) : (
                                        <>
                                            <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                                                <UploadIcon />
                                            </div>
                                            <p className="text-sm font-medium text-slate-700">Click to upload an image</p>
                                            <p className="text-xs text-slate-400 mt-1">PNG, JPG up to 4 MB</p>
                                        </>
                                    )}
                                </div>
                            </div>
                            <input
                                id="analysis-image-upload"
                                type="file"
                                className="sr-only"
                                ref={fileInputRef}
                                onChange={handleImageChange}
                                accept="image/png, image/jpeg, image/gif"
                            />

                            {imageFile && (
                                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-lg">
                                    <span className="text-sm text-slate-700 truncate font-medium">{imageFile.name}</span>
                                    <button type="button" onClick={resetImageInput} className="ml-3 text-slate-400 hover:text-red-500 transition flex-shrink-0" aria-label="Remove image">
                                        <XCircleIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            )}

                            <div className="flex items-center gap-3">
                                <span className="flex-1 border-t border-slate-200" />
                                <span className="text-xs font-semibold text-slate-400">OR</span>
                                <span className="flex-1 border-t border-slate-200" />
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsCameraOpen(true)}
                                className="w-full flex justify-center items-center gap-2 bg-slate-800 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-900 transition"
                            >
                                <CameraIcon className="w-4 h-4" />
                                Use Camera
                            </button>
                        </div>

                        {/* Prompt + actions */}
                        <div className="flex flex-col gap-4">
                            <div>
                                <label htmlFor="analysis-prompt" className="block text-sm font-semibold text-slate-700 mb-1.5">
                                    Optional Note
                                </label>
                                <textarea
                                    id="analysis-prompt"
                                    rows={5}
                                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none"
                                    placeholder="e.g., Batch code is hard to see on the left side"
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
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

                            <div className="mt-auto flex flex-col gap-2.5">
                                <button
                                    type="submit"
                                    disabled={status === ValidationStatus.LOADING || !imageFile}
                                    className="w-full flex justify-center items-center gap-2 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                >
                                    {status === ValidationStatus.LOADING ? <><Spinner /> Analyzing…</> : 'Analyze Image'}
                                </button>
                                <button
                                    type="button"
                                    onClick={resetState}
                                    className="w-full flex justify-center items-center bg-slate-100 text-slate-700 py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-200 transition"
                                >
                                    Start Over
                                </button>
                            </div>
                        </div>
                    </div>
                </form>

                {status === ValidationStatus.SUCCESS && result && (
                    <div className="border-t border-slate-100 px-6 py-5">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Analysis Result</h3>
                            {engine && (
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                    engine === 'gemini'
                                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                                }`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${engine === 'gemini' ? 'bg-blue-500' : 'bg-slate-400'}`} />
                                    {engine === 'gemini' ? 'Gemini OCR' : 'Local OCR'}
                                </span>
                            )}
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                            <pre className="whitespace-pre-wrap text-slate-700 text-sm font-mono leading-relaxed">{result}</pre>
                        </div>
                    </div>
                )}
            </div>
        </div>

        <CameraModal
            isOpen={isCameraOpen}
            onClose={() => setIsCameraOpen(false)}
            onCapture={handleCapture}
        />
        </>
    );
};

export default AnalysisPage;
