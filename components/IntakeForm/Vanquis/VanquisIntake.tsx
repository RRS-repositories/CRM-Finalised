import React, { useState, useEffect } from 'react';
import StepOne from './VanquisForm'; // Assuming VanquisForm is the StepOne for Vanquis
import PreviousAddress from '../PreviousAddress';
import StepTwo from '../StepTwo'; // Assuming StepTwo is shared from parent
import Terms from './Terms';
import ErrorBoundary from '../ErrorBoundary';
import { Page1Response } from '../../../types';

const ClientIntake: React.FC = () => {
    const [step, setStep] = useState<number>(1);
    const [clientData, setClientData] = useState<any>(null);
    const [view, setView] = useState<'form' | 'terms'>('form');
    const [formData, setFormData] = useState<any>({
        country_code: '+44'
    });

    // Simple Hash Router for Terms page
    useEffect(() => {
        const handleHashChange = () => {
            if (window.location.hash === '#terms') {
                setView('terms');
                window.scrollTo(0, 0);
            } else {
                setView('form');
            }
        };

        handleHashChange();
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);

    const handleStep1Success = (data: Page1Response) => {
        setClientData(data);
        setStep(2); // Go to Previous Address
    };

    const handlePreviousAddressSuccess = () => {
        setStep(3); // Go to Documents
    };

    if (view === 'terms') {
        return <Terms formData={formData} />;
    }

    return (
        <ErrorBoundary>
            <div className="min-h-screen w-full bg-slate-50 font-sans flex flex-col md:flex-row">

                {/* MOBILE HEADER - Visible only on mobile */}
                <div className="md:hidden bg-[#0f172a] p-6 flex items-center gap-3 shrink-0">
                    <img src="/rr-logo.png" alt="Logo" className="w-12 h-12 rounded-full shadow-lg" />
                    <h1 className="font-serif text-2xl tracking-wide text-white">Rowan Rose Solicitors</h1>
                </div>

                {/* LEFT PANEL - Branding & Context */}
                <div className="order-3 md:order-1 md:w-5/12 lg:w-1/3 bg-[#0f172a] text-white flex flex-col justify-between shrink-0 shadow-2xl z-20 relative overflow-y-auto">
                    {/* Decorative Background Elements (Desktop Only) */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 pointer-events-none hidden md:block"></div>
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 pointer-events-none hidden md:block"></div>

                    <div className="relative z-10 h-full flex flex-col p-8 md:p-12">
                        {/* Desktop Logo (Hidden on Mobile) */}
                        <div className="hidden md:flex items-center gap-3 mb-8 shrink-0">
                            <img src="/rr-logo.png" alt="Logo" className="w-16 h-16 rounded-full shadow-lg" />
                            <h1 className="font-serif text-3xl tracking-wide">Rowan Rose Solicitors</h1>
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
                                </div>
                            </div>

                        </div>

                        {/* Location / Map */}
                        <div className="mt-8 pt-4 border-t border-slate-800 w-full">
                            <div className="rounded-xl overflow-hidden shadow-lg border border-slate-700 h-[200px]">
                                <iframe
                                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2656.6080394027376!2d-2.2841397875980527!3d53.46533976569785!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x487bb1be4045833f%3A0x8c6f32074438a7eb!2sRowan%20Rose%20Solicitors%20Ltd!5e1!3m2!1sen!2sin!4v1768378150706!5m2!1sen!2sin"
                                    width="100%"
                                    height="100%"
                                    style={{ border: 0 }}
                                    allowFullScreen={true}
                                    loading="lazy"
                                    referrerPolicy="no-referrer-when-downgrade"
                                    title="Location"
                                ></iframe>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT PANEL - Scrollable Form Area */}
                <div className="order-2 md:order-2 flex-1 bg-white relative overflow-y-auto">
                    <div className="max-w-4xl mx-auto p-6 md:p-12 lg:p-16 flex flex-col min-h-full justify-center">

                        {step === 1 && (
                            <StepOne
                                onSuccess={handleStep1Success}
                                formData={formData}
                                setFormData={setFormData}
                            />
                        )}

                        {step === 2 && clientData && (
                            <PreviousAddress
                                clientId={clientData.contact_id}
                                onNext={handlePreviousAddressSuccess}
                            />
                        )}

                        {step === 3 && clientData && (
                            <StepTwo
                                clientId={clientData.contact_id}
                                folderName={clientData.folder_path}
                                firstName={formData.first_name || ''}
                                lastName={formData.last_name || ''}
                            />
                        )}

                    </div>
                </div>
            </div>
        </ErrorBoundary>
    );
};

export default ClientIntake;
