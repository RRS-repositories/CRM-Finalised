import React, { useState, useEffect } from 'react';
import SignaturePad from './IntakeForm/SignaturePad';
import { API_BASE_URL } from '../src/config';
import { Loader2, CheckCircle, AlertCircle, FileText, Mail } from 'lucide-react';
import { LENDER_CATEGORIES, isCategory3Lender } from '../constants';

// Left Panel Component (shared across all states)
const LeftPanel = () => (
    <>
        {/* MOBILE HEADER - Visible only on mobile */}
        <div className="md:hidden bg-[#0f172a] p-6 flex items-center gap-3 shrink-0">
            <img src="/rr-logo.png" alt="Logo" className="w-12 h-12 rounded-full shadow-lg" />
            <div>
                <h1 className="font-serif text-xl tracking-wide text-white">Rowan Rose Solicitors</h1>
                <p className="text-brand-orange text-sm font-semibold">Additional Lenders</p>
            </div>
        </div>

        {/* LEFT PANEL - Branding & Context */}
        <div className="hidden md:flex order-1 md:w-5/12 lg:w-1/3 bg-[#0f172a] text-white flex-col justify-between shrink-0 shadow-2xl z-20 relative overflow-y-auto">
            {/* Decorative Background Elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 pointer-events-none"></div>

            <div className="relative z-10 h-full flex flex-col p-8 md:p-12">
                {/* Desktop Logo */}
                <div className="flex flex-col items-start gap-2 mb-8 shrink-0">
                    <div className="flex items-center gap-3">
                        <img src="/rr-logo.png" alt="Logo" className="w-16 h-16 rounded-full shadow-lg" />
                        <h1 className="font-serif text-2xl tracking-wide">Rowan Rose Solicitors</h1>
                    </div>
                    <h2 className="text-3xl font-bold text-brand-orange tracking-tight">Additional Lenders</h2>
                </div>

                <div className="flex-1">
                    <h2 className="text-2xl font-serif font-light leading-tight mb-4 text-brand-orange">
                        Multi Discipline Law Firm in the Heart of Manchester
                    </h2>
                    <p className="text-slate-300 font-light leading-relaxed text-sm mb-8 border-l-2 border-slate-700 pl-4">
                        Rowan Rose is a high-end boutique law firm committed to delivering the highest quality of service and advice.
                    </p>

                    <h3 className="text-lg font-serif text-white mb-6 border-b border-slate-700 pb-2">Why Choose Us</h3>

                    <div className="space-y-4">
                        <div className="flex gap-4 items-start">
                            <div className="mt-1 w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700">
                                <i className="fas fa-scale-balanced text-brand-orange text-lg"></i>
                            </div>
                            <div>
                                <h4 className="text-brand-orange font-medium text-base mb-1">Expertise</h4>
                                <p className="text-slate-400 text-xs leading-relaxed">We have the expertise to handle a wide range of legal matters, backed by decades of experience.</p>
                            </div>
                        </div>

                        <div className="flex gap-4 items-start">
                            <div className="mt-1 w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700">
                                <i className="fas fa-bullseye text-brand-orange text-lg"></i>
                            </div>
                            <div>
                                <h4 className="text-brand-orange font-medium text-base mb-1">Accuracy</h4>
                                <p className="text-slate-400 text-xs leading-relaxed">We have the ability to provide accurate, comprehensive and detailed legal advice at the right time.</p>
                            </div>
                        </div>

                        <div className="flex gap-4 items-start">
                            <div className="mt-1 w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700">
                                <i className="fas fa-shield-halved text-brand-orange text-lg"></i>
                            </div>
                            <div>
                                <h4 className="text-brand-orange font-medium text-base mb-1">Reliability</h4>
                                <p className="text-slate-400 text-xs leading-relaxed">Understanding the aspects of the law and are well-versed in providing reliable advice.</p>
                            </div>
                        </div>

                        <div className="flex gap-4 items-start">
                            <div className="mt-1 w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700">
                                <i className="fas fa-sterling-sign text-brand-orange text-lg"></i>
                            </div>
                            <div>
                                <h4 className="text-brand-orange font-medium text-base mb-1">Cost Effective</h4>
                                <p className="text-slate-400 text-xs leading-relaxed">We provide the best value services without compromising on quality.</p>
                            </div>
                        </div>
                    </div>

                    {/* Contact Info */}
                    <div className="mt-10 border-t border-slate-700 pt-7">
                        <div className="space-y-4">
                            <div className="flex items-center gap-4 group">
                                <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700 group-hover:border-brand-orange transition-colors">
                                    <i className="fas fa-envelope text-brand-orange text-lg"></i>
                                </div>
                                <a href="mailto:info@rowanrose.co.uk" className="text-white hover:text-brand-orange transition-colors text-sm">
                                    info@rowanrose.co.uk
                                </a>
                            </div>
                            <div className="flex items-center gap-4 group">
                                <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700 group-hover:border-brand-orange transition-colors">
                                    <i className="fas fa-phone text-brand-orange text-lg"></i>
                                </div>
                                <a href="tel:01615330444" className="text-white hover:text-brand-orange transition-colors text-sm">
                                    0161 533 0444
                                </a>
                            </div>
                            <div className="flex items-center gap-4 group">
                                <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700 group-hover:border-brand-orange transition-colors">
                                    <i className="fas fa-location-dot text-brand-orange text-lg"></i>
                                </div>
                                <span className="text-white text-sm">Manchester, United Kingdom</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </>
);

