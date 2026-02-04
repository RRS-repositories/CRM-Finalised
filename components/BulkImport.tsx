import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, FileText, X, Check, AlertTriangle, ArrowRight, ArrowLeft,
  Users, Loader2, ChevronDown, RefreshCw, Download, Eye, Trash2,
  FileSpreadsheet, File as FileIcon, CheckCircle2, XCircle, AlertCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useCRM } from '../context/CRMContext';
import { Contact, ClaimStatus } from '../types';
import { API_ENDPOINTS } from '../src/config';

// Types for bulk import
interface ParsedContact {
  id: string; // temporary ID for tracking
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  county?: string;
  postalCode?: string;
  // Previous addresses (can have multiple)
  previousAddresses?: {
    line1: string;
    line2?: string;
    city: string;
    county?: string;
    postalCode: string;
  }[];
  // Legacy single previous address fields (for mapping)
  prevAddressLine1?: string;
  prevAddressLine2?: string;
  prevCity?: string;
  prevCounty?: string;
  prevPostalCode?: string;
  // Second previous address
  prevAddress2Line1?: string;
  prevAddress2Line2?: string;
  prevAddress2City?: string;
  prevAddress2County?: string;
  prevAddress2PostalCode?: string;
  // Third previous address
  prevAddress3Line1?: string;
  prevAddress3Line2?: string;
  prevAddress3City?: string;
  prevAddress3County?: string;
  prevAddress3PostalCode?: string;
  lender?: string;
  claimValue?: number;
  status?: string;
  source?: string;
  // Raw data from import
  rawData: Record<string, string>;
  // Validation
  isValid: boolean;
  errors: string[];
  // Duplicate detection
  isDuplicate: boolean;
  duplicateOf?: string;
}

interface FieldMapping {
  sourceField: string;
  targetField: string;
}

type ImportStep = 'upload' | 'mapping' | 'preview' | 'importing' | 'complete';
type DuplicateAction = 'skip' | 'update' | 'create';

const CRM_FIELDS = [
  { key: 'firstName', label: 'First Name', required: false },
  { key: 'lastName', label: 'Last Name', required: false },
  { key: 'fullName', label: 'Full Name', required: false },
  { key: 'email', label: 'Email', required: false },
  { key: 'phone', label: 'Phone', required: false },
  { key: 'dateOfBirth', label: 'Date of Birth', required: false },
  { key: 'addressLine1', label: 'Current Address Line 1', required: false },
  { key: 'addressLine2', label: 'Current Address Line 2', required: false },
  { key: 'city', label: 'Current City', required: false },
  { key: 'county', label: 'Current County', required: false },
  { key: 'postalCode', label: 'Current Post Code', required: false },
  // Previous Address 1
  { key: 'prevAddressLine1', label: 'Previous Address 1 - Line 1', required: false },
  { key: 'prevAddressLine2', label: 'Previous Address 1 - Line 2', required: false },
  { key: 'prevCity', label: 'Previous Address 1 - City', required: false },
  { key: 'prevCounty', label: 'Previous Address 1 - County', required: false },
  { key: 'prevPostalCode', label: 'Previous Address 1 - Post Code', required: false },
  // Previous Address 2
  { key: 'prevAddress2Line1', label: 'Previous Address 2 - Line 1', required: false },
  { key: 'prevAddress2Line2', label: 'Previous Address 2 - Line 2', required: false },
  { key: 'prevAddress2City', label: 'Previous Address 2 - City', required: false },
  { key: 'prevAddress2County', label: 'Previous Address 2 - County', required: false },
  { key: 'prevAddress2PostalCode', label: 'Previous Address 2 - Post Code', required: false },
  // Previous Address 3
  { key: 'prevAddress3Line1', label: 'Previous Address 3 - Line 1', required: false },
  { key: 'prevAddress3Line2', label: 'Previous Address 3 - Line 2', required: false },
  { key: 'prevAddress3City', label: 'Previous Address 3 - City', required: false },
  { key: 'prevAddress3County', label: 'Previous Address 3 - County', required: false },
  { key: 'prevAddress3PostalCode', label: 'Previous Address 3 - Post Code', required: false },
  { key: 'lender', label: 'Lender', required: false },
  { key: 'claimValue', label: 'Claim Value', required: false },
  { key: 'status', label: 'Status', required: false },
  { key: 'skip', label: '-- Skip this field --', required: false }
];

const API_BASE_URL = API_ENDPOINTS.api;

interface BulkImportProps {
  onClose: () => void;
  onComplete?: (count: number) => void;
}

