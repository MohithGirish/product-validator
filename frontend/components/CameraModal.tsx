import React, { useRef, useEffect, useState } from 'react';
import { XIcon } from './icons/XIcon';
import { CameraIcon } from './icons/CameraIcon';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import Portal from './common/Portal';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

const CameraModal: React.FC<CameraModalProps> = ({ isOpen, onClose, onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const startCamera = async () => {
      if (isOpen) {
        setError(null);
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' } // Prefer back camera
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            streamRef.current = stream;
          }
        } catch (err) {
          console.error("Camera access denied:", err);
          setError("Could not access the camera. Please check your browser permissions.");
        }
      }
    };

    startCamera();

    return () => {
      // Cleanup: stop camera stream when modal is closed or component unmounts
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen]);

  useBodyScrollLock(isOpen);

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
            onCapture(file);
          }
        }, 'image/jpeg', 0.95);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <Portal>
    {/* Stop propagation so taps inside the camera (capture/close) never bubble to a
        parent modal's backdrop-close handler when this is rendered nested inside one. */}
    <div
      className="fixed inset-0 bg-black z-[70] flex flex-col sm:justify-center sm:items-center sm:p-4"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Camera viewport — fills the screen on mobile (portrait-friendly), boxed on larger screens. */}
      <div className="relative bg-black flex-1 w-full sm:flex-none sm:max-w-3xl sm:aspect-video sm:rounded-lg overflow-hidden">
        <button
          onClick={onClose}
          aria-label="Close camera"
          className="absolute top-3 right-3 text-white z-10 bg-black/50 rounded-full p-2.5 transition hover:bg-black/75"
          style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <XIcon className="w-5 h-5" />
        </button>
        {error ? (
          <div className="flex items-center justify-center h-full text-white text-center p-8 bg-gray-900">{error}</div>
        ) : (
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
        )}
        <canvas ref={canvasRef} className="hidden"></canvas>

        {/* Mobile: capture button overlaid at the bottom of the live view. */}
        {!error && (
          <div
            className="sm:hidden absolute inset-x-0 bottom-0 flex justify-center pb-6 pt-10 bg-gradient-to-t from-black/60 to-transparent"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}
          >
            <button
              onClick={handleCapture}
              aria-label="Capture Image"
              className="camera-shutter w-[72px] h-[72px] rounded-full flex items-center justify-center border-4 focus:outline-none focus:ring-4 focus:ring-blue-500/50 active:scale-95 transition"
            >
              <div className="camera-shutter-inner w-14 h-14 rounded-full flex items-center justify-center">
                <CameraIcon className="w-7 h-7" />
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Desktop / tablet: capture button below the boxed viewport. */}
      {!error && (
        <div className="hidden sm:block mt-6">
          <button
            onClick={handleCapture}
            aria-label="Capture Image"
            className="camera-shutter w-20 h-20 rounded-full flex items-center justify-center border-4 focus:outline-none focus:ring-4 focus:ring-blue-500/50 transition"
          >
            <div className="camera-shutter-inner w-16 h-16 rounded-full flex items-center justify-center">
              <CameraIcon className="w-8 h-8" />
            </div>
          </button>
        </div>
      )}
    </div>
    </Portal>
  );
};

export default CameraModal;
