import React, { useState, useRef, useEffect } from 'react';
import { uploadDocument } from '../../services/intakeApi';
import ErrorPage from './ErrorPage';

interface StepTwoProps {
  clientId: string | number;
  folderName: string;
  firstName: string;
  lastName: string;
}

const StepTwo: React.FC<StepTwoProps> = ({ clientId, folderName, firstName, lastName }) => {
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const [isDragOver, setIsDragOver] = useState(false);
  const [noIdChecked, setNoIdChecked] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent, status: boolean) => {
    e.preventDefault();
    setIsDragOver(status);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files?.[0]) validateAndSetFile(e.dataTransfer.files[0]);
  };

  const validateAndSetFile = (uploadedFile: File) => {
    if (uploadedFile.size > 10 * 1024 * 1024) {
      setError("File is too large. Maximum size is 10MB.");
      return;
    }
    setFile(uploadedFile);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);

    // Simulate progress since fetch doesn't support it natively easily without XHR
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 200);

    try {
      const result = await uploadDocument(file, clientId, folderName);

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (result.success) {
        setUploadSuccess(true);
        setTimeout(() => window.location.href = 'https://www.rowanrose.co.uk/', 2500);
      }
    } catch (error: any) {
      clearInterval(progressInterval);
      setError(error.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (uploadSuccess) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center fade-in">
        <div className="relative">
          <div className="w-24 h-24 border-4 border-green-500 rounded-full flex items-center justify-center animate-[ping_1s_ease-in-out_1]">
          </div>
          <div className="absolute top-0 left-0 w-24 h-24 bg-green-50 rounded-full flex items-center justify-center border-4 border-green-500">
            <i className="fas fa-check text-4xl text-green-600"></i>
          </div>
        </div>
        <h2 className="text-3xl font-serif text-navy-900 mt-8 mb-2">Submission Successful</h2>
        <p className="text-slate-500 text-lg">Redirecting you securely...</p>
      </div>
    );
  }

  if (error) {
    return <ErrorPage />;
  }

  return (
    <div className="fade-in max-w-2xl mx-auto">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-serif text-navy-900 mb-3">Welcome, {firstName} {lastName}.</h2>
        <p className="text-slate-500">
          AS PART OF OUR ONBOARDING AND TO REPRESENT YOU AS A CLIENT PLEASE UPLOAD ONE FORM OF IDENTIFICATION EITHER A &nbsp;
          <span className="inline-flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-navy-900 rounded-full"></span>
            <strong className="font-bold text-navy-900">Driving Licence</strong>

            <span className="text-slate-400 mx-2">OR</span>

            <span className="w-1.5 h-1.5 bg-navy-900 rounded-full"></span>
            <strong className="font-bold text-navy-900">Passport</strong>
          </span>
        </p>

      </div>

      <div
        className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-300 cursor-pointer
          ${isDragOver
            ? 'border-gold-500 bg-amber-50/30 scale-[1.02]'
            : file
              ? 'border-green-500 bg-green-50/20'
              : 'border-slate-300 hover:border-navy-400 hover:bg-slate-50'
          }`}
        onDragOver={(e) => handleDrag(e, true)}
        onDragLeave={(e) => handleDrag(e, false)}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        {/* Upload Progress Overlay */}
        {uploading && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-2xl">
            <div className="relative w-24 h-24">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="48"
                  cy="48"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  className="text-gray-200"
                />
                <circle
                  cx="48"
                  cy="48"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={251.2}
                  strokeDashoffset={251.2 - (251.2 * uploadProgress) / 100}
                  className="text-green-500 transition-all duration-300 ease-out"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-lg font-bold text-navy-900">
                {Math.round(uploadProgress)}%
              </div>
            </div>
            <p className="mt-4 text-navy-900 font-medium animate-pulse">Uploading securely...</p>
          </div>
        )}
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => e.target.files?.[0] && validateAndSetFile(e.target.files[0])}
          className="hidden"
          accept=".jpg,.jpeg,.png,.heic,.pdf,.doc,.docx"
        />

        <div className="flex flex-col items-center gap-4 py-8">
          {file ? (
            <>
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-2">
                <i className="fas fa-file-check text-2xl text-green-600"></i>
              </div>
              <div>
                <p className="text-lg font-bold text-navy-900">{file.name}</p>
                <p className="text-sm text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB • Ready to upload</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null); }}
                className="mt-4 text-xs uppercase tracking-widest text-red-500 font-bold hover:text-red-700"
              >
                Remove File
              </button>
            </>
          ) : (
            <>
              <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${isDragOver ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                <i className="fas fa-cloud-upload-alt text-3xl"></i>
              </div>
              <div>
                <p className="text-lg font-serif text-navy-900">Drag & Drop your ID here</p>
                <p className="text-sm text-slate-400 mt-2">or click to browse your files</p>
              </div>
            </>
          )}
        </div>
      </div>


      {/* No ID Checkbox - placed just above submit button */}
      <div className="mt-8 bg-slate-50 p-6 rounded-xl border-2 border-slate-300">
        <label className="flex items-start gap-4 cursor-pointer group">
          <div className="relative flex items-center mt-0.5">
            <input
              type="checkbox"
              className="peer h-6 w-6 cursor-pointer appearance-none rounded border-2 border-navy-900 bg-white transition-all checked:border-navy-900 checked:bg-navy-900"
              checked={noIdChecked}
              onChange={(e) => setNoIdChecked(e.target.checked)}
            />
            <div className="pointer-events-none absolute top-2/4 left-2/4 -translate-x-2/4 -translate-y-2/4 text-white opacity-0 transition-opacity peer-checked:opacity-100">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
            </div>
          </div>
          <div className="flex-1">
            <span className="text-sm font-bold text-navy-900 group-hover:text-gold-600 transition-colors">I do NOT hold a Passport or Driving Licence</span>
            {noIdChecked && (
              <div className="mt-3 p-4 bg-yellow-50 border-2 border-yellow-400 rounded-lg slide-up shadow-sm">
                <p className="text-sm text-slate-800 leading-relaxed">
                  If you do not hold a passport or driving licence, please upload a clear photo or screenshot of a <strong className="font-bold">Bank Statement or Utility Bill</strong> dated within the last 4 weeks.
                </p>
              </div>
            )}
          </div>
        </label>
      </div>

      <div className="mt-6">
        <button
          onClick={handleSubmit}
          disabled={!file || uploading}
          className={`w-full py-4 bg-sky-400 text-white font-medium tracking-wide text-lg rounded-lg shadow-xl shadow-sky-400/20 transition-all hover:bg-sky-500 hover:shadow-2xl hover:-translate-y-1
            ${(!file || uploading) ? 'opacity-50 cursor-not-allowed transform-none' : ''}`}
        >
          {uploading ? (
            <span className="flex items-center justify-center gap-2">
              <i className="fas fa-circle-notch fa-spin"></i> Uploading Securely...
            </span>
          ) : 'Finalise Submission'}
        </button>
      </div>
    </div>
  );
};

export default StepTwo;