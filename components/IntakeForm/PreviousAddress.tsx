
import React, { useState, useEffect, useRef } from 'react';
import { submitPreviousAddress } from '../../services/intakeApi';

interface Address {
    address_line_1: string;
    address_line_2: string;
    city: string;
    county: string;
    postal_code: string;
}

interface PreviousAddressProps {
    clientId: string | number;
    onNext: () => void;
}

declare global {
    interface Window {
        google: any;
        initGoogleMaps?: () => void;
    }
}

const PreviousAddress: React.FC<PreviousAddressProps> = ({ clientId, onNext }) => {
    const [hasPreviousAddress, setHasPreviousAddress] = useState<boolean | null>(null);
    const [addresses, setAddresses] = useState<Address[]>([
        { address_line_1: '', address_line_2: '', city: '', county: '', postal_code: '' }
    ]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [scriptLoaded, setScriptLoaded] = useState(false);

    // Refs for autocomplete inputs
    const autocompleteRefs = useRef<{ [key: number]: any }>({});
    const inputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

    // Load Google Maps Script
    useEffect(() => {
        const loadScript = () => {
            if (window.google && window.google.maps) {
                setScriptLoaded(true);
                return;
            }

            const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
            if (existingScript) {
                existingScript.addEventListener('load', () => setScriptLoaded(true));
                return;
            }

            const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
            if (!apiKey) {
                console.warn("Google Maps API Key provided but script loading skipped as key might be empty initially.");
                // We don't error out, allowing manual entry
                return;
            }

            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
            script.async = true;
            script.defer = true;
            script.onload = () => setScriptLoaded(true);
            document.head.appendChild(script);
        };

        loadScript();
    }, []);

    // Initialize Autocomplete for each address field
    useEffect(() => {
        if (!scriptLoaded || !hasPreviousAddress) return;

        addresses.forEach((_, index) => {
            if (inputRefs.current[index] && !autocompleteRefs.current[index]) {
                const autocomplete = new window.google.maps.places.Autocomplete(
                    inputRefs.current[index],
                    { types: ['address'], componentRestrictions: { country: 'gb' } }
                );

                autocomplete.addListener('place_changed', () => {
                    const place = autocomplete.getPlace();
                    fillInAddress(place, index);
                });

                autocompleteRefs.current[index] = autocomplete;
            }
        });
    }, [scriptLoaded, hasPreviousAddress, addresses.length]);

    const fillInAddress = (place: any, index: number) => {
        const addressComponents = place.address_components;
        let address1 = '';
        let postcode = '';
        let city = '';
        let county = '';
        let streetNumber = '';
        let route = '';

        if (addressComponents) {
            for (const component of addressComponents) {
                const componentType = component.types[0];

                switch (componentType) {
                    case 'street_number':
                        streetNumber = component.long_name;
                        break;
                    case 'route':
                        route = component.long_name;
                        break;
                    case 'postal_code':
                        postcode = component.long_name;
                        break;
                    case 'postal_town':
                    case 'locality':
                        city = component.long_name;
                        break;
                    case 'administrative_area_level_2':
                        county = component.long_name;
                        break;
                }
            }
            address1 = `${streetNumber} ${route}`.trim();
        }

        const newAddresses = [...addresses];
        newAddresses[index] = {
            ...newAddresses[index],
            address_line_1: address1,
            city: city,
            county: county,
            postal_code: postcode
        };
        setAddresses(newAddresses);
    };

    const handleAddressChange = (index: number, field: keyof Address, value: string) => {
        const newAddresses = [...addresses];
        newAddresses[index] = { ...newAddresses[index], [field]: value };
        setAddresses(newAddresses);
    };

    const addAddress = () => {
        setAddresses([...addresses, { address_line_1: '', address_line_2: '', city: '', county: '', postal_code: '' }]);
    };

    const removeAddress = (index: number) => {
        const newAddresses = addresses.filter((_, i) => i !== index);
        setAddresses(newAddresses);

        // Cleanup ref
        if (autocompleteRefs.current[index]) {
            // Google maps doesn't have a specific destroy method for autocomplete, but we remove the reference
            delete autocompleteRefs.current[index];
        }
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        setError(null);
        console.log('PreviousAddress: Starting submission...');
        console.log('PreviousAddress: clientId', clientId);
        console.log('PreviousAddress: hasPreviousAddress', hasPreviousAddress);
        console.log('PreviousAddress: addresses', addresses);

        try {
            const addressesToSend = hasPreviousAddress ? addresses : [];
            console.log('PreviousAddress: Sending payload:', { clientId, addresses: addressesToSend });

            if (hasPreviousAddress) {
                for (const addr of addresses) {
                    if (!addr.address_line_1 || !addr.city || !addr.postal_code) {
                        setError("Please fill in all required fields (Address Line 1, City, Postcode) for all addresses.");
                        setSubmitting(false);
                        return;
                    }
                }
            }

            const response = await submitPreviousAddress({
                clientId,
                addresses: addressesToSend
            });
            console.log('PreviousAddress: Submission response:', response);

            onNext();
        } catch (err: any) {
            console.error('PreviousAddress: Submission error:', err);
            setError(err.message || 'Failed to submit previous address');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fade-in max-w-2xl mx-auto">
            <div className="text-center mb-8">
                <h2 className="text-3xl font-serif text-navy-900 mb-3">Previous Address History</h2>
                <p className="text-slate-500">
                    Have you lived at any other address in the last 10 years that the lender would have registered at?
                </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 mb-8">
                <div className="flex gap-4 justify-center">
                    <button
                        onClick={() => setHasPreviousAddress(true)}
                        className={`px-6 py-3 rounded-lg border-2 transition-all font-medium ${hasPreviousAddress === true
                            ? 'border-navy-900 bg-navy-900 text-white'
                            : 'border-slate-300 bg-white text-slate-600 hover:border-navy-900'
                            }`}
                    >
                        Yes
                    </button>
                    <button
                        onClick={() => setHasPreviousAddress(false)}
                        className={`px-6 py-3 rounded-lg border-2 transition-all font-medium ${hasPreviousAddress === false
                            ? 'border-navy-900 bg-navy-900 text-white'
                            : 'border-slate-300 bg-white text-slate-600 hover:border-navy-900'
                            }`}
                    >
                        No
                    </button>
                </div>
            </div>

            {hasPreviousAddress === true && (
                <div className="space-y-6 slide-up">
                    {addresses.map((addr, index) => (
                        <div key={index} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-navy-900">Address {index + 1}</h3>
                                {addresses.length > 1 && (
                                    <button onClick={() => removeAddress(index)} className="text-red-500 text-sm font-medium hover:text-red-700">
                                        Remove
                                    </button>
                                )}
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm font-bold text-brand-orange mb-1">
                                    ADDRESS LOOKUP (START TYPING)
                                </label>
                                <input
                                    ref={el => inputRefs.current[index] = el}
                                    type="text"
                                    placeholder="Start typing to search..."
                                    className="w-full p-3 rounded-lg border-2 border-brand-orange/30 focus:border-brand-orange focus:ring-1 focus:ring-brand-orange outline-none transition-all"
                                />
                                <p className="text-xs text-slate-400 mt-1">Select an address from the dropdown to auto-fill the fields below.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Address Line 1 *</label>
                                    <input
                                        type="text"
                                        value={addr.address_line_1}
                                        onChange={(e) => handleAddressChange(index, 'address_line_1', e.target.value)}
                                        className="w-full p-3 rounded-lg border border-slate-300 focus:border-navy-900 focus:ring-1 focus:ring-navy-900 outline-none transition-all"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Address Line 2</label>
                                    <input
                                        type="text"
                                        value={addr.address_line_2}
                                        onChange={(e) => handleAddressChange(index, 'address_line_2', e.target.value)}
                                        className="w-full p-3 rounded-lg border border-slate-300 focus:border-navy-900 focus:ring-1 focus:ring-navy-900 outline-none transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">City / Town *</label>
                                    <input
                                        type="text"
                                        value={addr.city}
                                        onChange={(e) => handleAddressChange(index, 'city', e.target.value)}
                                        className="w-full p-3 rounded-lg border border-slate-300 focus:border-navy-900 focus:ring-1 focus:ring-navy-900 outline-none transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">County</label>
                                    <input
                                        type="text"
                                        value={addr.county}
                                        onChange={(e) => handleAddressChange(index, 'county', e.target.value)}
                                        className="w-full p-3 rounded-lg border border-slate-300 focus:border-navy-900 focus:ring-1 focus:ring-navy-900 outline-none transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Postcode *</label>
                                    <input
                                        type="text"
                                        value={addr.postal_code}
                                        onChange={(e) => handleAddressChange(index, 'postal_code', e.target.value)}
                                        className="w-full p-3 rounded-lg border border-slate-300 focus:border-navy-900 focus:ring-1 focus:ring-navy-900 outline-none transition-all"
                                    />
                                </div>
                            </div>
                        </div>
                    ))}

                    <button
                        onClick={addAddress}
                        className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-medium hover:border-navy-900 hover:text-navy-900 transition-all"
                    >
                        + Add Another Address
                    </button>
                </div>
            )}

            {error && (
                <div className="mt-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-r">
                    {error}
                </div>
            )}

            <div className="mt-8">
                <button
                    onClick={handleSubmit}
                    disabled={hasPreviousAddress === null || submitting}
                    className={`w-full py-4 bg-navy-900 text-white font-medium tracking-wide text-lg shadow-xl shadow-navy-900/10 transition-all hover:bg-slate-800 hover:shadow-2xl hover:-translate-y-1 rounded-xl
            ${(hasPreviousAddress === null || submitting) ? 'opacity-50 cursor-not-allowed transform-none' : ''}`}
                >
                    {submitting ? (
                        <span className="flex items-center justify-center gap-2">
                            <i className="fas fa-circle-notch fa-spin"></i> Processing...
                        </span>
                    ) : 'Continue'}
                </button>
            </div>
        </div>
    );
};

export default PreviousAddress;
