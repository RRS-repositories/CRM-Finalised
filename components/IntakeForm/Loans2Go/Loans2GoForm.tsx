import React, { useState, useEffect, useRef } from 'react';
import { ClientFormData, Page1Response } from '../../../types';
import { submitPage1 } from '../../../services/intakeApi';
import SignaturePad from './SignaturePad';
import ErrorPage from './ErrorPage';

// Add global declaration for Google Maps to avoid TypeScript errors
declare global {
  interface Window {
    google: any;
  }
}

// --- COMPONENTS ---
// InputField is defined OUTSIDE the StepOne component to prevent focus loss.
const InputField = ({ label, name, value, onChange, error, type = "text", colSpan = "col-span-1" }: any) => (
  <div className={`${colSpan} space-y-1 group relative z-0`}>
    <div className="relative">
      <input
        type={type}
        name={name}
        id={name}
        value={value || ''}
        onChange={onChange}
        placeholder=" "
        className={`peer w-full bg-slate-50 border-b-2 text-slate-800 placeholder-transparent focus:outline-none transition-colors py-3 px-1
          ${error ? 'border-red-400' : 'border-slate-200 focus:border-navy-900'}
        `}
      />
      <label
        htmlFor={name}
        className={`absolute left-1 -top-3.5 text-xs font-medium transition-all 
          peer-placeholder-shown:text-base peer-placeholder-shown:top-3 peer-placeholder-shown:text-slate-400
          peer-focus:-top-3.5 peer-focus:text-xs peer-focus:text-navy-900
          ${error ? 'text-red-500' : 'text-slate-500'}
        `}
      >
        {label}
      </label>
      {error && (
        <span className="absolute right-0 top-3 text-red-500 text-xs animate-pulse">
          <i className="fas fa-exclamation-circle"></i>
        </span>
      )}
    </div>
  </div>
);

// --- DATE CONSTANTS ---
const DAYS = Array.from({ length: 31 }, (_, i) => (i + 1).toString().padStart(2, '0'));
const MONTHS = [
  { value: '01', label: 'January' }, { value: '02', label: 'February' },
  { value: '03', label: 'March' }, { value: '04', label: 'April' },
  { value: '05', label: 'May' }, { value: '06', label: 'June' },
  { value: '07', label: 'July' }, { value: '08', label: 'August' },
  { value: '09', label: 'September' }, { value: '10', label: 'October' },
  { value: '11', label: 'November' }, { value: '12', label: 'December' }
];
// Years from 1926 to 2008 (ages 18-100, descending order for better UX)
const YEARS = Array.from({ length: 2008 - 1926 + 1 }, (_, i) => (2008 - i).toString());

interface StepOneProps {
  onSuccess: (data: Page1Response) => void;
  formData: any;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
}

