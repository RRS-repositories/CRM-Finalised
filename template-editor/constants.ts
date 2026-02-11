// template-editor/constants.ts — Page dimensions and default variables

import { CRMVariable } from './types';

export const PAGE_CONFIG = {
  width: 794,          // px — A4 at 96dpi
  height: 1123,        // px — A4 at 96dpi
  paddingTop: 72,      // px — ~19mm margin
  paddingBottom: 72,
  paddingLeft: 80,
  paddingRight: 80,
  contentHeight: 979,  // height - paddingTop - paddingBottom = usable area
} as const;

export const DEFAULT_CRM_VARIABLES: CRMVariable[] = [
  // Client Details
  { key: 'client.fullName', label: 'Full Name', category: 'Client Details' },
  { key: 'client.firstName', label: 'First Name', category: 'Client Details' },
  { key: 'client.lastName', label: 'Last Name', category: 'Client Details' },
  { key: 'client.email', label: 'Email', category: 'Client Details' },
  { key: 'client.phone', label: 'Phone', category: 'Client Details' },
  { key: 'client.address', label: 'Address', category: 'Client Details' },
  { key: 'client.dateOfBirth', label: 'Date of Birth', category: 'Client Details' },

  // Claim Details
  { key: 'claim.lender', label: 'Lender', category: 'Claim Details' },
  { key: 'claim.clientId', label: 'Client ID', category: 'Claim Details' },
  { key: 'claim.caseRef', label: 'Case Reference', category: 'Claim Details' },
  { key: 'claim.claimValue', label: 'Claim Value', category: 'Claim Details' },

  // Lender Details (from all_lenders_details.json)
  { key: 'lender.companyName', label: 'Lender Company Name', category: 'Lender Details' },
  { key: 'lender.address', label: 'Lender Address', category: 'Lender Details' },
  { key: 'lender.city', label: 'Lender City', category: 'Lender Details' },
  { key: 'lender.postcode', label: 'Lender Postcode', category: 'Lender Details' },
  { key: 'lender.email', label: 'Lender Email', category: 'Lender Details' },

  // Firm Details
  { key: 'firm.name', label: 'Firm Name', category: 'Firm Details' },
  { key: 'firm.address', label: 'Firm Address', category: 'Firm Details' },
  { key: 'firm.phone', label: 'Firm Phone', category: 'Firm Details' },

  // System
  { key: 'system.today', label: "Today's Date", category: 'System' },
  { key: 'system.year', label: 'Current Year', category: 'System' },
];
