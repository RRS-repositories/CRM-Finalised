import React from 'react';

const ErrorPage: React.FC = () => {
    return (
        <div className="min-h-screen w-full bg-gradient-to-br from-navy-900 via-slate-800 to-navy-900 flex items-center justify-center p-6">
            <div className="max-w-2xl w-full bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 md:p-12 text-center slide-up">

                {/* Error Icon */}
                <div className="mb-6 flex justify-center">
                    <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
                        <i className="fas fa-exclamation-triangle text-red-600 text-4xl"></i>
                    </div>
                </div>

                {/* Error Message */}
                <h1 className="text-3xl md:text-4xl font-serif text-navy-900 mb-4">
                    Oops! Something Went Wrong
                </h1>

                <p className="text-slate-600 text-lg mb-8 leading-relaxed">
                    We encountered an unexpected error while processing your request.
                    Our team has been notified and we're working to fix it.
                </p>

                {/* Action Button */}
                <a
                    href="https://www.rowanrose.co.uk/"
                    className="inline-flex items-center gap-3 bg-gradient-to-r from-gold-500 to-gold-600 text-white px-8 py-4 rounded-lg font-medium text-lg hover:from-gold-600 hover:to-gold-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                    <i className="fas fa-home"></i>
                    <span>Explore Rowan Rose</span>
                </a>

                {/* Additional Help */}
                <div className="mt-8 pt-8 border-t border-slate-200">
                    <p className="text-slate-500 text-sm mb-3">
                        Need immediate assistance?
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                        <a
                            href="tel:+441234567890"
                            className="text-navy-900 hover:text-gold-600 transition-colors flex items-center gap-2"
                        >
                            <i className="fas fa-phone"></i>
                            <span>Call Us</span>
                        </a>
                        <span className="hidden sm:inline text-slate-300">|</span>
                        <a
                            href="mailto:info@rowanrose.co.uk"
                            className="text-navy-900 hover:text-gold-600 transition-colors flex items-center gap-2"
                        >
                            <i className="fas fa-envelope"></i>
                            <span>Email Us</span>
                        </a>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default ErrorPage;
