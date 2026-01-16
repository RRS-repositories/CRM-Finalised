
import { ClaimStatus, Contact, KPI, Conversation, Document, Template, TemplateFolder, Form } from './types';

export const MOCK_CONTACTS: Contact[] = [];

export const PIPELINE_CATEGORIES: { id: string, title: string, color: string, statuses: ClaimStatus[] }[] = [
  {
    id: 'lead',
    title: 'Lead Generation',
    color: 'border-l-blue-500',
    statuses: [
      ClaimStatus.NEW_LEAD, ClaimStatus.CONTACT_ATTEMPTED, ClaimStatus.IN_CONVERSATION,
      ClaimStatus.QUALIFICATION_CALL, ClaimStatus.QUALIFIED_LEAD, ClaimStatus.NOT_QUALIFIED
    ]
  },
  {
    id: 'onboarding',
    title: 'Client Onboarding',
    color: 'border-l-indigo-500',
    statuses: [
      ClaimStatus.ONBOARDING_STARTED, ClaimStatus.ID_VERIFICATION_PENDING, ClaimStatus.ID_VERIFIED,
      ClaimStatus.QUESTIONNAIRE_SENT, ClaimStatus.QUESTIONNAIRE_COMPLETE, ClaimStatus.LOA_SENT,
      ClaimStatus.LOA_SIGNED, ClaimStatus.BANK_STATEMENTS_REQUESTED, ClaimStatus.BANK_STATEMENTS_RECEIVED,
      ClaimStatus.ONBOARDING_COMPLETE
    ]
  },
  {
    id: 'dsar',
    title: 'DSAR Process',
    color: 'border-l-purple-500',
    statuses: [
      ClaimStatus.DSAR_PREPARED, ClaimStatus.DSAR_SENT, ClaimStatus.DSAR_ACKNOWLEDGED,
      ClaimStatus.DSAR_FOLLOW_UP, ClaimStatus.DSAR_RECEIVED, ClaimStatus.DSAR_ESCALATED,
      ClaimStatus.DATA_ANALYSIS
    ]
  },
  {
    id: 'complaint',
    title: 'Complaint Processing',
    color: 'border-l-orange-500',
    statuses: [
      ClaimStatus.COMPLAINT_DRAFTED, ClaimStatus.CLIENT_REVIEW, ClaimStatus.COMPLAINT_APPROVED,
      ClaimStatus.COMPLAINT_SUBMITTED, ClaimStatus.COMPLAINT_ACKNOWLEDGED, ClaimStatus.AWAITING_RESPONSE,
      ClaimStatus.RESPONSE_RECEIVED, ClaimStatus.RESPONSE_UNDER_REVIEW
    ]
  },
  {
    id: 'fos',
    title: 'FOS Escalation',
    color: 'border-l-red-500',
    statuses: [
      ClaimStatus.FOS_REFERRAL_PREPARED, ClaimStatus.FOS_SUBMITTED, ClaimStatus.FOS_CASE_NUMBER,
      ClaimStatus.FOS_INVESTIGATION, ClaimStatus.FOS_PROVISIONAL_DECISION, ClaimStatus.FOS_FINAL_DECISION,
      ClaimStatus.FOS_APPEAL
    ]
  },
  {
    id: 'resolution',
    title: 'Resolution & Payment',
    color: 'border-l-green-500',
    statuses: [
      ClaimStatus.OFFER_RECEIVED, ClaimStatus.OFFER_NEGOTIATION, ClaimStatus.OFFER_ACCEPTED,
      ClaimStatus.AWAITING_PAYMENT, ClaimStatus.PAYMENT_RECEIVED, ClaimStatus.FEE_DEDUCTED,
      ClaimStatus.CLIENT_PAID, ClaimStatus.CLAIM_SUCCESSFUL, ClaimStatus.CLAIM_UNSUCCESSFUL,
      ClaimStatus.CLAIM_WITHDRAWN
    ]
  },
];

export const MOCK_KPIS: KPI[] = [
  { label: 'Total Contacts', value: 1248, change: 12.5, trend: 'up' },
  { label: 'Active Opportunities', value: 856, change: 8.2, trend: 'up' },
  { label: 'Pipeline Value', value: '£3.2M', change: 15.3, trend: 'up' },
  { label: 'Conversion Rate', value: '24.8%', change: -2.1, trend: 'down' },
];

export const FUNNEL_DATA = [
  { name: 'Leads', value: 1200 },
  { name: 'Onboarding', value: 900 },
  { name: 'DSAR', value: 700 },
  { name: 'Complaint', value: 500 },
  { name: 'Resolution', value: 300 },
];