// Success Screen Component (no countdown)
const SuccessScreen = ({ pendingConfirmationLenders }: { pendingConfirmationLenders: string[] }) => {
    return (
        <div className="min-h-screen w-full bg-slate-50 font-sans flex flex-col md:flex-row">
            <LeftPanel />
            <div className="order-2 flex-1 flex items-center justify-center p-6">
                <div className="bg-white p-10 rounded-2xl shadow-xl max-w-md w-full text-center">
                    {/* Animated Success Icon */}
                    <div className="relative mx-auto mb-6">
                        <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                            <CheckCircle className="w-14 h-14 text-green-600" />
                        </div>
                    </div>

                    <h2 className="text-3xl font-bold text-slate-800 mb-3">Thank You!</h2>
                    <p className="text-slate-600 text-lg mb-4">
                        Your submission has been received successfully.
                    </p>

                    {/* Show pending confirmation message if any Category 3 lenders */}
                    {pendingConfirmationLenders.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                            <div className="flex items-center justify-center gap-2 mb-2">
                                <Mail className="w-5 h-5 text-amber-600" />
                                <span className="font-semibold text-amber-800">Confirmation Required</span>
                            </div>
                            <p className="text-sm text-amber-700">
                                We've sent you a confirmation email for the following lender(s):
                                <br />
                                <strong>{pendingConfirmationLenders.join(', ')}</strong>
                                <br />
                                Please check your email and confirm to proceed with these claims.
                            </p>
                        </div>
                    )}

                    <a
                        href="https://www.rowanrose.co.uk"
                        className="inline-block px-8 py-3 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition-all font-medium"
                    >
                        Visit Our Website
                    </a>
                </div>
            </div>
        </div>
    );
};

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

    // Category 3 lenders that need email confirmation
    const [pendingConfirmationLenders, setPendingConfirmationLenders] = useState<string[]>([]);

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
            // Identify Category 3 lenders that will need email confirmation
            const category3Selected = selectedLenders.filter(lender => isCategory3Lender(lender));

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

            // Track Category 3 lenders for success message
            setPendingConfirmationLenders(category3Selected);
            setSuccess(true);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (verifying) {
        return (
            <div className="min-h-screen w-full bg-slate-50 font-sans flex flex-col md:flex-row">
                <LeftPanel />
                <div className="order-2 flex-1 flex items-center justify-center p-6">
                    <div className="text-center">
                        <Loader2 className="w-12 h-12 animate-spin text-slate-700 mx-auto mb-4" />
                        <p className="text-slate-600 text-lg">Verifying secure link...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen w-full bg-slate-50 font-sans flex flex-col md:flex-row">
                <LeftPanel />
                <div className="order-2 flex-1 flex items-center justify-center p-6">
                    <div className="bg-white p-10 rounded-2xl shadow-xl max-w-md w-full text-center">
                        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <AlertCircle className="w-10 h-10 text-red-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-800 mb-3">Link Expired or Invalid</h2>
                        <p className="text-slate-600 mb-8">{error}</p>
                        <a
                            href="https://www.rowanrose.co.uk"
                            className="inline-block px-8 py-3 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition-all font-medium"
                        >
                            Visit Our Website
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    if (success) {
        return <SuccessScreen pendingConfirmationLenders={pendingConfirmationLenders} />;
    }

    return (
        <div className="min-h-screen w-full bg-slate-50 font-sans flex flex-col md:flex-row">
            <LeftPanel />

            {/* RIGHT PANEL - Form Content */}
            <div className="order-2 flex-1 overflow-y-auto">
                <div className="p-6 md:p-12">
                    <div className="max-w-3xl mx-auto">
                        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                            {/* Header */}
                            <div className="bg-slate-800 px-8 py-6 text-white text-center">
                                <h1 className="text-xl font-serif tracking-wide mb-1">Additional Lender Selection</h1>
                                <p className="text-slate-400 text-sm">Select any other lenders you wish to claim against</p>
                            </div>

                            <form onSubmit={handleSubmit} className="p-6 md:p-8">

                                <div className="mb-8">
                                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-brand-orange" />
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
                                                <div className="p-4 grid grid-cols-1 gap-3">
                                                    {category.lenders.map(lender => (
                                                        <label
                                                            key={lender}
                                                            className={`
                                                                flex items-center p-4 rounded-xl border-2 transition-all cursor-pointer select-none
                                                                ${selectedLenders.includes(lender)
                                                                    ? 'bg-slate-50 border-slate-800 ring-1 ring-slate-800'
                                                                    : 'bg-white border-slate-200 hover:border-slate-400'
                                                                }
                                                                ${lender === initialLender ? 'opacity-50 cursor-not-allowed' : ''}
                                                            `}
                                                        >
                                                            {/* 2x bigger checkbox (w-12 h-12 = 48px) */}
                                                            <div className="relative flex items-center justify-center w-12 h-12 mr-4 shrink-0">
                                                                <input
                                                                    type="checkbox"
                                                                    className="peer appearance-none w-12 h-12 border-2 border-slate-300 rounded-lg checked:bg-slate-800 checked:border-slate-800 transition-colors cursor-pointer"
                                                                    checked={selectedLenders.includes(lender) || lender === initialLender}
                                                                    onChange={() => lender !== initialLender && toggleLender(lender)}
                                                                    disabled={lender === initialLender}
                                                                />
                                                                <CheckCircle className="w-7 h-7 text-white absolute pointer-events-none opacity-0 peer-checked:opacity-100" />
                                                            </div>
                                                            <span className={`text-base ${selectedLenders.includes(lender) || lender === initialLender ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                                                                {lender}
                                                            </span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="mb-8 border-t border-slate-200 pt-8">
                                    <h3 className="text-lg font-bold text-slate-800 mb-4">Confirm & Sign</h3>
                                    <p className="text-sm text-slate-500 mb-4">Please sign below to authorize us to act on your behalf for these additional claims.</p>
                                    <SignaturePad
                                        onEnd={setSignatureData}
                                        hasError={false}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className={`w-full py-4 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-all shadow-lg
                                        ${submitting ? 'opacity-75 cursor-not-allowed' : ''}
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
            </div>
        </div>
    );
};

export default LoaSelectionForm;
