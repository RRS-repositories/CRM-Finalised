import React from 'react';
import { tcHtml } from '../termsHtml';

interface TermsProps {
  formData?: any;
}

const Terms: React.FC<TermsProps> = ({ formData }) => {
  // Helper to replace placeholders in the large HTML string
  const getPopulatedHtml = () => {
    let populated = tcHtml;

    const firstName = formData?.first_name || '{{first name}}';
    const lastName = formData?.last_name || '{{last name}}';
    const street1 = formData?.address_line_1 || '';
    const street2 = formData?.address_line_2 || '';
    const street = [street1, street2].filter(Boolean).join(', ') || '{{street address}}';
    const city = formData?.city || '{{city/town}}';
    const state = formData?.state_county || '{{country/state}}';
    const postal = formData?.postal_code || '{{postalcode}}';
    const phone = formData?.phone || '{{Contact number}}';

    const now = new Date();
    const today = now.toLocaleDateString('en-GB'); // DD/MM/YYYY
    const todayWithTime = now.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // Replacement logic
    populated = populated.replace(/{{first name}}/g, firstName);
    populated = populated.replace(/{{last name}}/g, lastName);
    populated = populated.replace(/{{street address}}/g, street);
    populated = populated.replace(/{{city\/town}}/g, city);
    populated = populated.replace(/{{country\/state}}/g, state);
    populated = populated.replace(/{{postalcode}}/g, postal);
    populated = populated.replace(/{{Contact number}}/g, phone);

    // Date synchronization
    populated = populated.replace(/14\/01\/2026/g, today);
    populated = populated.replace(/{PLATFORM_DATE}/g, todayWithTime);

    // Advanced placeholders replacement
    populated = populated.replace(/\[Client\.FirstName\]/g, firstName);
    populated = populated.replace(/\[Client\.LastName\]/g, lastName);
    populated = populated.replace(/\[Client\.StreetAddress\]/g, street);
    populated = populated.replace(/\[Client\.City\]/g, city);
    populated = populated.replace(/\[Client\.PostalCode\]/g, postal);

    return populated;
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans overflow-x-hidden">
      <div className="max-w-4xl mx-auto bg-white shadow-xl p-6 md:p-12 border-t-8 border-navy-900 relative">

        {/* Sticky Return Button for easier navigation in a long document */}
        <div className="sticky top-4 z-10 flex justify-end mb-4 pointer-events-none">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              window.location.hash = '';
            }}
            className="pointer-events-auto px-4 py-2 bg-navy-900 text-white text-sm font-bold rounded-full hover:bg-slate-800 transition-all shadow-lg flex items-center gap-2 opacity-90 hover:opacity-100"
          >
            <i className="fas fa-arrow-left"></i> Return
          </a>
        </div>

        {/* Floating Logo/Header */}
        <div className="flex justify-between items-start mb-6 pb-6 border-b border-slate-200">
          {/* Left: Logo */}
          <div className="flex-shrink-0">
            <img src="/rowan-rose-logo.png" alt="Rowan Rose Solicitors" className="w-48 h-auto" />
          </div>

          {/* Right: Company Details */}
          <div className="text-right text-sm">
            <p className="font-bold text-navy-900 text-base mb-1">Rowan Rose Solicitors</p>
            <p className="text-slate-600">Tel: 0161 5331706</p>
            <p className="text-slate-600 mt-1">
              Address: 1.03 The boat shed<br />
              12 Exchange Quay<br />
              Salford<br />
              M5 3EQ
            </p>
            <p className="mt-2">
              <a href="mailto:irl@rowanrose.co.uk" className="text-blue-600 hover:underline">
                irl@rowanrose.co.uk
              </a>
            </p>
          </div>
        </div>

        {/* Client Information Section - Highlighted */}
        <div className="mb-8 space-y-3">
          {/* Date - Highlighted */}
          <div className="text-lg font-semibold text-slate-900">
            {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </div>

          {/* Client Name - Highlighted */}
          <div className="text-lg font-semibold text-slate-900">
            {formData?.first_name || ''} {formData?.last_name || ''}
          </div>

          {/* Client Address - Highlighted */}
          <div className="text-lg font-semibold text-slate-800">
            {[
              [formData?.address_line_1, formData?.address_line_2].filter(Boolean).join(', '),
              formData?.city,
              formData?.state_county,
              formData?.postal_code
            ].filter(Boolean).join(', ')}
          </div>
          <br></br>

          {/* Terms and Conditions of Engagement Heading */}
          <div className="text-base font-bold text-slate-800 mt-4">
            Terms and Conditions of Engagement
          </div>
        </div>

        {/* The Professionally Formatted Content from Docx */}
        <div
          className="tc-content prose prose-slate max-w-none text-slate-700 leading-relaxed text-justify"
          dangerouslySetInnerHTML={{ __html: getPopulatedHtml() }}
        />

        <div className="mt-16 pt-8 border-t border-slate-200 flex flex-col items-center">
          <p className="text-slate-400 text-[10px] italic mb-8">
            This document is a formal retainer agreement electronically generated by Rowan Rose Solicitors.
          </p>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              window.location.hash = '';
            }}
            className="px-8 py-3 bg-navy-900 text-white font-bold hover:bg-slate-800 transition-all shadow-lg flex items-center gap-2"
          >
            <i className="fas fa-arrow-left"></i> Back to Form
          </a>
        </div>
      </div>

      {/* Global CSS for the T&C content specifically */}
      <style dangerouslySetInnerHTML={{
        __html: `
        .tc-content h2 { color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; margin-top: 2.5rem; font-family: sans-serif; }
        .tc-content h3 { color: #1e293b; margin-top: 2rem; font-family: sans-serif; }
        .tc-content table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; font-size: 0.9rem; }
        .tc-content th, .tc-content td { border: 1px solid #e2e8f0; padding: 0.75rem; text-align: left; }
        .tc-content tr:nth-child(even) { background-color: #f8fafc; }
        .tc-content p { margin-bottom: 1rem; }
        .tc-content ul, .tc-content ol { margin-bottom: 1.5rem; padding-left: 1.5rem; }
        .tc-content li { margin-bottom: 0.5rem; }
        .tc-content strong { color: #0f172a; }
      `}} />
    </div>
  );
};

export default Terms;