export const TREND_DATA = [
  { name: 'Jan', claims: 65 },
  { name: 'Feb', claims: 85 },
  { name: 'Mar', claims: 120 },
  { name: 'Apr', claims: 110 },
  { name: 'May', claims: 145 },
  { name: 'Jun', claims: 190 },
];

export const MOCK_CONVERSATIONS: Conversation[] = [];

export const MOCK_DOCUMENTS: Document[] = [];

export const MOCK_TEMPLATE_FOLDERS: TemplateFolder[] = [
  { id: 'client', name: 'Client', count: 1 },
  { id: 'corporate', name: 'Corporate', count: 1 },
  { id: 'court', name: 'Court', count: 0 },
  { id: 'employment', name: 'Employment', count: 0 },
  { id: 'estate', name: 'Estate Planning', count: 0 },
  { id: 'general', name: 'General', count: 1 },
  { id: 'ip', name: 'IP', count: 0 },
  { id: 'litigation', name: 'Litigation', count: 0 },
];

export const MOCK_TEMPLATES: Template[] = [
  {
    id: 't1',
    name: 'Letter of Authority (LOA)',
    category: 'Client',
    description: 'Client authorization to act on their behalf.',
    lastModified: '2024-03-15',
    content: `<div style="font-family: 'Times New Roman', serif; padding: 40px; line-height: 1.6;">
<h2 style="text-align: center; text-decoration: underline;">LETTER OF AUTHORITY</h2>
<p><br/></p>
<p><strong>TO WHOM IT MAY CONCERN</strong></p>
<p><br/></p>
<p>I, <span style="background-color: #e0f2fe; padding: 2px 6px; border-radius: 4px; font-weight: bold;" class="mappable-field" data-type="text" data-mapping="fullName">{{client.name}}</span>, born on <span style="background-color: #e0f2fe; padding: 2px 6px; border-radius: 4px;" class="mappable-field" data-type="date" data-mapping="dob">{{client.dob}}</span>, of <span style="background-color: #e0f2fe; padding: 2px 6px; border-radius: 4px;" class="mappable-field" data-type="text" data-mapping="address">{{client.address}}</span>, hereby authorize FastAction Claims to act on my behalf in relation to my claim against <span style="background-color: #e0f2fe; padding: 2px 6px; border-radius: 4px;" class="mappable-field" data-type="text" data-mapping="lender">{{lender.name}}</span>.</p>
<p><br/></p>
<p>They are authorized to:</p>
<ol>
<li>Request and receive all data (DSAR).</li>
<li>Submit complaints.</li>
<li>Negotiate settlements.</li>
</ol>
<p><br/></p>
<p>This authority is valid until further notice.</p>
<p><br/></p>
<div style="display: flex; gap: 20px; align-items: flex-end;">
  <div>
    <p>Signed:</p>
    <div class="mappable-field" data-type="signature" data-mapping="signature" style="border-bottom: 1px solid #000; width: 250px; height: 60px; display: flex; align-items: flex-end;">
       <span style="color: #999; font-style: italic; font-size: 12px;">Client Signature</span>
    </div>
  </div>
  <div>
    <p>Date:</p>
    <div class="mappable-field" data-type="date" data-mapping="date.today" style="border-bottom: 1px solid #000; width: 150px; height: 30px;">
       {{date.today}}
    </div>
  </div>
</div>
</div>`
  },
  {
    id: 't2',
    name: 'DSAR Request Letter',
    category: 'General',
    description: 'Data Subject Access Request to lenders.',
    lastModified: '2024-02-28',
    content: `To the Data Protection Officer, {{lender.name}}

Re: Data Subject Access Request
Client: {{client.name}}
DOB: {{client.dob}}
Address: {{client.address}}

Please provide all data held regarding the above individual, specifically including:
- All loan agreements
- All statements of account
- All creditworthiness assessments
- All notes and correspondence

This request is made under GDPR Article 15. Please respond within one calendar month.`
  },
  {
    id: 't3',
    name: 'Complaint Letter',
    category: 'Legal',
    description: 'Formal complaint to lender regarding irresponsible lending.',
    lastModified: '2024-03-18',
    content: `Complaint Dept, {{lender.name}}

Re: Formal Complaint - Irresponsible Lending
Client: {{client.name}}
Reference: {{claim.reference}}

We write to formally complain about the loans issued to our client. We believe these loans were unaffordable and issued without proper checks, in breach of FCA CONC 5.2A.

Our client was already indebted and had signs of financial difficulty.

We request a refund of all interest and charges, plus 8% statutory interest.`
  },
  {
    id: 't4',
    name: 'Invoice',
    category: 'Client',
    description: 'Fee invoice to client after settlement.',
    lastModified: '2024-03-20',
    content: `INVOICE

Client: {{client.name}}
Date: {{date.today}}
Ref: {{claim.reference}}

Description: Success Fee for claim against {{lender.name}}.
Settlement Amount: {{claim.amount}}

Fee (30% + VAT): £XXX.XX

Please pay within 14 days.`
  },
  {
    id: 't5',
    name: 'FOS Submission Pack',
    category: 'Legal',
    description: 'Documentation package for Ombudsman.',
    lastModified: '2024-03-22',
    content: `Financial Ombudsman Service

Re: {{client.name}} v {{lender.name}}

We are escalating this complaint to the FOS as the lender has rejected our valid complaint.

Enclosed:
1. Complaint Letter
2. Final Response Letter
3. Loan Summary
4. Affordability Evidence

We submit that the lender failed to assess creditworthiness properly.`
  },
  {
    id: 't6',
    name: 'FOS Authorization',
    category: 'Client',
    description: 'Client authorization for FOS escalation.',
    lastModified: '2024-03-22',
    content: `I, {{client.name}}, authorize the Financial Ombudsman Service to investigate my complaint against {{lender.name}}.

I authorize FastAction Claims to represent me in this matter.

Signed: __________________________
Date: {{date.today}}`
  }
];

