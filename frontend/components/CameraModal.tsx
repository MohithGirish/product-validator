import React, { useRef, useEffect, useState } from 'react';
import { XIcon } from './icons/XIcon';
import { CameraIcon } from './icons/CameraIcon';

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
    <div className="fixed inset-0 bg-black bg-opacity-75 flex flex-col justify-center items-center z-50 p-4">
      <div className="relative bg-black rounded-lg w-full max-w-3xl aspect-video overflow-hidden">
        <button onClick={onClose} className="absolute top-3 right-3 text-white z-10 bg-black bg-opacity-50 rounded-full p-1.5 transition hover:bg-opacity-75">
          <XIcon className="w-5 h-5" />
        </button>
        {error ? (
          <div className="flex items-center justify-center h-full text-white text-center p-8 bg-gray-900">{error}</div>
        ) : (
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
        )}
        <canvas ref={canvasRef} className="hidden"></canvas>
      </div>
      {!error && (
        <div className="mt-6">
          <button 
            onClick={handleCapture}
            aria-label="Capture Image"
            className="w-20 h-20 rounded-full bg-white flex items-center justify-center border-4 border-gray-400 focus:outline-none focus:ring-4 focus:ring-blue-500 focus:ring-opacity-50 transition"
          >
             <div className="w-16 h-16 rounded-full bg-white active:bg-gray-200 flex items-center justify-center">
                <CameraIcon className="w-8 h-8 text-gray-700" />
             </div>
          </button>
        </div>
      )}
    </div>
  );
};

export default CameraModal;
