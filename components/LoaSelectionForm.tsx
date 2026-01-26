import React, { useState, useEffect } from 'react';
import SignaturePad from './IntakeForm/SignaturePad';
import { API_BASE_URL } from '../src/config';
import { Loader2, CheckCircle, AlertCircle, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { LENDER_CATEGORIES } from '../constants';

const LoaSelectionForm = () => {
    // Extract token from URL path
    const pathParts = window.location.pathname.split('/');
    const token = pathParts[pathParts.length - 1];

    const [loading, setLoading] = useState(true);
    const [verifying, setVerifying] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const [clientName, setClientName] = useState('');
    const [initialLender, setInitialLender] = useState('');

    const [selectedLenders, setSelectedLenders] = useState<string[]>([]);
    const [signatureData, setSignatureData] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        // Verify token validity
        verifyToken();
    }, [token]);

    const verifyToken = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/verify-loa-token/${token}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Invalid or expired link');
            }

            setClientName(data.clientName);
            setInitialLender(data.lender);
            // Pre-select the initial lender if desired, but usually they are selecting ADDITIONAL ones
            // Based on user request "select any other lenders", we leave it as is or pre-fill but disabled

            setVerifying(false);
            setLoading(false);
        } catch (err: any) {
            setError(err.message || "Invalid or expired link.");
            setVerifying(false);
            setLoading(false);
        }
    };

    const toggleLender = (lender: string) => {
        if (lender === initialLender) return; // Cannot unselect original
        setSelectedLenders(prev =>
            prev.includes(lender)
                ? prev.filter(l => l !== lender)
                : [...prev, lender]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedLenders.length === 0) {
            alert("Please select at least one additional lender.");
            return;
        }
        if (!signatureData) {
            alert("Please sign the form.");
            return;
        }

        setSubmitting(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/submit-loa-form`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uniqueId: token,
                    selectedLenders,
                    signature2Data: signatureData
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Submission failed');
            }

            setSuccess(true);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (verifying) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-navy-900 mx-auto mb-4" />
                    <p className="text-slate-600">Verifying secure link...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
                <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8 text-red-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-navy-900 mb-2">Link Expired or Invalid</h2>
                    <p className="text-slate-600">{error}</p>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
                <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-8 h-8 text-green-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-navy-900 mb-2">Submission Successful</h2>
                    <p className="text-slate-600">Thank you! We have processed your additional claims.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
            <div className="max-w-3xl mx-auto">
                <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                    {/* Header */}
                    <div className="bg-[#0f172a] px-8 py-6 text-white text-center">
                        <h1 className="text-2xl font-serif tracking-wide mb-2">Additional Lender Selection</h1>
                        <p className="text-slate-400 text-sm">Select any other lenders you wish to claim against.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="p-8">

                        <div className="mb-8">
                            <h3 className="text-lg font-bold text-navy-900 mb-4 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-gold-500" />
                                Select Lenders
                            </h3>
                            <div className="space-y-6">
                                {LENDER_CATEGORIES.map((category, catIdx) => (
                                    <div key={catIdx} className="border border-slate-200 rounded-xl overflow-hidden">
                                        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
                                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                                {category.title}
                                            </h4>
                                        </div>
                                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {category.lenders.map(lender => (
                                                <label
                                                    key={lender}
                                                    className={`
                                                        flex items-center p-3 rounded-lg border transition-all cursor-pointer select-none
                                                        ${selectedLenders.includes(lender)
                                                            ? 'bg-navy-50 border-navy-500 ring-1 ring-navy-500'
                                                            : 'bg-white border-slate-200 hover:border-navy-300'
                                                        }
                                                        ${lender === initialLender ? 'opacity-50 cursor-not-allowed' : ''}
                                                    `}
                                                >
                                                    <div className="relative flex items-center justify-center w-5 h-5 mr-3">
                                                        <input
                                                            type="checkbox"
                                                            className="peer appearance-none w-5 h-5 border-2 border-slate-300 rounded checked:bg-navy-900 checked:border-navy-900 transition-colors"
                                                            checked={selectedLenders.includes(lender) || lender === initialLender}
                                                            onChange={() => lender !== initialLender && toggleLender(lender)}
                                                            disabled={lender === initialLender}
                                                        />
                                                        <CheckCircle className="w-3.5 h-3.5 text-white absolute pointer-events-none opacity-0 peer-checked:opacity-100" />
                                                    </div>
                                                    <span className={`text-sm ${selectedLenders.includes(lender) || lender === initialLender ? 'font-semibold text-navy-900' : 'text-slate-600'}`}>
                                                        {lender}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="mb-8 border-t border-slate-100 pt-8">
                            <h3 className="text-lg font-bold text-navy-900 mb-4">Confirm & Sign</h3>
                            <p className="text-sm text-slate-500 mb-4">Please sign below to authorize us to act on your behalf for these additional claims.</p>
                            <SignaturePad
                                onEnd={setSignatureData}
                                hasError={false}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={submitting}
                            className={`w-full py-4 bg-navy-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-all shadow-lg
                                ${submitting ? 'opacity-75 cursor-not-allowed' : 'hover:shadow-navy-900/20'}
                            `}
                        >
                            {submitting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Processing...
                                </span>
                            ) : (
                                'Submit Additional Claims'
                            )}
                        </button>

                    </form>
                </div>
            </div>
        </div>
    );
};

export default LoaSelectionForm;
