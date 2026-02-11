import { create } from 'zustand';

export interface TemplateVariable {
  id: string;
  name: string;
  key: string;
  category: 'client' | 'claim' | 'lender' | 'system' | 'custom';
  type: 'text' | 'date' | 'number' | 'email' | 'phone';
  defaultValue?: string;
  value?: string;
}

const DEFAULT_VARIABLES: TemplateVariable[] = [
  // Client Details
  { id: 'var_001', name: 'Full Name',        key: 'client.full_name',      category: 'client', type: 'text' },
  { id: 'var_002', name: 'First Name',       key: 'client.first_name',     category: 'client', type: 'text' },
  { id: 'var_003', name: 'Last Name',        key: 'client.last_name',      category: 'client', type: 'text' },
  { id: 'var_004', name: 'Email',            key: 'client.email',          category: 'client', type: 'email' },
  { id: 'var_005', name: 'Phone',            key: 'client.phone',          category: 'client', type: 'phone' },
  { id: 'var_006', name: 'Address',          key: 'client.address',        category: 'client', type: 'text' },
  { id: 'var_007', name: 'Date of Birth',    key: 'client.dob',            category: 'client', type: 'date' },
  { id: 'var_008', name: 'National Insurance', key: 'client.ni_number',    category: 'client', type: 'text' },

  // Claim Details
  { id: 'var_101', name: 'Lender',           key: 'claim.lender',          category: 'claim', type: 'text' },
  { id: 'var_102', name: 'Claim Value',      key: 'claim.claimValue',      category: 'claim', type: 'number' },
  { id: 'var_103', name: 'Case Reference',   key: 'claim.caseRef',         category: 'claim', type: 'text' },
  { id: 'var_104', name: 'Client ID',        key: 'claim.clientId',        category: 'claim', type: 'text' },
  { id: 'var_105', name: 'Loan Amount',      key: 'claim.loan_amount',     category: 'claim', type: 'number' },
  { id: 'var_106', name: 'Loan Date',        key: 'claim.loan_date',       category: 'claim', type: 'date' },
  { id: 'var_107', name: 'Account Number',   key: 'claim.account_number',  category: 'claim', type: 'text' },
  { id: 'var_108', name: 'Interest Rate',    key: 'claim.interest_rate',   category: 'claim', type: 'number' },
  { id: 'var_109', name: 'Total Repaid',     key: 'claim.total_repaid',    category: 'claim', type: 'number' },
  { id: 'var_110', name: 'Redress Amount',   key: 'claim.redress_amount',  category: 'claim', type: 'number' },

  // Lender Details (from all_lenders_details.json)
  { id: 'var_151', name: 'Lender Company Name', key: 'lender.companyName', category: 'lender', type: 'text' },
  { id: 'var_152', name: 'Lender Address',   key: 'lender.address',        category: 'lender', type: 'text' },
  { id: 'var_153', name: 'Lender City',      key: 'lender.city',           category: 'lender', type: 'text' },
  { id: 'var_154', name: 'Lender Postcode',  key: 'lender.postcode',       category: 'lender', type: 'text' },
  { id: 'var_155', name: 'Lender Email',     key: 'lender.email',          category: 'lender', type: 'email' },

  // Firm Details
  { id: 'var_201', name: 'Firm Name',        key: 'firm.name',             category: 'system', type: 'text', defaultValue: 'Rowan Rose Solicitors' },
  { id: 'var_202', name: 'SRA Number',       key: 'firm.sra_number',       category: 'system', type: 'text', defaultValue: '8000843' },
  { id: 'var_203', name: 'Firm Address',     key: 'firm.address',          category: 'system', type: 'text', defaultValue: 'Boat Shed, Exchange Quay, Salford M5 3EQ' },
  { id: 'var_204', name: 'Solicitor Name',   key: 'firm.solicitor_name',   category: 'system', type: 'text' },

  // System / Document
  { id: 'var_301', name: "Today's Date",     key: 'system.today',          category: 'system', type: 'date' },
  { id: 'var_302', name: 'Document Date',    key: 'system.doc_date',       category: 'system', type: 'date' },
  { id: 'var_303', name: 'Reference Number', key: 'system.ref_number',     category: 'system', type: 'text' },
];

interface VariableStore {
  variables: TemplateVariable[];
  customVariables: TemplateVariable[];
  addCustomVariable: (name: string) => TemplateVariable;
  removeCustomVariable: (id: string) => void;
  setVariableValue: (key: string, value: string) => void;
  getVariableByKey: (key: string) => TemplateVariable | undefined;
  getAllVariables: () => TemplateVariable[];
  setCustomVariables: (vars: TemplateVariable[]) => void;
  resetCustomVariables: () => void;
}

export const useVariableStore = create<VariableStore>((set, get) => ({
  variables: DEFAULT_VARIABLES,
  customVariables: [],

  addCustomVariable: (name: string) => {
    const newVar: TemplateVariable = {
      id: `var_custom_${Date.now()}`,
      name,
      key: `custom.${name.toLowerCase().replace(/\s+/g, '_')}`,
      category: 'custom',
      type: 'text',
    };
    set(state => ({ customVariables: [...state.customVariables, newVar] }));
    return newVar;
  },

  removeCustomVariable: (id) =>
    set(state => ({
      customVariables: state.customVariables.filter(v => v.id !== id)
    })),

  setVariableValue: (key, value) =>
    set(state => ({
      variables: state.variables.map(v =>
        v.key === key ? { ...v, value } : v
      ),
      customVariables: state.customVariables.map(v =>
        v.key === key ? { ...v, value } : v
      ),
    })),

  getVariableByKey: (key) => {
    const { variables, customVariables } = get();
    return [...variables, ...customVariables].find(v => v.key === key);
  },

  getAllVariables: () => {
    const { variables, customVariables } = get();
    return [...variables, ...customVariables];
  },

  setCustomVariables: (vars) => set({ customVariables: vars }),

  resetCustomVariables: () => set({ customVariables: [] }),
}));