const BulkImport: React.FC<BulkImportProps> = ({ onClose, onComplete }) => {
  const { contacts, addContact, updateContact, updateContactExtended, addNotification } = useCRM();

  // Step management
  const [currentStep, setCurrentStep] = useState<ImportStep>('upload');

  // File handling
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parsing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const [rawData, setRawData] = useState<Record<string, string>[]>([]);
  const [sourceFields, setSourceFields] = useState<string[]>([]);

  // Mapping state
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);

  // Preview state
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([]);
  const [duplicateAction, setDuplicateAction] = useState<DuplicateAction>('skip');

  // Import progress
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<{
    total: number;
    created: number;
    updated: number;
    skipped: number;
    errors: { row: number; error: string }[];
  }>({ total: 0, created: 0, updated: 0, skipped: 0, errors: [] });

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelection(files[0]);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleFileSelection = async (file: File) => {
    const validTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/pdf'
    ];
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (!validTypes.includes(file.type) && !['csv', 'xlsx', 'xls', 'pdf'].includes(extension || '')) {
      addNotification('error', 'Please upload a CSV, Excel, or PDF file');
      return;
    }

    setUploadedFile(file);
    setIsProcessing(true);

    try {
      if (extension === 'pdf') {
        setProcessingMessage('Analyzing PDF with AI...');
        await parsePDF(file);
      } else {
        setProcessingMessage('Parsing spreadsheet data...');
        await parseCSV(file);
      }
    } catch (error: any) {
      addNotification('error', `Failed to parse file: ${error.message}`);
      setUploadedFile(null);
    } finally {
      setIsProcessing(false);
      setProcessingMessage('');
    }
  };

  // CSV/Excel parsing using xlsx library
  const parseCSV = async (file: File) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      const extension = file.name.split('.').pop()?.toLowerCase();

      reader.onload = (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;

          // Use xlsx library to parse both CSV and Excel files
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });

          // Get the first sheet
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];

          // Convert to JSON with headers
          const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
            header: 1,
            defval: '',
            raw: false // Convert all values to strings
          }) as string[][];

          if (jsonData.length < 2) {
            reject(new Error('File must have headers and at least one data row'));
            return;
          }

          // First row is headers
          const headers = jsonData[0].map(h => String(h || '').trim()).filter(h => h);
          setSourceFields(headers);

          // Parse data rows
          const data: Record<string, string>[] = [];
          for (let i = 1; i < jsonData.length; i++) {
            const rowArray = jsonData[i];
            // Skip empty rows
            if (!rowArray || rowArray.every(cell => !cell || String(cell).trim() === '')) {
              continue;
            }

            const row: Record<string, string> = {};
            headers.forEach((header, index) => {
              const cellValue = rowArray[index];
              row[header] = cellValue !== undefined && cellValue !== null ? String(cellValue).trim() : '';
            });
            data.push(row);
          }

          if (data.length === 0) {
            reject(new Error('No data rows found in file'));
            return;
          }

          setRawData(data);

          // Auto-map fields based on header names
          const autoMappings = autoMapFields(headers);
          setFieldMappings(autoMappings);

          setCurrentStep('mapping');
          resolve();
        } catch (error: any) {
          console.error('Parse error:', error);
          reject(new Error(`Failed to parse file: ${error.message}`));
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      // Read as ArrayBuffer for xlsx library
      reader.readAsArrayBuffer(file);
    });
  };

  // Parse CSV line handling quoted values
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  };

  // PDF parsing using AI
  const parsePDF = async (file: File) => {
    const formData = new FormData();
    formData.append('document', file);

    try {
      const response = await fetch(`${API_BASE_URL}/parse-pdf-contacts`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('PDF parsing failed');
      }

      const result = await response.json();

      if (result.contacts && result.contacts.length > 0) {
        // Convert AI-parsed contacts to our format
        const extractedData = result.contacts.map((c: any) => ({
          'Full Name': c.fullName || '',
          'First Name': c.firstName || '',
          'Last Name': c.lastName || '',
          'Email': c.email || '',
          'Phone': c.phone || '',
          'Address': c.addressLine1 || '',
          'City': c.city || '',
          'Post Code': c.postalCode || '',
          'Lender': c.lender || '',
          'Claim Value': c.claimValue?.toString() || ''
        }));

        const headers = Object.keys(extractedData[0]);
        setSourceFields(headers);
        setRawData(extractedData);

        const autoMappings = autoMapFields(headers);
        setFieldMappings(autoMappings);

        setCurrentStep('mapping');
      } else {
        throw new Error('No contacts found in PDF');
      }
    } catch (error: any) {
      // Fallback: try client-side text extraction
      console.error('Server PDF parse failed, attempting local fallback:', error);
      throw new Error('PDF parsing requires server support. Please convert to CSV or ensure backend is running.');
    }
  };

  // Auto-map fields based on common naming patterns
  const autoMapFields = (headers: string[]): FieldMapping[] => {
    const mappings: FieldMapping[] = [];

    const fieldPatterns: Record<string, RegExp[]> = {
      firstName: [/^first\s*name$/i, /^fname$/i, /^given\s*name$/i, /^forename$/i],
      lastName: [/^last\s*name$/i, /^lname$/i, /^surname$/i, /^family\s*name$/i],
      fullName: [/^full\s*name$/i, /^name$/i, /^client\s*name$/i, /^contact\s*name$/i],
      email: [/^email$/i, /^e-mail$/i, /^email\s*address$/i],
      phone: [/^phone$/i, /^telephone$/i, /^mobile$/i, /^cell$/i, /^phone\s*number$/i, /^contact\s*number$/i],
      dateOfBirth: [/^date\s*of\s*birth$/i, /^dob$/i, /^birth\s*date$/i, /^birthday$/i],
      addressLine1: [/^address$/i, /^address\s*1$/i, /^address\s*line\s*1$/i, /^street$/i, /^street\s*address$/i, /^current\s*address$/i, /^current\s*address\s*1$/i, /^current\s*address\s*line\s*1$/i],
      addressLine2: [/^address\s*2$/i, /^address\s*line\s*2$/i, /^apt$/i, /^unit$/i, /^current\s*address\s*2$/i, /^current\s*address\s*line\s*2$/i],
      city: [/^city$/i, /^town$/i, /^locality$/i, /^current\s*city$/i],
      county: [/^county$/i, /^state$/i, /^region$/i, /^current\s*county$/i],
      postalCode: [/^post\s*code$/i, /^postcode$/i, /^zip$/i, /^zip\s*code$/i, /^postal\s*code$/i, /^current\s*post\s*code$/i],
      // Previous Address 1
      prevAddressLine1: [/^prev(ious)?\s*address$/i, /^prev(ious)?\s*address\s*1$/i, /^prev(ious)?\s*address\s*line\s*1$/i, /^previous\s*street$/i, /^old\s*address$/i],
      prevAddressLine2: [/^prev(ious)?\s*address\s*2$/i, /^prev(ious)?\s*address\s*line\s*2$/i],
      prevCity: [/^prev(ious)?\s*city$/i, /^prev(ious)?\s*town$/i, /^old\s*city$/i],
      prevCounty: [/^prev(ious)?\s*county$/i, /^prev(ious)?\s*state$/i, /^old\s*county$/i],
      prevPostalCode: [/^prev(ious)?\s*post\s*code$/i, /^prev(ious)?\s*postcode$/i, /^prev(ious)?\s*postal\s*code$/i, /^old\s*post\s*code$/i],
      // Previous Address 2
      prevAddress2Line1: [/^prev(ious)?\s*address\s*2\s*line\s*1$/i, /^second\s*prev(ious)?\s*address$/i],
      prevAddress2City: [/^prev(ious)?\s*address\s*2\s*city$/i],
      prevAddress2PostalCode: [/^prev(ious)?\s*address\s*2\s*post\s*code$/i],
      // Previous Address 3
      prevAddress3Line1: [/^prev(ious)?\s*address\s*3\s*line\s*1$/i, /^third\s*prev(ious)?\s*address$/i],
      prevAddress3City: [/^prev(ious)?\s*address\s*3\s*city$/i],
      prevAddress3PostalCode: [/^prev(ious)?\s*address\s*3\s*post\s*code$/i],
      lender: [/^lender$/i, /^bank$/i, /^creditor$/i, /^company$/i],
      claimValue: [/^claim\s*value$/i, /^value$/i, /^amount$/i, /^claim\s*amount$/i]
    };

    headers.forEach(header => {
      let mapped = false;
      for (const [field, patterns] of Object.entries(fieldPatterns)) {
        if (patterns.some(p => p.test(header))) {
          mappings.push({ sourceField: header, targetField: field });
          mapped = true;
          break;
        }
      }
      if (!mapped) {
        mappings.push({ sourceField: header, targetField: 'skip' });
      }
    });

    return mappings;
  };

  // Update field mapping
  const updateMapping = (sourceField: string, targetField: string) => {
    setFieldMappings(prev =>
      prev.map(m =>
        m.sourceField === sourceField ? { ...m, targetField } : m
      )
    );
  };

  // Apply mappings and generate preview
  const generatePreview = () => {
    const parsedList: ParsedContact[] = rawData.map((row, index) => {
      const contact: ParsedContact = {
        id: `import-${index}`,
        rawData: row,
        isValid: true,
        errors: [],
        isDuplicate: false
      };

      // Apply mappings
      fieldMappings.forEach(mapping => {
        if (mapping.targetField !== 'skip' && row[mapping.sourceField]) {
          const value = row[mapping.sourceField].trim();

          switch (mapping.targetField) {
            case 'firstName':
              contact.firstName = value;
              break;
            case 'lastName':
              contact.lastName = value;
              break;
            case 'fullName':
              contact.fullName = value;
              break;
            case 'email':
              contact.email = value;
              break;
            case 'phone':
              contact.phone = value;
              break;
            case 'dateOfBirth':
              contact.dateOfBirth = parseDate(value);
              break;
            case 'addressLine1':
              contact.addressLine1 = value;
              break;
            case 'addressLine2':
              contact.addressLine2 = value;
              break;
            case 'city':
              contact.city = value;
              break;
            case 'postalCode':
              contact.postalCode = value;
              break;
            case 'county':
              contact.county = value;
              break;
            // Previous Address 1
            case 'prevAddressLine1':
              contact.prevAddressLine1 = value;
              break;
            case 'prevAddressLine2':
              contact.prevAddressLine2 = value;
              break;
            case 'prevCity':
              contact.prevCity = value;
              break;
            case 'prevCounty':
              contact.prevCounty = value;
              break;
            case 'prevPostalCode':
              contact.prevPostalCode = value;
              break;
            // Previous Address 2
            case 'prevAddress2Line1':
              contact.prevAddress2Line1 = value;
              break;
            case 'prevAddress2Line2':
              contact.prevAddress2Line2 = value;
              break;
            case 'prevAddress2City':
              contact.prevAddress2City = value;
              break;
            case 'prevAddress2County':
              contact.prevAddress2County = value;
              break;
            case 'prevAddress2PostalCode':
              contact.prevAddress2PostalCode = value;
              break;
            // Previous Address 3
            case 'prevAddress3Line1':
              contact.prevAddress3Line1 = value;
              break;
            case 'prevAddress3Line2':
              contact.prevAddress3Line2 = value;
              break;
            case 'prevAddress3City':
              contact.prevAddress3City = value;
              break;
            case 'prevAddress3County':
              contact.prevAddress3County = value;
              break;
            case 'prevAddress3PostalCode':
              contact.prevAddress3PostalCode = value;
              break;
            case 'lender':
              contact.lender = value;
              break;
            case 'claimValue':
              contact.claimValue = parseFloat(value.replace(/[£$,]/g, '')) || 0;
              break;
            case 'status':
              contact.status = value;
              break;
          }
        }
      });

      // Build previousAddresses array from individual fields
      const previousAddresses: { line1: string; line2?: string; city: string; county?: string; postalCode: string }[] = [];

      // Helper function to parse multiple addresses from a single cell
      // This handles cases where multiple addresses are in one cell separated by line breaks
      // or where addresses contain postcodes that can be used to split them
      const parseMultipleAddresses = (addressText: string): { line1: string; line2?: string; city: string; county?: string; postalCode: string }[] => {
        if (!addressText) return [];

        const addresses: { line1: string; line2?: string; city: string; county?: string; postalCode: string }[] = [];

        // UK Postcode regex pattern
        const ukPostcodePattern = /\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/gi;

        // Find all postcodes in the text
        const postcodes = addressText.match(ukPostcodePattern);

        if (postcodes && postcodes.length > 0) {
          // Split by postcodes to get individual addresses
          let remainingText = addressText;

          for (let i = 0; i < postcodes.length; i++) {
            const postcode = postcodes[i].trim().toUpperCase();
            const postcodeIndex = remainingText.toUpperCase().indexOf(postcode.toUpperCase());

            if (postcodeIndex !== -1) {
              // Get the address part before and including the postcode
              const addressPart = remainingText.substring(0, postcodeIndex + postcode.length).trim();
              remainingText = remainingText.substring(postcodeIndex + postcode.length).trim();

              // Remove leading separators from remaining text
              remainingText = remainingText.replace(/^[\n\r,;]+/, '').trim();

              // Parse this address part
              // Split by newlines or commas
              const parts = addressPart.split(/[\n\r]+|,\s*/).map(p => p.trim()).filter(p => p && p.toUpperCase() !== postcode.toUpperCase());

              if (parts.length > 0) {
                // Last part before postcode is usually city
                // First parts are street address
                let line1 = '';
                let line2: string | undefined;
                let city = '';

                if (parts.length >= 3) {
                  line1 = parts[0];
                  city = parts[parts.length - 1];
                  line2 = parts.slice(1, -1).join(', ');
                } else if (parts.length === 2) {
                  line1 = parts[0];
                  city = parts[1];
                } else if (parts.length === 1) {
                  // Try to split by last space to separate city
                  const lastSpaceIndex = parts[0].lastIndexOf(' ');
                  if (lastSpaceIndex > 0) {
                    line1 = parts[0].substring(0, lastSpaceIndex).trim();
                    city = parts[0].substring(lastSpaceIndex + 1).trim();
                  } else {
                    line1 = parts[0];
                    city = '';
                  }
                }

                addresses.push({
                  line1,
                  line2,
                  city,
                  postalCode: postcode
                });
              }
            }
          }
        } else {
          // No postcodes found, try to split by line breaks
          const lines = addressText.split(/[\n\r]+/).map(l => l.trim()).filter(l => l);
          if (lines.length > 0) {
            addresses.push({
              line1: lines[0],
              line2: lines.length > 2 ? lines.slice(1, -1).join(', ') : undefined,
              city: lines.length > 1 ? lines[lines.length - 1] : '',
              postalCode: ''
            });
          }
        }

        return addresses;
      };

      // Check if prevAddressLine1 contains multiple addresses (has line breaks or multiple postcodes)
      if (contact.prevAddressLine1) {
        const ukPostcodePattern = /\b[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}\b/gi;
        const postcodes = contact.prevAddressLine1.match(ukPostcodePattern);
        const hasMultipleAddresses = (postcodes && postcodes.length > 1) || contact.prevAddressLine1.includes('\n');

        if (hasMultipleAddresses) {
          // Parse multiple addresses from the single cell
          const parsedAddresses = parseMultipleAddresses(contact.prevAddressLine1);
          previousAddresses.push(...parsedAddresses);
        } else {
          // Single address - use the standard fields
          previousAddresses.push({
            line1: contact.prevAddressLine1 || '',
            line2: contact.prevAddressLine2,
            city: contact.prevCity || '',
            county: contact.prevCounty,
            postalCode: contact.prevPostalCode || ''
          });
        }
      } else if (contact.prevCity || contact.prevPostalCode) {
        // No line1 but has city/postcode
        previousAddresses.push({
          line1: '',
          line2: contact.prevAddressLine2,
          city: contact.prevCity || '',
          county: contact.prevCounty,
          postalCode: contact.prevPostalCode || ''
        });
      }

      // Previous Address 2 (from separate columns)
      if (contact.prevAddress2Line1 || contact.prevAddress2City || contact.prevAddress2PostalCode) {
        previousAddresses.push({
          line1: contact.prevAddress2Line1 || '',
          line2: contact.prevAddress2Line2,
          city: contact.prevAddress2City || '',
          county: contact.prevAddress2County,
          postalCode: contact.prevAddress2PostalCode || ''
        });
      }

      // Previous Address 3 (from separate columns)
      if (contact.prevAddress3Line1 || contact.prevAddress3City || contact.prevAddress3PostalCode) {
        previousAddresses.push({
          line1: contact.prevAddress3Line1 || '',
          line2: contact.prevAddress3Line2,
          city: contact.prevAddress3City || '',
          county: contact.prevAddress3County,
          postalCode: contact.prevAddress3PostalCode || ''
        });
      }

      if (previousAddresses.length > 0) {
        contact.previousAddresses = previousAddresses;
      }

      // Generate fullName if not provided but firstName/lastName are
      if (!contact.fullName && (contact.firstName || contact.lastName)) {
        contact.fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
      }

      // Validate required fields
      if (!contact.fullName && !contact.firstName) {
        contact.isValid = false;
        contact.errors.push('Name is required');
      }

      // Validate email format if provided
      if (contact.email && !isValidEmail(contact.email)) {
        contact.isValid = false;
        contact.errors.push('Invalid email format');
      }

      // Check for duplicates against existing CRM contacts
      const existingContact = contacts.find(c =>
        (contact.email && c.email?.toLowerCase() === contact.email.toLowerCase()) ||
        (contact.phone && c.phone === contact.phone) ||
        (contact.fullName && c.fullName?.toLowerCase() === contact.fullName.toLowerCase())
      );

      if (existingContact) {
        contact.isDuplicate = true;
        contact.duplicateOf = existingContact.id;
      }

      return contact;
    });

    setParsedContacts(parsedList);
    setCurrentStep('preview');
  };

  // Parse various date formats
  const parseDate = (value: string): string => {
    if (!value) return '';

    // Try common date formats
    const formats = [
      /^(\d{2})\/(\d{2})\/(\d{4})$/, // DD/MM/YYYY
      /^(\d{2})-(\d{2})-(\d{4})$/, // DD-MM-YYYY
      /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD (ISO)
      /^(\d{2})\/(\d{2})\/(\d{2})$/, // DD/MM/YY
    ];

    // Try ISO format first
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      return value.split('T')[0];
    }

    // DD/MM/YYYY or DD-MM-YYYY
    const ukMatch = value.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
    if (ukMatch) {
      return `${ukMatch[3]}-${ukMatch[2]}-${ukMatch[1]}`;
    }

    // DD/MM/YY
    const shortMatch = value.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{2})$/);
    if (shortMatch) {
      const year = parseInt(shortMatch[3]) > 50 ? `19${shortMatch[3]}` : `20${shortMatch[3]}`;
      return `${year}-${shortMatch[2]}-${shortMatch[1]}`;
    }

    return value;
  };

  // Email validation
  const isValidEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  // Execute import
  const executeImport = async () => {
    setCurrentStep('importing');
    setImportProgress(0);

    const results = {
      total: parsedContacts.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as { row: number; error: string }[]
    };

    // Separate contacts into: bulk create, update, and skip
    const contactsToCreate: any[] = [];
    const contactsToUpdate: { existing: any; updates: any }[] = [];

    for (let i = 0; i < parsedContacts.length; i++) {
      const contact = parsedContacts[i];

      // Skip invalid contacts
      if (!contact.isValid) {
        results.skipped++;
        results.errors.push({ row: i + 1, error: contact.errors.join(', ') });
        continue;
      }

      // Handle duplicates based on user preference
      if (contact.isDuplicate) {
        if (duplicateAction === 'skip') {
          results.skipped++;
          continue;
        } else if (duplicateAction === 'update') {
          const existing = contacts.find(c =>
            (contact.email && c.email?.toLowerCase() === contact.email.toLowerCase()) ||
            (contact.fullName && c.fullName?.toLowerCase() === contact.fullName.toLowerCase())
          );

          if (existing) {
            contactsToUpdate.push({
              existing,
              updates: {
                firstName: contact.firstName || existing.firstName,
                lastName: contact.lastName || existing.lastName,
                fullName: contact.fullName || existing.fullName,
                email: contact.email || existing.email,
                phone: contact.phone || existing.phone,
                dateOfBirth: contact.dateOfBirth || existing.dateOfBirth,
                address: {
                  line1: contact.addressLine1 || existing.address?.line1 || '',
                  line2: contact.addressLine2 || existing.address?.line2,
                  city: contact.city || existing.address?.city || '',
                  postalCode: contact.postalCode || existing.address?.postalCode || ''
                },
                lender: contact.lender || existing.lender,
                claimValue: contact.claimValue || existing.claimValue,
                previousAddresses: contact.previousAddresses || []
              }
            });
            continue;
          }
        }
      }

      // Add to bulk create list
      contactsToCreate.push({
        firstName: contact.firstName,
        lastName: contact.lastName,
        fullName: contact.fullName,
        email: contact.email || '',
        phone: contact.phone || '',
        dateOfBirth: contact.dateOfBirth,
        addressLine1: contact.addressLine1 || '',
        addressLine2: contact.addressLine2,
        city: contact.city || '',
        stateCounty: contact.county,
        postalCode: contact.postalCode || '',
        previousAddresses: contact.previousAddresses || []
      });
    }

    setImportProgress(10);

    // BULK CREATE - single API call for all new contacts
    if (contactsToCreate.length > 0) {
      try {
        const response = await fetch(`${API_BASE_URL}/contacts/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contacts: contactsToCreate })
        });

        const bulkResult = await response.json();

        if (bulkResult.success) {
          results.created = bulkResult.created || 0;
          results.errors.push(...(bulkResult.errors || []));
        } else {
          results.errors.push({ row: 0, error: bulkResult.message || 'Bulk import failed' });
        }
      } catch (error: any) {
        results.errors.push({ row: 0, error: `Bulk import error: ${error.message}` });
      }
    }

    setImportProgress(70);

    // Handle updates (still need individual calls for updates)
    for (let i = 0; i < contactsToUpdate.length; i++) {
      const { existing, updates } = contactsToUpdate[i];
      try {
        await updateContact({ ...existing, ...updates });

        // Save previous addresses via extended endpoint if present
        if (updates.previousAddresses && updates.previousAddresses.length > 0) {
          await updateContactExtended(existing.id, {
            previousAddresses: updates.previousAddresses.map((addr: any, idx: number) => ({
              id: `prev_addr_import_${Date.now()}_${idx}`,
              line1: addr.line1 || '',
              line2: addr.line2 || '',
              city: addr.city || '',
              county: addr.county || '',
              postalCode: addr.postalCode || ''
            }))
          });
        }

        results.updated++;
      } catch (error: any) {
        results.errors.push({ row: i + 1, error: error.message });
      }
      setImportProgress(70 + Math.round((i + 1) / contactsToUpdate.length * 30));
    }

    setImportProgress(100);
    setImportResults(results);
    setCurrentStep('complete');

    if (onComplete) {
      onComplete(results.created + results.updated);
    }
  };

  // Remove a contact from preview
  const removeFromPreview = (id: string) => {
    setParsedContacts(prev => prev.filter(c => c.id !== id));
  };

  // Reset to upload step
  const resetImport = () => {
    setUploadedFile(null);
    setRawData([]);
    setSourceFields([]);
    setFieldMappings([]);
    setParsedContacts([]);
    setImportProgress(0);
    setImportResults({ total: 0, created: 0, updated: 0, skipped: 0, errors: [] });
    setCurrentStep('upload');
  };

  // Step indicator component
  const StepIndicator = () => {
    const steps = [
      { key: 'upload', label: 'Upload File' },
      { key: 'mapping', label: 'Map Fields' },
      { key: 'preview', label: 'Preview' },
      { key: 'complete', label: 'Complete' }
    ];

    const getCurrentStepIndex = () => {
      if (currentStep === 'importing') return 3;
      return steps.findIndex(s => s.key === currentStep);
    };

    const currentIndex = getCurrentStepIndex();

    return (
      <div className="flex items-center justify-center gap-2 mb-6">
        {steps.map((step, index) => (
          <React.Fragment key={step.key}>
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${index < currentIndex
                ? 'bg-green-500 text-white'
                : index === currentIndex
                  ? 'bg-brand-orange text-white'
                  : 'bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-gray-400'
                }`}>
                {index < currentIndex ? <Check size={16} /> : index + 1}
              </div>
              <span className={`text-sm hidden sm:inline ${index === currentIndex ? 'font-bold text-navy-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'
                }`}>
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className={`w-8 h-0.5 ${index < currentIndex ? 'bg-green-500' : 'bg-gray-200 dark:bg-slate-600'}`} />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  // Render upload step
  const renderUploadStep = () => (
    <div className="space-y-6">
      <div
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer
          ${isDragging
            ? 'border-brand-orange bg-orange-50 dark:bg-orange-900/20'
            : 'border-gray-300 dark:border-slate-600 hover:border-gray-400 dark:hover:border-slate-500 bg-gray-50 dark:bg-slate-700/50'
          }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".csv,.xlsx,.xls,.pdf"
          onChange={handleFileChange}
        />

        {isProcessing ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 size={48} className="text-brand-orange animate-spin" />
            <p className="text-gray-600 dark:text-gray-300">{processingMessage}</p>
          </div>
        ) : (
          <>
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <Upload size={32} />
            </div>
            <h3 className="text-lg font-bold text-navy-900 dark:text-white mb-2">
              Drop your file here or click to browse
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Supports CSV, Excel (.xlsx, .xls), and PDF files
            </p>
            <div className="flex items-center justify-center gap-6 text-sm">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <FileSpreadsheet size={20} className="text-green-500" />
                <span>CSV / Excel</span>
              </div>
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <FileText size={20} className="text-red-500" />
                <span>PDF (AI-powered)</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Import tips */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="font-bold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
          <AlertCircle size={16} /> Import Tips
        </h4>
        <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
          <li>• CSV/Excel files should have headers in the first row</li>
          <li>• PDF files will be analyzed by AI to extract contact information</li>
          <li>• Include at least a name or email for each contact</li>
          <li>• Dates should be in DD/MM/YYYY or YYYY-MM-DD format</li>
        </ul>
      </div>
    </div>
  );

  // Render mapping step
  const renderMappingStep = () => (
    <div className="space-y-6">
      <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-3">
          <FileIcon className="text-gray-400" size={20} />
          <div>
            <p className="font-medium text-navy-900 dark:text-white">{uploadedFile?.name}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{rawData.length} rows detected</p>
          </div>
        </div>
      </div>

      <div className="border border-gray-200 dark:border-slate-600 rounded-lg overflow-hidden">
        <div className="bg-gray-100 dark:bg-slate-700 px-4 py-3 border-b border-gray-200 dark:border-slate-600">
          <h4 className="font-bold text-navy-900 dark:text-white">Map Your Fields</h4>
          <p className="text-sm text-gray-500 dark:text-gray-400">Match each column from your file to a CRM field</p>
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-800 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Source Column</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-16">→</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">CRM Field</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Sample Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {fieldMappings.map((mapping, index) => (
                <tr key={mapping.sourceField} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-navy-900 dark:text-white">{mapping.sourceField}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ArrowRight size={16} className="text-gray-400 mx-auto" />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={mapping.targetField}
                      onChange={(e) => updateMapping(mapping.sourceField, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange bg-white dark:bg-slate-800 text-navy-900 dark:text-white"
                    >
                      {CRM_FIELDS.map(field => (
                        <option key={field.key} value={field.key}>
                          {field.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-500 dark:text-gray-400 truncate block max-w-[200px]">
                      {rawData[0]?.[mapping.sourceField] || '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={resetImport}
          className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg font-medium flex items-center gap-2"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <button
          onClick={generatePreview}
          className="px-6 py-2 bg-brand-orange hover:bg-amber-600 text-white rounded-lg font-bold flex items-center gap-2"
        >
          Preview Import <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );

  // Render preview step
  const renderPreviewStep = () => {
    const validCount = parsedContacts.filter(c => c.isValid).length;
    const duplicateCount = parsedContacts.filter(c => c.isDuplicate).length;
    const invalidCount = parsedContacts.filter(c => !c.isValid).length;

    return (
      <div className="space-y-6">
        {/* Stats summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{validCount}</p>
            <p className="text-sm text-green-700 dark:text-green-300">Ready to Import</p>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{duplicateCount}</p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300">Duplicates</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{invalidCount}</p>
            <p className="text-sm text-red-700 dark:text-red-300">Invalid</p>
          </div>
        </div>

        {/* Duplicate handling options */}
        {duplicateCount > 0 && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <h4 className="font-bold text-yellow-800 dark:text-yellow-300 mb-3">How should we handle {duplicateCount} duplicate(s)?</h4>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="duplicateAction"
                  value="skip"
                  checked={duplicateAction === 'skip'}
                  onChange={() => setDuplicateAction('skip')}
                  className="text-brand-orange focus:ring-brand-orange"
                />
                <span className="text-sm text-yellow-900 dark:text-yellow-200">Skip duplicates</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="duplicateAction"
                  value="update"
                  checked={duplicateAction === 'update'}
                  onChange={() => setDuplicateAction('update')}
                  className="text-brand-orange focus:ring-brand-orange"
                />
                <span className="text-sm text-yellow-900 dark:text-yellow-200">Update existing</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="duplicateAction"
                  value="create"
                  checked={duplicateAction === 'create'}
                  onChange={() => setDuplicateAction('create')}
                  className="text-brand-orange focus:ring-brand-orange"
                />
                <span className="text-sm text-yellow-900 dark:text-yellow-200">Create anyway</span>
              </label>
            </div>
          </div>
        )}

        {/* Contacts preview table */}
        <div className="border border-gray-200 dark:border-slate-600 rounded-lg overflow-hidden">
          <div className="bg-gray-100 dark:bg-slate-700 px-4 py-3 border-b border-gray-200 dark:border-slate-600">
            <h4 className="font-bold text-navy-900 dark:text-white">Preview ({parsedContacts.length} contacts)</h4>
          </div>

          <div className="max-h-[350px] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-800 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Lender</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-20">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {parsedContacts.map((contact) => (
                  <tr key={contact.id} className={`hover:bg-gray-50 dark:hover:bg-slate-700/50 ${!contact.isValid ? 'bg-red-50 dark:bg-red-900/10' : contact.isDuplicate ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''
                    }`}>
                    <td className="px-4 py-3">
                      {!contact.isValid ? (
                        <div className="flex items-center gap-1 text-red-500">
                          <XCircle size={16} />
                          <span className="text-xs">{contact.errors[0]}</span>
                        </div>
                      ) : contact.isDuplicate ? (
                        <div className="flex items-center gap-1 text-yellow-500">
                          <AlertTriangle size={16} />
                          <span className="text-xs">Duplicate</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-green-500">
                          <CheckCircle2 size={16} />
                          <span className="text-xs">Ready</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-navy-900 dark:text-white">{contact.fullName || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{contact.email || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{contact.phone || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{contact.lender || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => removeFromPreview(contact.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                        title="Remove from import"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between">
          <button
            onClick={() => setCurrentStep('mapping')}
            className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg font-medium flex items-center gap-2"
          >
            <ArrowLeft size={16} /> Back to Mapping
          </button>
          <button
            onClick={executeImport}
            disabled={validCount === 0}
            className="px-6 py-2 bg-brand-orange hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold flex items-center gap-2"
          >
            <Users size={16} /> Import {validCount} Contact{validCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    );
  };

  // Render importing step (progress)
  const renderImportingStep = () => (
    <div className="text-center py-12">
      <Loader2 size={64} className="text-brand-orange animate-spin mx-auto mb-6" />
      <h3 className="text-xl font-bold text-navy-900 dark:text-white mb-2">Importing Contacts...</h3>
      <p className="text-gray-500 dark:text-gray-400 mb-6">Please wait while we process your data</p>

      {/* Progress bar */}
      <div className="max-w-md mx-auto">
        <div className="h-3 bg-gray-200 dark:bg-slate-600 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-orange transition-all duration-300"
            style={{ width: `${importProgress}%` }}
          />
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{importProgress}% complete</p>
      </div>
    </div>
  );

  // Render complete step
  const renderCompleteStep = () => (
    <div className="text-center py-8">
      <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
        <CheckCircle2 size={48} />
      </div>
      <h3 className="text-xl font-bold text-navy-900 dark:text-white mb-2">Import Complete!</h3>
      <p className="text-gray-500 dark:text-gray-400 mb-6">Your contacts have been processed</p>

      {/* Results summary */}
      <div className="max-w-md mx-auto bg-gray-50 dark:bg-slate-700/50 rounded-lg p-6 mb-6 text-left">
        <h4 className="font-bold text-navy-900 dark:text-white mb-4">Results Summary</h4>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-300">Total Processed</span>
            <span className="font-bold text-navy-900 dark:text-white">{importResults.total}</span>
          </div>
          <div className="flex justify-between items-center text-green-600 dark:text-green-400">
            <span className="flex items-center gap-2"><CheckCircle2 size={16} /> Created</span>
            <span className="font-bold">{importResults.created}</span>
          </div>
          <div className="flex justify-between items-center text-blue-600 dark:text-blue-400">
            <span className="flex items-center gap-2"><RefreshCw size={16} /> Updated</span>
            <span className="font-bold">{importResults.updated}</span>
          </div>
          <div className="flex justify-between items-center text-yellow-600 dark:text-yellow-400">
            <span className="flex items-center gap-2"><AlertTriangle size={16} /> Skipped</span>
            <span className="font-bold">{importResults.skipped}</span>
          </div>
        </div>
      </div>

      {/* Error details */}
      {importResults.errors.length > 0 && (
        <div className="max-w-md mx-auto bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6 text-left">
          <h4 className="font-bold text-red-800 dark:text-red-300 mb-2">Errors ({importResults.errors.length})</h4>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {importResults.errors.map((err, i) => (
              <p key={i} className="text-sm text-red-700 dark:text-red-400">
                Row {err.row}: {err.error}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-center gap-4">
        <button
          onClick={resetImport}
          className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg font-medium flex items-center gap-2"
        >
          <RefreshCw size={16} /> Import More
        </button>
        <button
          onClick={onClose}
          className="px-6 py-2 bg-navy-700 hover:bg-navy-800 text-white rounded-lg font-bold"
        >
          Done
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-gray-200 dark:border-slate-700">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center bg-gray-50 dark:bg-slate-700">
          <div>
            <h2 className="text-xl font-bold text-navy-900 dark:text-white">Bulk Import Contacts</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Import contacts from CSV, Excel, or PDF files</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-full text-gray-500 dark:text-gray-400 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          <StepIndicator />

          {currentStep === 'upload' && renderUploadStep()}
          {currentStep === 'mapping' && renderMappingStep()}
          {currentStep === 'preview' && renderPreviewStep()}
          {currentStep === 'importing' && renderImportingStep()}
          {currentStep === 'complete' && renderCompleteStep()}
        </div>
      </div>
    </div>
  );
};

export default BulkImport;