const StepOne: React.FC<StepOneProps> = ({ onSuccess, formData, setFormData }) => {

  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFillFormError, setShowFillFormError] = useState(false);
  const [countryCode, setCountryCode] = useState('+44');
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);

  const countries = [
    { code: '+44', countryCode: 'GB', name: 'UK' },
    { code: '+1', countryCode: 'US', name: 'USA' },
    { code: '+91', countryCode: 'IN', name: 'India' },
    { code: '+55', countryCode: 'BR', name: 'Brazil' },
  ];

  // Address Lookup State (Google Maps)
  const [addressQuery, setAddressQuery] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingAddress, setLoadingAddress] = useState(false);

  // Refs for Google Services
  const autocompleteService = useRef<any>(null);
  const placesService = useRef<any>(null);
  const searchTimeoutRef = useRef<any>(null);

  // Initialize Google Maps Services
  useEffect(() => {
    // Robust initialization: Check every 500ms until loaded or timeout (max 10s)
    let attempts = 0;
    const intervalId = setInterval(() => {
      attempts++;
      if (window.google && window.google.maps && window.google.maps.places) {
        if (!autocompleteService.current) {
          try {
            autocompleteService.current = new window.google.maps.places.AutocompleteService();
            placesService.current = new window.google.maps.places.PlacesService(document.createElement('div'));
            console.log("Google Maps Services Initialized Successfully");
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

  const isFormFilled = () => {
    return formData.first_name && formData.last_name && formData.street_address && formData.city && formData.postal_code && formData.phone;
  };

  const handleTermsClick = (e: React.MouseEvent) => {
    if (!isFormFilled()) {
      e.preventDefault();
      setShowFillFormError(true);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user types
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  // --- DATE HANDLING ---
  // Helper to get current parts from string "YYYY-MM-DD"
  const getDateParts = () => {
    if (!formData.date_of_birth) return { year: '', month: '', day: '' };
    const [year, month, day] = formData.date_of_birth.split('-');
    return { year: year || '', month: month || '', day: day || '' };
  };

  const { year, month, day } = getDateParts();

  const handleDatePartChange = (part: 'day' | 'month' | 'year', value: string) => {
    const current = getDateParts();
    const newParts = { ...current, [part]: value };

    // Construct new date string if we have data, otherwise partial
    // We store whatever we have, validation checks completeness later
    const newDateStr = `${newParts.year}-${newParts.month}-${newParts.day}`;

    setFormData(prev => ({ ...prev, date_of_birth: newDateStr }));

    if (errors.date_of_birth) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.date_of_birth;
        return newErrors;
      });
    }
  };

  // --- ADDRESS LOOKUP LOGIC (Google Maps) ---
  const handleAddressSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setAddressQuery(query);
    setShowSuggestions(true);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (query.length > 2) {
      setLoadingAddress(true);
      searchTimeoutRef.current = setTimeout(() => {
        if (!autocompleteService.current) {
          console.warn("Autocomplete service not initialized yet.");
          setLoadingAddress(false);
          return;
        }

        const request = {
          input: query,
          componentRestrictions: { country: 'gb' }, // Limit to UK
          // Removed 'types' restriction to allow broader results (e.g. "London") to appear,
          // preventing the "No suggestions" issue when typing generic terms.
        };

        autocompleteService.current.getPlacePredictions(request, (predictions: any[], status: any) => {
          setLoadingAddress(false);
          if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
            // Limit to 4 suggestions
            setAddressSuggestions(predictions.slice(0, 4));
          } else {
            console.log("Google Maps Autocomplete status:", status);
            setAddressSuggestions([]);
          }
        });
      }, 300);
    } else {
      setAddressSuggestions([]);
      setLoadingAddress(false);
    }
  };

  const handleSelectAddress = (suggestion: any) => {
    setAddressQuery(suggestion.description);
    setShowSuggestions(false);
    setLoadingAddress(true);

    if (!placesService.current) {
      setLoadingAddress(false);
      return;
    }

    const request = {
      placeId: suggestion.place_id,
      fields: ['address_components'] // We only need address components
    };

    placesService.current.getDetails(request, (place: any, status: any) => {
      setLoadingAddress(false);
      if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {

        // Extract components
        let streetNumber = '';
        let route = '';
        let postalTown = '';
        let locality = '';
        let subpremise = ''; // Flat number
        let county = '';
        let postalCode = '';

        place.address_components.forEach((component: any) => {
          const types = component.types;
          if (types.includes('subpremise')) subpremise = component.long_name;
          if (types.includes('street_number')) streetNumber = component.long_name;
          if (types.includes('route')) route = component.long_name;
          if (types.includes('postal_town')) postalTown = component.long_name;
          if (types.includes('locality')) locality = component.long_name;
          if (types.includes('administrative_area_level_2')) county = component.long_name; // UK County often here
          if (types.includes('administrative_area_level_1') && !county) county = component.long_name; // Fallback
          if (types.includes('postal_code')) postalCode = component.long_name;
        });

        // Construct Street Address: [Flat] [Number] [Street]
        const fullStreet = [subpremise, streetNumber, route].filter(Boolean).join(' ');
        const city = postalTown || locality;

        setFormData(prev => ({
          ...prev,
          street_address: fullStreet,
          city: city,
          state_county: county,
          postal_code: postalCode,
          // Internal mappings for PDF and Backend
          address_line_1: fullStreet,
          address_line_2: [city, county].filter(Boolean).join(', ')
        }));

        // Clear errors for filled fields
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.street_address;
          delete newErrors.city;
          delete newErrors.state_county;
          delete newErrors.postal_code;
          return newErrors;
        });
      } else {
        setError("Could not retrieve details for this address. Please try again or fill manually.");
      }
    });
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    const requiredFields = ['first_name', 'last_name', 'phone', 'email', 'street_address', 'city', 'postal_code'];

    requiredFields.forEach(field => {
      if (!formData[field as keyof ClientFormData]) newErrors[field] = 'Required';
    });

    // Custom Date Validation
    const { year, month, day } = getDateParts();
    if (!year || !month || !day) {
      newErrors.date_of_birth = 'Full date required';
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email';
    }
    if (formData.phone && (formData.phone.length < 10 || formData.phone.length > 11)) {
      newErrors.phone = 'Phone must be 10-11 digits';
    }
    if (!signatureData) {
      newErrors.signature = 'Signature is required';
    }
    if (!termsAccepted) {
      newErrors.terms = 'You must accept the terms';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const formatDateForBackend = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    if (!year || !month || !day) return '';
    return `${year}-${month}-${day}`; // Using YYYY-MM-DD for standard Postgres DATE type
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      const topError = document.querySelector('.text-red-500');
      if (topError) topError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      else window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setLoading(true);
    try {
      const submissionData: any = {
        first_name: formData.first_name || '',
        last_name: formData.last_name || '',
        phone: `${countryCode} ${formData.phone || ''}`.trim(),
        email: formData.email || '',
        date_of_birth: formatDateForBackend(formData.date_of_birth || ''),
        street_address: formData.street_address || '',
        address_line_1: formData.street_address || '',
        address_line_2: [formData.city, formData.state_county].filter(Boolean).join(', '),
        city: formData.city || '',
        state_county: formData.state_county || '',
        postal_code: formData.postal_code || '',
        signature_data: signatureData || '',
        lender_type: 'Loans 2 Go',
      };

      const result = await submitPage1(submissionData);
      if (result.success) {
        onSuccess(result);
      }
    } catch (error: any) {
      setError(error.message || 'An error occurred during submission.');
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return <ErrorPage />;
  }

  return (
    <form onSubmit={handleSubmit} className="w-full relative">
      <div className="mb-10">
        <h3 className="text-xl font-serif text-navy-900 mb-6 flex items-center gap-2">
          <span className="w-8 h-[1px] bg-gold-500"></span> Personal Information
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-8">
          <InputField
            label="First Name"
            name="first_name"
            value={formData.first_name}
            onChange={handleChange}
            error={errors.first_name}
          />
          <InputField
            label="Last Name"
            name="last_name"
            value={formData.last_name}
            onChange={handleChange}
            error={errors.last_name}
          />
          <div className="col-span-1 md:col-span-1 space-y-1 relative z-10">
            <label className={`absolute left-1 -top-3.5 text-xs font-medium transition-all ${errors.phone ? 'text-red-500' : 'text-slate-500'}`}>
              Phone Number
            </label>
            <div className="flex gap-2 items-end pt-2">
              {/* Custom Country Selector */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                  onBlur={() => setTimeout(() => setShowCountryDropdown(false), 200)}
                  className="bg-slate-50 border-b-2 border-slate-200 text-slate-800 py-3 pl-2 pr-6 focus:outline-none focus:border-navy-900 h-full text-xs min-w-[90px] flex items-center gap-2"
                >
                  <img
                    src={`https://flagsapi.com/${countries.find(c => c.code === countryCode)?.countryCode}/flat/24.png`}
                    alt=""
                    className="w-5 h-4 object-cover"
                  />
                  <span>{countryCode}</span>
                  <i className="fas fa-chevron-down text-[10px] text-slate-400 ml-auto"></i>
                </button>

                {/* Custom Dropdown */}
                {showCountryDropdown && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-xl z-50 min-w-[180px]">
                    {countries.map(c => (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => {
                          setCountryCode(c.code);
                          setShowCountryDropdown(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-navy-50 text-left text-sm transition-colors border-b border-slate-100 last:border-0"
                      >
                        <img
                          src={`https://flagsapi.com/${c.countryCode}/flat/24.png`}
                          alt={c.name}
                          className="w-6 h-5 object-cover"
                        />
                        <span className="font-medium text-slate-700">{c.name}</span>
                        <span className="text-slate-500 text-xs ml-auto">{c.code}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                type="tel"
                name="phone"
                value={formData.phone || ''}
                onChange={handleChange}
                placeholder="Mobile Number"
                className={`flex-1 bg-slate-50 border-b-2 text-slate-800 placeholder-slate-400 focus:outline-none transition-colors py-3 px-1
                  ${errors.phone ? 'border-red-400' : 'border-slate-200 focus:border-navy-900'}
                `}
              />
            </div>
            {errors.phone && <span className="text-red-500 text-[10px] absolute right-0 bottom-0 pr-1">{errors.phone}</span>}
          </div>
          <InputField
            label="Email Address"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            error={errors.email}
            colSpan="col-span-1 md:col-span-1"
          />

          {/* Custom Date Picker (Day / Month / Year) */}
          <div className="col-span-1 space-y-1 relative z-0">
            <label className={`block text-xs font-medium transition-all mb-1 ${errors.date_of_birth ? 'text-red-500' : 'text-slate-500'}`}>
              Date of Birth
            </label>
            <div className="flex gap-3">
              {/* Day Select */}
              <div className="relative w-1/4">
                <select
                  value={day}
                  onChange={(e) => handleDatePartChange('day', e.target.value)}
                  className={`w-full bg-slate-50 border-b-2 text-slate-800 focus:outline-none py-3 px-1 appearance-none rounded-none
                    ${errors.date_of_birth ? 'border-red-400' : 'border-slate-200 focus:border-navy-900'}
                  `}
                >
                  <option value="" disabled>DD</option>
                  {DAYS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Month Select */}
              <div className="relative w-2/4">
                <select
                  value={month}
                  onChange={(e) => handleDatePartChange('month', e.target.value)}
                  className={`w-full bg-slate-50 border-b-2 text-slate-800 focus:outline-none py-3 px-1 appearance-none rounded-none
                    ${errors.date_of_birth ? 'border-red-400' : 'border-slate-200 focus:border-navy-900'}
                  `}
                >
                  <option value="" disabled>Month</option>
                  {MONTHS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Year Select */}
              <div className="relative w-1/4">
                <select
                  value={year}
                  onChange={(e) => handleDatePartChange('year', e.target.value)}
                  className={`w-full bg-slate-50 border-b-2 text-slate-800 focus:outline-none py-3 px-1 appearance-none rounded-none
                    ${errors.date_of_birth ? 'border-red-400' : 'border-slate-200 focus:border-navy-900'}
                  `}
                >
                  <option value="" disabled>YYYY</option>
                  {YEARS.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
            {errors.date_of_birth && (
              <span className="text-red-500 text-xs">{errors.date_of_birth}</span>
            )}
          </div>
        </div>
      </div>

      <div className="mb-10 relative">
        <h3 className="text-xl font-serif text-navy-900 mb-6 flex items-center gap-2">
          <span className="w-8 h-[1px] bg-gold-500"></span> Current Address
        </h3>

        {/* Address Lookup Container */}
        <div className="mb-8 relative z-50">
          <label className="block text-xs font-bold text-gold-600 uppercase tracking-wider mb-2">
            Address Lookup (Start Typing)
          </label>
          <div className="relative">
            <input
              type="text"
              value={addressQuery}
              onChange={handleAddressSearch}
              onFocus={() => {
                if (addressSuggestions.length > 0) setShowSuggestions(true);
              }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="e.g. 10 Downing Street"
              className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-900 focus:border-transparent transition-all shadow-sm"
            />
            {loadingAddress && (
              <div className="absolute right-3 top-3 text-slate-400">
                <i className="fas fa-spinner fa-spin"></i>
              </div>
            )}

            {showSuggestions && addressSuggestions.length > 0 && (
              <ul className="absolute left-0 top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-2xl max-h-60 overflow-y-auto z-[100]">
                {addressSuggestions.map((item: any) => (
                  <li
                    key={item.place_id}
                    onMouseDown={() => handleSelectAddress(item)}
                    className="px-4 py-3 hover:bg-navy-50 cursor-pointer text-sm text-slate-700 border-b border-slate-100 last:border-0 transition-colors flex items-center gap-2"
                  >
                    <i className="fas fa-map-marker-alt text-slate-400 text-xs"></i>
                    {/* Google returns 'description' or structured_formatting.main_text */}
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-8 relative z-0">
          <InputField
            label="Street Address"
            name="street_address"
            colSpan="md:col-span-2"
            value={formData.street_address}
            onChange={handleChange}
            error={errors.street_address}
          />
          <InputField
            label="City / Town"
            name="city"
            value={formData.city}
            onChange={handleChange}
            error={errors.city}
          />
          <InputField
            label="County / State"
            name="state_county"
            value={formData.state_county}
            onChange={handleChange}
            error={errors.state_county}
          />
          <InputField
            label="Postal Code"
            name="postal_code"
            value={formData.postal_code}
            onChange={handleChange}
            error={errors.postal_code}
          />
        </div>
      </div>

      <div className="mb-10">
        <div className="flex flex-col items-start bg-slate-50 p-6 rounded-lg border-2 border-slate-300">
          <label className="flex items-start gap-4 cursor-pointer group select-none">
            <div className="relative flex items-center mt-0.5">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => {
                  if (!isFormFilled() && e.target.checked) {
                    setShowFillFormError(true);
                    return;
                  }
                  setTermsAccepted(e.target.checked);
                  if (e.target.checked && errors.terms) {
                    setErrors(prev => {
                      const newErrors = { ...prev };
                      delete newErrors.terms;
                      return newErrors;
                    })
                  }
                }}
                className={`peer h-6 w-6 cursor-pointer appearance-none rounded border-2 transition-all
                    ${errors.terms ? 'border-red-500 bg-red-50' : 'border-navy-900 bg-white'}
                    checked:border-navy-900 checked:bg-navy-900`}
              />
              <div className="pointer-events-none absolute top-2/4 left-2/4 -translate-x-2/4 -translate-y-2/4 text-white opacity-0 transition-opacity peer-checked:opacity-100">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              </div>
            </div>
            <span className={`text-sm ${errors.terms ? 'text-red-600' : 'text-slate-700'}`}>
              I have reviewed the terms of business and fully understand the no-win-no-fee agreement {" "}
              <a
                href={isFormFilled() ? "#terms" : "#"}
                onClick={handleTermsClick}
                className="text-navy-900 font-bold underline decoration-gold-500 hover:text-gold-600 transition-colors"
              >
                Terms and Conditions
              </a>
              {showFillFormError && !isFormFilled() && (
                <span className="block text-xs text-red-500 font-bold mt-1 animate-bounce">
                  <i className="fas fa-exclamation-triangle mr-1"></i>
                  Please fill form first
                </span>
              )}
            </span>
          </label>
          {errors.terms && <span className="text-xs text-red-500 mt-2 pl-10">Required: Please accept the terms to proceed.</span>}
        </div>
      </div>

      <div className="mb-10">
        <h3 className="text-xl font-serif text-navy-900 mb-6 flex items-center gap-2">
          <span className="w-8 h-[1px] bg-gold-500"></span> Digital Signature
        </h3>
        <p className="text-sm text-slate-500 mb-4">By signing below, you agree to our terms of service and authorize us to review your claim.</p>
        <SignaturePad
          onEnd={(data) => setSignatureData(data)}
          hasError={!!errors.signature}
        />
      </div>

      <div className="flex flex-col md:flex-row items-center justify-end gap-6 pt-6 pb-6">
        <button
          type="submit"
          disabled={loading}
          className={`w-full md:w-auto px-10 py-4 bg-navy-900 text-white rounded-none hover:bg-slate-800 transition-all duration-300 flex items-center justify-center gap-3 shadow-lg shadow-navy-900/20 group
            ${loading ? 'opacity-70 cursor-not-allowed' : ''}
          `}
        >
          {loading ? 'Processing...' : 'SUBMIT'}
          <i className="fas fa-arrow-right transform group-hover:translate-x-1 transition-transform"></i>
        </button>
      </div>
    </form>
  );
};

export default StepOne;