import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../src/config';
import { Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

const LenderConfirmation = () => {
    const pathParts = window.location.pathname.split('/');
    const token = pathParts[pathParts.length - 1];

    const [loading, setLoading] = useState(true);
    const [confirming, setConfirming] = useState(false);
    const [status, setStatus] = useState<'pending' | 'confirmed' | 'rejected' | 'expired' | 'already_used'>('pending');
    const [lenderName, setLenderName] = useState('');
    const [alternativeName, setAlternativeName] = useState('');
    const [clientName, setClientName] = useState('');
    const [action, setAction] = useState<'confirm' | 'reject'>('confirm');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        verifyToken();
    }, [token]);

    const verifyToken = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/verify-lender-token/${token}`);
            const data = await response.json();

            if (!response.ok) {
                if (data.used) {
                    setStatus('already_used');
                } else {
                    setStatus('expired');
                }
                setError(data.message);
                setLoading(false);
                return;
            }

            setLenderName(data.lender);
            setAlternativeName(data.alternative || data.lender);
            setClientName(data.clientName);
            setAction(data.action);
            setLoading(false);
        } catch (err: any) {
            setError('Unable to verify link. Please try again.');
            setStatus('expired');
            setLoading(false);
        }
    };

    const handleConfirm = async (userAction: 'yes' | 'no') => {
        setConfirming(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/process-lender-confirmation/${token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userAction })
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to process confirmation');
            }

            if (userAction === 'yes') {
                setStatus('confirmed');
            } else {
                setStatus('rejected');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setConfirming(false);
        }
    };

    // Left Panel Component (shared across all states)
    const LeftPanel = () => (
        <>
            {/* MOBILE HEADER - Visible only on mobile */}
            <div className="md:hidden bg-[#0f172a] p-6 flex items-center gap-3 shrink-0">
                <img src="/rr-logo.png" alt="Logo" className="w-12 h-12 rounded-full shadow-lg" />
                <div>
                    <h1 className="font-serif text-xl tracking-wide text-white">Rowan Rose Solicitors</h1>
                    <p className="text-brand-orange text-sm font-semibold">Lender Confirmation</p>
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
                        <h2 className="text-3xl font-bold text-brand-orange tracking-tight">Lender Confirmation</h2>
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

    if (loading) {
        return (
            <div className="min-h-screen w-full bg-slate-50 font-sans flex flex-col md:flex-row">
                <LeftPanel />
                <div className="order-2 flex-1 flex items-center justify-center p-6">
                    <div className="text-center">
                        <Loader2 className="w-12 h-12 animate-spin text-slate-700 mx-auto mb-4" />
                        <p className="text-slate-600 text-lg">Verifying your link...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (status === 'expired' || status === 'already_used') {
        return (
            <div className="min-h-screen w-full bg-slate-50 font-sans flex flex-col md:flex-row">
                <LeftPanel />
                <div className="order-2 flex-1 flex items-center justify-center p-6">
                    <div className="bg-white p-10 rounded-2xl shadow-xl max-w-md w-full text-center">
                        <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <AlertTriangle className="w-10 h-10 text-amber-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-800 mb-3">
                            {status === 'already_used' ? 'Already Processed' : 'Link Expired'}
                        </h2>
                        <p className="text-slate-600 mb-8">
                            {status === 'already_used'
                                ? 'This confirmation has already been processed. No further action is needed.'
                                : 'This link is no longer valid. Please contact us if you need assistance.'}
                        </p>
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

    if (status === 'confirmed') {
        return (
            <div className="min-h-screen w-full bg-slate-50 font-sans flex flex-col md:flex-row">
                <LeftPanel />
                <div className="order-2 flex-1 flex items-center justify-center p-6">
                    <div className="bg-white p-10 rounded-2xl shadow-xl max-w-md w-full text-center">
                        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckCircle className="w-10 h-10 text-emerald-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-800 mb-3">Claim Created</h2>
                        <p className="text-slate-600 mb-2">
                            Your claim against <strong className="text-slate-800">{lenderName}</strong> has been created successfully.
                        </p>
                        <p className="text-slate-500 text-sm mb-8">
                            We'll be in touch with updates on your case.
                        </p>
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

    if (status === 'rejected') {
        return (
            <div className="min-h-screen w-full bg-slate-50 font-sans flex flex-col md:flex-row">
                <LeftPanel />
                <div className="order-2 flex-1 flex items-center justify-center p-6">
                    <div className="bg-white p-10 rounded-2xl shadow-xl max-w-md w-full text-center">
                        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <XCircle className="w-10 h-10 text-slate-500" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-800 mb-3">No Claim Created</h2>
                        <p className="text-slate-600 mb-2">
                            No claim has been created for <strong className="text-slate-800">{lenderName}</strong>.
                        </p>
                        <p className="text-slate-500 text-sm mb-8">
                            If you believe this was a mistake, please contact us.
                        </p>
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

    // Pending state - show confirmation UI
    return (
        <div className="min-h-screen w-full bg-slate-50 font-sans flex flex-col md:flex-row">
            <LeftPanel />

            {/* RIGHT PANEL - Form Content */}
            <div className="order-2 flex-1 flex items-center justify-center p-6 md:p-12 overflow-y-auto">
                <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden">
                    {/* Header */}
                    <div className="bg-slate-800 px-8 py-6 text-center">
                        <h1 className="text-xl font-serif text-white tracking-wide">Confirm Your Selection</h1>
                        <p className="text-slate-400 text-sm mt-1">Hi {clientName.split(' ')[0]}, please confirm your lender</p>
                    </div>

                    <div className="p-8">
                        {/* Lender Display */}
                        <div className="bg-slate-50 rounded-xl p-6 text-center mb-6">
                            <p className="text-slate-500 text-sm mb-2">You selected:</p>
                            <p className="text-2xl font-bold text-slate-800">{lenderName}</p>
                        </div>

                        <p className="text-slate-600 text-center mb-6">
                            Is this the correct lender for your claim?
                        </p>

                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 text-center">
                                {error}
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="space-y-3">
                            <button
                                onClick={() => handleConfirm('yes')}
                                disabled={confirming}
                                className="w-full py-4 px-6 bg-slate-800 text-white rounded-xl font-semibold hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {confirming ? (
                                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                                ) : (
                                    <>
                                        <span className="block text-lg">{lenderName}</span>
                                        <span className="text-slate-400 font-normal text-sm">Create my claim</span>
                                    </>
                                )}
                            </button>

                            <button
                                onClick={() => handleConfirm('no')}
                                disabled={confirming}
                                className="w-full py-4 px-6 bg-white border-2 border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span className="block text-lg">{alternativeName}</span>
                                <span className="text-slate-400 font-normal text-sm">Don't create a claim</span>
                            </button>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="bg-slate-50 px-8 py-4 text-center border-t border-slate-100">
                        <p className="text-slate-500 text-sm">
                            Need help? Call us at <strong>0161 533 0444</strong>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LenderConfirmation;
