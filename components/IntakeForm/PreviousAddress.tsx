
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

    // Address lookup state for each address (like StepOne)
    const [addressQueries, setAddressQueries] = useState<{ [key: number]: string }>({});
    const [addressSuggestions, setAddressSuggestions] = useState<{ [key: number]: any[] }>({});
    const [showSuggestions, setShowSuggestions] = useState<{ [key: number]: boolean }>({});
    const [loadingAddress, setLoadingAddress] = useState<{ [key: number]: boolean }>({});

    // Refs for Google Services
    const autocompleteService = useRef<any>(null);
    const placesService = useRef<any>(null);
    const searchTimeoutRefs = useRef<{ [key: number]: any }>({});

    // Initialize Google Maps Services
    useEffect(() => {
        let attempts = 0;
        const intervalId = setInterval(() => {
            attempts++;
            if (window.google && window.google.maps && window.google.maps.places) {
                if (!autocompleteService.current) {
                    try {
                        autocompleteService.current = new window.google.maps.places.AutocompleteService();
                        placesService.current = new window.google.maps.places.PlacesService(document.createElement('div'));
                        console.log("Google Maps Services Initialized Successfully (PreviousAddress)");
                    } catch (e) {
                        console.error("Error initializing Google Maps services:", e);
                    }
                }
                clearInterval(intervalId);
            } else if (attempts > 20) {
                console.warn("Google Maps script not loaded after 10 seconds.");
                clearInterval(intervalId);
            }
        }, 500);

        return () => clearInterval(intervalId);
    }, []);

    // Handle address search (like StepOne)
    const handleAddressSearch = (index: number, query: string) => {
        setAddressQueries(prev => ({ ...prev, [index]: query }));
        setShowSuggestions(prev => ({ ...prev, [index]: true }));

        if (searchTimeoutRefs.current[index]) clearTimeout(searchTimeoutRefs.current[index]);

        if (query.length > 2) {
            setLoadingAddress(prev => ({ ...prev, [index]: true }));
            searchTimeoutRefs.current[index] = setTimeout(() => {
                if (!autocompleteService.current) {
                    console.warn("Autocomplete service not initialized yet.");
                    setLoadingAddress(prev => ({ ...prev, [index]: false }));
                    return;
                }

                const request = {
                    input: query,
                    componentRestrictions: { country: 'gb' },
                };

                autocompleteService.current.getPlacePredictions(request, (predictions: any[], status: any) => {
                    setLoadingAddress(prev => ({ ...prev, [index]: false }));
                    if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
                        setAddressSuggestions(prev => ({ ...prev, [index]: predictions.slice(0, 4) }));
                    } else {
                        setAddressSuggestions(prev => ({ ...prev, [index]: [] }));
                    }
                });
            }, 300);
        } else {
            setAddressSuggestions(prev => ({ ...prev, [index]: [] }));
            setLoadingAddress(prev => ({ ...prev, [index]: false }));
        }
    };

    // Handle address selection (like StepOne)
    const handleSelectAddress = (index: number, suggestion: any) => {
        setAddressQueries(prev => ({ ...prev, [index]: suggestion.description }));
        setShowSuggestions(prev => ({ ...prev, [index]: false }));
        setLoadingAddress(prev => ({ ...prev, [index]: true }));

        if (!placesService.current) {
            setLoadingAddress(prev => ({ ...prev, [index]: false }));
            return;
        }

        const request = {
            placeId: suggestion.place_id,
            fields: ['address_components']
        };

        placesService.current.getDetails(request, (place: any, status: any) => {
            setLoadingAddress(prev => ({ ...prev, [index]: false }));
            if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
                let streetNumber = '';
                let route = '';
                let postalTown = '';
                let locality = '';
                let subpremise = '';
                let county = '';
                let postalCode = '';

                place.address_components.forEach((component: any) => {
                    const types = component.types;
                    if (types.includes('subpremise')) subpremise = component.long_name;
                    if (types.includes('street_number')) streetNumber = component.long_name;
                    if (types.includes('route')) route = component.long_name;
                    if (types.includes('postal_town')) postalTown = component.long_name;
                    if (types.includes('locality')) locality = component.long_name;
                    if (types.includes('administrative_area_level_2')) county = component.long_name;
                    if (types.includes('administrative_area_level_1') && !county) county = component.long_name;
                    if (types.includes('postal_code')) postalCode = component.long_name;
                });

                const fullStreet = [subpremise, streetNumber, route].filter(Boolean).join(' ');
                const city = postalTown || locality;

                const newAddresses = [...addresses];
                newAddresses[index] = {
                    ...newAddresses[index],
                    address_line_1: fullStreet,
                    address_line_2: '',
                    city: city,
                    county: county,
                    postal_code: postalCode
                };
                setAddresses(newAddresses);
            }
        });
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
        // Cleanup refs
        if (searchTimeoutRefs.current[index]) {
            clearTimeout(searchTimeoutRefs.current[index]);
            delete searchTimeoutRefs.current[index];
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

                            {/* Address Lookup - Same style as StepOne */}
                            <div className="mb-6 relative z-50">
                                <label className="block text-xs font-bold text-gold-600 uppercase tracking-wider mb-2">
                                    Address Lookup (Start Typing)
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={addressQueries[index] || ''}
                                        onChange={(e) => handleAddressSearch(index, e.target.value)}
                                        onFocus={() => {
                                            if (addressSuggestions[index]?.length > 0) {
                                                setShowSuggestions(prev => ({ ...prev, [index]: true }));
                                            }
                                        }}
                                        onBlur={() => setTimeout(() => setShowSuggestions(prev => ({ ...prev, [index]: false })), 200)}
                                        placeholder="e.g. 10 Downing Street"
                                        className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-900 focus:border-transparent transition-all shadow-sm"
                                    />
                                    {loadingAddress[index] && (
                                        <div className="absolute right-3 top-3 text-slate-400">
                                            <i className="fas fa-spinner fa-spin"></i>
                                        </div>
                                    )}

                                    {showSuggestions[index] && addressSuggestions[index]?.length > 0 && (
                                        <ul className="absolute left-0 top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-2xl max-h-60 overflow-y-auto z-[100]">
                                            {addressSuggestions[index].map((item: any) => (
                                                <li
                                                    key={item.place_id}
                                                    onMouseDown={() => handleSelectAddress(index, item)}
                                                    className="px-4 py-3 hover:bg-navy-50 cursor-pointer text-sm text-slate-700 border-b border-slate-100 last:border-0 transition-colors flex items-center gap-2"
                                                >
                                                    <i className="fas fa-map-marker-alt text-slate-400 text-xs"></i>
                                                    {item.description}
                                                </li>
                                            ))}
                                            <li className="px-4 py-2 bg-slate-50 text-xs text-right text-slate-400 sticky bottom-0 border-t">
                                                Powered by Google
                                            </li>
                                        </ul>
                                    )}
                                </div>
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