export const TEMPLATE_VARIABLES = [
  {
    category: 'Client Details', vars: [
      { key: '{{client.name}}', label: 'Client Name' },
      { key: '{{client.email}}', label: 'Client Email' },
      { key: '{{client.address}}', label: 'Client Address' },
      { key: '{{client.dob}}', label: 'Date of Birth' }
    ]
  },
  {
    category: 'Lender Information', vars: [
      { key: '{{lender.name}}', label: 'Lender Name' },
      { key: '{{lender.complaints_email}}', label: 'Complaints Email' }
    ]
  },
  {
    category: 'Claim Details', vars: [
      { key: '{{claim.reference}}', label: 'Claim Reference' },
      { key: '{{claim.amount}}', label: 'Claim Value' }
    ]
  },
  {
    category: 'Date Variables', vars: [
      { key: '{{date.today}}', label: 'Current Date' },
      { key: '{{date.deadline}}', label: 'Deadline Date' }
    ]
  }
];

export const MOCK_FORMS: Form[] = [
  {
    id: 'f1',
    name: 'Client Onboarding Questionnaire',
    description: 'Initial data collection for new irresponsible lending claims.',
    createdAt: '2024-03-01',
    responseCount: 142,
    status: 'Published',
    elements: [
      { id: 'e1', type: 'text', label: 'Full Name', required: true, mappingKey: 'fullName' },
      { id: 'e2', type: 'date', label: 'Date of Birth', required: true, mappingKey: 'dob' },
      { id: 'e3', type: 'text', label: 'Current Address', required: true, mappingKey: 'address' },
      { id: 'e4', type: 'text', label: 'Name of Lender', required: true, mappingKey: 'lender' },
      { id: 'e5', type: 'number', label: 'Approximate Loan Amount', required: false, mappingKey: 'claimValue' },
      { id: 'e6', type: 'signature', label: 'Client Signature', required: true, mappingKey: 'signature' }
    ]
  },
  {
    id: 'f2',
    name: 'Letter of Authority (LOA) Sign-off',
    description: 'Digital signature collection for LOA.',
    createdAt: '2024-03-10',
    responseCount: 89,
    status: 'Published',
    elements: [
      { id: 'e1', type: 'text', label: 'I authorize FastAction to act on my behalf', required: false, placeholder: 'Read only statement' },
      { id: 'e2', type: 'signature', label: 'Signature', required: true }
    ]
  },
  {
    id: 'f3',
    name: 'Compensation Claim Landing Page',
    description: 'Public facing form for lead generation connected to LOA.',
    createdAt: '2024-04-05',
    responseCount: 12,
    status: 'Published',
    elements: [
      { id: 'e1', type: 'text', label: 'Full Name', required: true, mappingKey: 'fullName', placeholder: 'Enter your full legal name' },
      { id: 'e2', type: 'date', label: 'Date of Birth', required: true, mappingKey: 'dob' },
      { id: 'e3', type: 'text', label: 'Email Address', required: true, mappingKey: 'email', placeholder: 'your@email.com' },
      { id: 'e4', type: 'textarea', label: 'Current Address', required: true, mappingKey: 'address', placeholder: 'Full address including postcode' },
      { id: 'e5', type: 'text', label: 'Lender Name', required: true, mappingKey: 'lender', placeholder: 'e.g. Vanquis, Amigo' },
      { id: 'e6', type: 'signature', label: 'Sign to Authorize (LOA)', required: true, mappingKey: 'signature' },
      { id: 'e7', type: 'terms', label: 'Agreement', required: true, placeholder: 'I agree to the Terms of Service and Privacy Policy.' }
    ]
  }
];
