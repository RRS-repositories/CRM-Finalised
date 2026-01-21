
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { Contact, ClaimStatus, Document, Template, Form, User, Role, Claim, ActivityLog, Notification, ViewState, CRMCommunication, WorkflowTrigger, CRMNote, ActionLogEntry, BankDetails, PreviousAddressEntry } from '../types';
import { MOCK_CONTACTS, MOCK_DOCUMENTS, MOCK_TEMPLATES, MOCK_FORMS, WORKFLOW_TYPES } from '../constants';
import { emailService } from '../services/emailService';
import { API_ENDPOINTS } from '../src/config';

interface PendingRegistration {
  email: string;
  fullName: string;
  phone: string;
  password: string; // In a real app, this should be hashed immediately
  code: string;
  expiresAt: number;
}

interface Appointment {
  id: string;
  title: string;
  date: string;
  contactId?: string;
  description?: string;
}

interface ActiveContext {
  type: 'contact' | 'claim' | 'page';
  id?: string;
  name?: string;
  data?: any;
}

type Theme = 'light' | 'dark';

interface CRMContextType {
  // Auth State
  currentUser: User | null;
  users: User[]; // For Management View
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;

  // Registration Flow
  initiateRegistration: (email: string, password: string, fullName: string, phone: string) => Promise<boolean>;
  verifyRegistration: (email: string, code: string) => Promise<{ success: boolean; message: string }>;

  updateUserRole: (userId: string, newRole: Role) => void;
  updateUserStatus: (userId: string, updates: { isApproved?: boolean }) => void;

  // Password Reset
  requestPasswordReset: (email: string) => Promise<void>; // Void return to not reveal user existence
  resetPassword: (token: string, newPassword: string) => Promise<{ success: boolean; message: string }>;

  // CRM Data
  contacts: Contact[];
  documents: Document[];
  templates: Template[];
  forms: Form[];
  claims: Claim[];
  appointments: Appointment[];
  activityLogs: ActivityLog[];

  // Notifications
  notifications: Notification[];
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  removeNotification: (id: string) => void;

  // Context Awareness for AI
  activeContext: ActiveContext | null;
  setActiveContext: (ctx: ActiveContext | null) => void;

  updateContactStatus: (id: string, newStatus: string) => { success: boolean; message: string };
  updateContact: (contact: Contact) => Promise<{ success: boolean; message: string }>;
  addContact: (contact: Partial<Contact>) => Promise<{ success: boolean; message: string; id?: string }>;
  deleteContacts: (ids: string[]) => { success: boolean; message: string };
  getContactDetails: (nameOrId: string) => Contact | undefined;
  getPipelineStats: () => { totalValue: number; count: number; byStage: Record<string, number> };

  // Claims
  addClaim: (claim: Partial<Claim>) => Promise<{ success: boolean; message: string; id?: string }>;
  updateClaim: (claim: Claim) => { success: boolean; message: string };
  updateClaimStatus: (claimId: string, newStatus: string) => { success: boolean; message: string };
  bulkUpdateClaims: (criteria: { lender?: string; status?: string; minDaysInStage?: number }, newStatus: string) => { success: boolean; count: number; message: string };

  // Calendar
  addAppointment: (appt: Partial<Appointment>) => { success: boolean; message: string; id: string };
  updateAppointment: (appt: Appointment) => { success: boolean; message: string };
  deleteAppointment: (id: string) => { success: boolean; message: string };

  // Document Methods
  addDocument: (doc: Partial<Document>, file?: File) => Promise<{ success: boolean; message: string; id?: string }>;
  updateDocument: (doc: Document) => { success: boolean; message: string };

  // Template Methods
  addTemplate: (tpl: Partial<Template>) => { success: boolean; message: string; id?: string };
  updateTemplate: (tpl: Template) => { success: boolean; message: string };

  // Form Methods
  addForm: (frm: Partial<Form>) => { success: boolean; message: string; id?: string };
  updateForm: (frm: Form) => { success: boolean; message: string };
  deleteForm: (id: string) => { success: boolean; message: string };

  // Notes (Legacy)
  addNote: (contactId: string, content: string) => void;

  // ============================================
  // CRM Specification Methods (Phase 3)
  // ============================================

  // Communications
  communications: CRMCommunication[];
  fetchCommunications: (clientId: string) => Promise<void>;
  addCommunication: (comm: Partial<CRMCommunication>) => Promise<{ success: boolean; message: string; id?: string }>;

  // Workflow Triggers
  workflowTriggers: WorkflowTrigger[];
  fetchWorkflows: (clientId: string) => Promise<void>;
  triggerWorkflow: (clientId: string, workflowType: string) => Promise<{ success: boolean; message: string; id?: string }>;
  cancelWorkflow: (triggerId: string) => Promise<{ success: boolean; message: string }>;

  // Notes (Enhanced CRM)
  crmNotes: CRMNote[];
  fetchNotes: (clientId: string) => Promise<void>;
  addCRMNote: (clientId: string, content: string, pinned?: boolean) => Promise<{ success: boolean; message: string; id?: string }>;
  updateCRMNote: (noteId: string, content: string, pinned?: boolean) => Promise<{ success: boolean; message: string }>;
  deleteCRMNote: (noteId: string) => Promise<{ success: boolean; message: string }>;

  // Action Timeline
  actionLogs: ActionLogEntry[];
  fetchActionLogs: (clientId: string) => Promise<void>;

  // Extended Contact Fields (Bank Details, Addresses)
  updateContactExtended: (contactId: string, data: {
    bankDetails?: BankDetails;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      state_county?: string;
      postalCode?: string;
    };
    previousAddress?: {
      line1?: string;
      line2?: string;
      city?: string;
      county?: string;
      postalCode?: string;
    };
    previousAddresses?: Array<{
      id: string;
      line1: string;
      line2?: string;
      city: string;
      county?: string;
      postalCode: string;
    }>;
    clientId?: string;
  }) => Promise<{ success: boolean; message: string }>;

  // Extended Claim Fields
  updateClaimExtended: (claimId: string, data: Record<string, any>) => Promise<{ success: boolean; message: string }>;
  fetchFullClaim: (claimId: string) => Promise<any>;

  // Theme
  theme: Theme;
  toggleTheme: () => void;

  // View Navigation
  currentView: ViewState;
  setCurrentView: (view: ViewState) => void;
}

const CRMContext = createContext<CRMContextType | undefined>(undefined);
const API_BASE_URL = API_ENDPOINTS.api;

const INITIAL_USERS: User[] = [
  {
    id: '1',
    email: 'info@fastactionclaims.co.uk',
    fullName: 'System Administrator',
    role: 'Management',
    isApproved: true,
    lastLogin: new Date()
  }
];

export const CRMProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);

  // Theme & View State
  const [theme, setTheme] = useState<Theme>('light');
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);

  // Temporary storage for users who haven't verified email yet
  const [pendingRegistrations, setPendingRegistrations] = useState<Record<string, PendingRegistration>>({});

  // Temporary storage for password resets
  const [resetTokens, setResetTokens] = useState<Record<string, { email: string, expiresAt: number }>>({});

  // CRM Data State
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activeContext, setActiveContext] = useState<ActiveContext | null>(null);

  // CRM Specification State (Phase 3)
  const [communications, setCommunications] = useState<CRMCommunication[]>([]);
  const [workflowTriggers, setWorkflowTriggers] = useState<WorkflowTrigger[]>([]);
  const [crmNotes, setCrmNotes] = useState<CRMNote[]>([]);
  const [actionLogs, setActionLogs] = useState<ActionLogEntry[]>([]);

  // Auth Persistence Initialization
  useEffect(() => {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (e) {
        console.error('Error parsing saved user:', e);
        localStorage.removeItem('currentUser');
      }
    }
  }, []);

  // Notification State
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Initialize Theme
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme;
    if (savedTheme) {
      setTheme(savedTheme);
      if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
      }
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Helper to add activity log
  const logActivity = (
    contactId: string,
    title: string,
    description: string,
    type: ActivityLog['type'],
    claimId?: string
  ) => {
    const newLog: ActivityLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      contactId,
      claimId,
      title,
      description,
      date: new Date().toISOString(),
      type
    };
    setActivityLogs(prev => [newLog, ...prev]);
  };

  // Helper to add notification with auto-exit animation
  const addNotification = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications(prev => [...prev, { id, type, message, isExiting: false }]);

    // Trigger remove sequence after 3 seconds
    setTimeout(() => {
      removeNotification(id);
    }, 3000);
  };

  const removeNotification = (id: string) => {
    // 1. Mark as exiting to trigger CSS animation
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isExiting: true } : n));

    // 2. Actually remove from state after animation completes (400ms match CSS)
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 400);
  };

  // --- Data Fetching ---

  const fetchContacts = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/contacts`);
      if (!response.ok) throw new Error('Failed to fetch contacts');
      const data = await response.json();

      if (!Array.isArray(data)) {
        console.error('Expected array of contacts, got:', data);
        return;
      }

      const mappedContacts: Contact[] = data.map((c: any) => ({
        id: c.id.toString(),
        firstName: c.first_name,
        lastName: c.last_name,
        fullName: c.full_name,
        email: c.email,
        phone: c.phone,
        status: ClaimStatus.NEW_LEAD, // Default if not in DB
        lastActivity: 'Active',
        source: c.source,
        dateOfBirth: c.dob,
        address: {
          line1: c.address_line_1,
          line2: c.address_line_2,
          city: c.city,
          state_county: c.state_county,
          postalCode: c.postal_code
        }
      }));
      setContacts(mappedContacts);

      // Fetch all cases in parallel
      const contactsWithCases = await Promise.all(mappedContacts.map(async (contact) => {
        try {
          const caseRes = await fetch(`${API_BASE_URL}/contacts/${contact.id}/cases`);
          if (!caseRes.ok) return [];
          const caseData = await caseRes.json();
          return caseData.map((cs: any) => ({
            id: cs.id.toString(),
            contactId: cs.contact_id.toString(),
            lender: cs.lender,
            status: cs.status as ClaimStatus,
            claimValue: Number(cs.claim_value),
            productType: cs.product_type,
            accountNumber: cs.account_number,
            startDate: cs.start_date ? new Date(cs.start_date).toLocaleDateString('en-GB') : '',
            daysInStage: 0
          }));
        } catch (e) {
          console.error(`Error fetching cases for contact ${contact.id}:`, e);
          return [];
        }
      }));

      setClaims(contactsWithCases.flat());
    } catch (error) {
      console.error('Error fetching data:', error);
      addNotification('error', 'Failed to load data from server. Ensure backend is running.');
    }
  };

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/documents`);
      if (!response.ok) throw new Error('Failed to fetch documents');
      const data = await response.json();

      const mappedDocs: Document[] = data.map((d: any) => ({
        id: d.id.toString(),
        name: d.name,
        type: d.type,
        category: d.category,
        url: d.url,
        size: d.size,
        version: d.version,
        tags: d.tags || [],
        associatedContactId: d.contact_id?.toString(),
        dateModified: d.created_at?.split('T')[0]
      }));

      setDocuments(mappedDocs);
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  useEffect(() => {
    const init = async () => {
      await fetchContacts();
      await fetchDocuments();
    };
    init();
  }, []);

  // Sync Activity Logs (Optional refactor if needed, otherwise keep mock for now)
  useEffect(() => {
    const initialLogs: ActivityLog[] = [];
    contacts.forEach(c => {
      initialLogs.push({
        id: `log-create-${c.id}`,
        contactId: c.id,
        title: 'New Lead',
        description: `Imported from ${c.source || 'Manual Input'}`,
        date: new Date().toISOString(),
        type: 'creation'
      });
    });
    setActivityLogs(initialLogs);
  }, [contacts.length]);

  // --- Auth Logic ---

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/users`);
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  useEffect(() => {
    if (currentUser?.role === 'Management') {
      fetchUsers();
    }
  }, [currentUser]);

  const login = async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (data.success) {
        setCurrentUser(data.user);
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        addNotification('success', `Welcome back, ${data.user.fullName}`);

        if (data.user.role === 'Management') {
          fetchUsers();
        }

        return { success: true };
      } else {
        return { success: false, message: data.message || 'Login failed' };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: 'Server connection error. Ensure backend is running.' };
    }
  };

  const initiateRegistration = async (email: string, password: string, fullName: string, phone: string): Promise<boolean> => {
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      addNotification('error', 'User already exists');
      return false; // User already exists
    }

    // Generate 6 digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Set expiry for 5 minutes from now
    const expiresAt = Date.now() + (5 * 60 * 1000);

    const pendingUser: PendingRegistration = {
      email,
      password,
      fullName,
      phone,
      code,
      expiresAt
    };

    setPendingRegistrations(prev => ({ ...prev, [email]: pendingUser }));

    // Send the simulated email
    await emailService.sendVerificationEmail(email, code);
    addNotification('info', 'Verification code sent to email');

    return true;
  };

  const verifyRegistration = async (email: string, code: string): Promise<{ success: boolean; message: string }> => {
    const pending = pendingRegistrations[email];
    if (!pending) return { success: false, message: "No registration in progress for this email." };
    if (pending.code !== code) return { success: false, message: "Invalid verification code." };
    if (Date.now() > pending.expiresAt) return { success: false, message: "Verification code expired." };

    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pending.email,
          password: pending.password,
          fullName: pending.fullName,
          phone: pending.phone
        })
      });

      const data = await response.json();
      if (data.success) {
        // Clear pending
        const newPending = { ...pendingRegistrations };
        delete newPending[email];
        setPendingRegistrations(newPending);

        // If a manager is somehow logged in (e.g. testing), refresh list
        if (currentUser?.role === 'Management') {
          fetchUsers();
        }

        return { success: true, message: "Registration successful. Please wait for Management approval." };
      } else {
        return { success: false, message: data.message || "Registration failed on server." };
      }
    } catch (err) {
      console.error('Registration error:', err);
      return { success: false, message: "Could not connect to server." };
    }
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('currentUser');
    addNotification('info', 'Logged out successfully');
  };

  const updateUserRole = async (userId: string, newRole: Role) => {
    const userToUpdate = users.find(u => u.id === userId);
    if (userToUpdate?.email === 'info@fastactionclaims.co.uk') return;

    try {
      const res = await fetch(`${API_BASE_URL}/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      });
      const data = await res.json();
      if (data.success) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
        addNotification('success', `User role updated to ${newRole}`);
      }
    } catch (err) {
      addNotification('error', 'Failed to update role');
    }
  };

  const updateUserStatus = async (userId: string, updates: { isApproved?: boolean }) => {
    const userToUpdate = users.find(u => u.id === userId);
    if (userToUpdate?.email === 'info@fastactionclaims.co.uk') return;

    try {
      const res = await fetch(`${API_BASE_URL}/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isApproved: updates.isApproved })
      });
      const data = await res.json();
      if (data.success) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updates } : u));
        if (updates.isApproved !== undefined) {
          addNotification('success', updates.isApproved ? 'User approved' : 'User approval revoked');
        } else {
          addNotification('success', 'User status updated');
        }
      }
    } catch (err) {
      addNotification('error', 'Failed to update status');
    }
  };

  // --- Forgot Password Logic ---

  const requestPasswordReset = async (email: string): Promise<void> => {
    // Always simulate delay to prevent user enumeration timing attacks
    await new Promise(resolve => setTimeout(resolve, 1500));

    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (user) {
      const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
      const expiresAt = Date.now() + (15 * 60 * 1000); // 15 mins

      setResetTokens(prev => ({ ...prev, [token]: { email: user.email, expiresAt } }));

      // Construct a mock URL (In real app this points to a route)
      const resetLink = `${window.location.origin}/reset-password?token=${token}`;
      await emailService.sendPasswordResetEmail(user.email, resetLink);
    }
    // Return void regardless of success to hide email existence
  };

  const resetPassword = async (token: string, newPassword: string): Promise<{ success: boolean; message: string }> => {
    await new Promise(resolve => setTimeout(resolve, 1000));

    const resetData = resetTokens[token];

    if (!resetData) {
      return { success: false, message: "Invalid or expired reset token." };
    }

    if (Date.now() > resetData.expiresAt) {
      return { success: false, message: "Token has expired." };
    }

    // Update password
    setUsers(prev => prev.map(u => {
      if (u.email.toLowerCase() === resetData.email.toLowerCase()) {
        return { ...u, password: newPassword };
      }
      return u;
    }));

    // Invalidate token
    const newTokens = { ...resetTokens };
    delete newTokens[token];
    setResetTokens(newTokens);

    addNotification('success', 'Password reset successfully');
    return { success: true, message: "Password reset successfully. You may now login." };
  };

  // --- Contact Logic ---
  const updateContactStatus = (id: string, newStatus: string) => {
    // Legacy function support - tries to update contact and its primary claim
    // Validate status exists in Enum
    const isValidStatus = Object.values(ClaimStatus).includes(newStatus as ClaimStatus);
    let statusToSet = newStatus;
    if (!isValidStatus) {
      const found = Object.values(ClaimStatus).find(s => s.toLowerCase() === newStatus.toLowerCase());
      if (found) statusToSet = found;
      else {
        addNotification('error', `Invalid status: ${newStatus}`);
        return { success: false, message: `Invalid status: ${newStatus}` };
      }
    }

    let found = false;
    const updatedContacts = contacts.map(c => {
      if (c.id === id || c.fullName.toLowerCase() === id.toLowerCase()) {
        found = true;
        logActivity(c.id, 'Status Updated', `Contact status changed to ${statusToSet}`, 'status_change');
        return { ...c, status: statusToSet as ClaimStatus, lastActivity: 'Just now', daysInStage: 0 };
      }
      return c;
    });

    if (!found) {
      addNotification('error', `Contact not found: ${id}`);
      return { success: false, message: `Contact not found: ${id}` };
    }
    setContacts(updatedContacts);

    setClaims(prev => prev.map(cl => {
      if (cl.contactId === id && cl.id.endsWith('-001')) {
        return { ...cl, status: statusToSet as ClaimStatus, daysInStage: 0 };
      }
      return cl;
    }));

    addNotification('success', `Status updated to ${statusToSet}`);
    return { success: true, message: `Updated ${id} to ${statusToSet}` };
  };

  const updateContact = async (contact: Contact) => {
    try {
      // Call the backend API to persist the update
      const response = await fetch(`${API_BASE_URL}/contacts/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: contact.firstName,
          last_name: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          dob: contact.dateOfBirth,
          address_line_1: contact.address?.line1,
          address_line_2: contact.address?.line2,
          city: contact.address?.city,
          state_county: contact.address?.state_county,
          postal_code: contact.address?.postalCode
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        addNotification('error', errorData.error || 'Failed to update contact');
        return { success: false, message: errorData.error || 'Failed to update contact' };
      }

      const updatedData = await response.json();

      // Update local state with the response
      const updated = contacts.map(c => {
        if (c.id === contact.id) {
          logActivity(c.id, 'Details Updated', 'Contact personal details were updated', 'note');
          return {
            ...contact,
            fullName: updatedData.full_name || contact.fullName,
            firstName: updatedData.first_name || contact.firstName,
            lastName: updatedData.last_name || contact.lastName,
            dateOfBirth: updatedData.dob || contact.dateOfBirth,
            address: {
              line1: updatedData.address_line_1 || contact.address?.line1,
              line2: updatedData.address_line_2 || contact.address?.line2,
              city: updatedData.city || contact.address?.city,
              state_county: updatedData.state_county || contact.address?.state_county,
              postalCode: updatedData.postal_code || contact.address?.postalCode
            }
          };
        }
        return c;
      });

      setContacts(updated);
      addNotification('success', 'Contact details updated successfully');
      return { success: true, message: `Updated contact ${contact.fullName}` };
    } catch (e: any) {
      addNotification('error', 'Failed to update contact');
      return { success: false, message: e.message };
    }
  };

  const addContact = async (contactData: Partial<Contact>) => {
    console.log('[CRMContext addContact] Received contactData:', contactData);

    const requestBody = {
      first_name: contactData.firstName,
      last_name: contactData.lastName,
      full_name: contactData.fullName,
      email: contactData.email,
      phone: contactData.phone,
      dob: contactData.dateOfBirth,
      address_line_1: contactData.address?.line1,
      address_line_2: contactData.address?.line2,
      city: contactData.address?.city,
      state_county: contactData.address?.state_county,
      postal_code: contactData.address?.postalCode,
      source: contactData.source || 'Manual Input'
    };

    console.log('[CRMContext addContact] Sending to API:', requestBody);

    try {
      const response = await fetch(`${API_BASE_URL}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
      }

      const c = await response.json();

      console.log('[CRMContext addContact] API Response:', c);

      if (!c || !c.id) {
        throw new Error('Invalid response from server - missing contact ID');
      }

      const newContact: Contact = {
        id: c.id.toString(),
        fullName: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
        firstName: c.first_name,
        lastName: c.last_name,
        email: c.email || '',
        phone: c.phone || '',
        dateOfBirth: c.dob,
        address: {
          line1: c.address_line_1,
          line2: c.address_line_2,
          city: c.city,
          state_county: c.state_county,
          postalCode: c.postal_code
        },
        status: ClaimStatus.NEW_LEAD,
        lastActivity: 'Just now',
        source: c.source
      };

      setContacts(prev => [...prev, newContact]);
      logActivity(newContact.id, 'Contact Created', `Contact created via ${newContact.source}`, 'creation');
      addNotification('success', `Contact ${newContact.fullName} created successfully`);
      return { success: true, message: `Created contact for ${newContact.fullName}`, id: newContact.id };
    } catch (e: any) {
      console.error('[CRMContext addContact] Error:', e);
      addNotification('error', `Failed to create contact: ${e.message}`);
      return { success: false, message: e.message };
    }
  };

  const deleteContacts = (ids: string[]) => {
    setContacts(prev => prev.filter(c => !ids.includes(c.id)));
    setClaims(prev => prev.filter(c => !ids.includes(c.contactId)));
    addNotification('success', `${ids.length} contact(s) deleted successfully`);
    return { success: true, message: `Deleted ${ids.length} contacts` };
  };

  const getContactDetails = (nameOrId: string) => {
    return contacts.find(c =>
      c.id === nameOrId ||
      c.fullName.toLowerCase().includes(nameOrId.toLowerCase())
    );
  };

  const getPipelineStats = () => {
    const totalValue = contacts.reduce((sum, c) => sum + (c.claimValue || 0), 0);
    const byStage = contacts.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return { totalValue, count: contacts.length, byStage };
  };

  // --- Claims Logic ---

  const addClaim = async (claimData: Partial<Claim>) => {
    if (!claimData.contactId) {
      addNotification('error', 'Contact ID required to add claim');
      return { success: false, message: 'Contact ID required' };
    }

    try {
      const response = await fetch(`${API_BASE_URL}/contacts/${claimData.contactId}/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lender: claimData.lender,
          status: claimData.status || ClaimStatus.NEW_LEAD,
          claim_value: claimData.claimValue,
          product_type: claimData.productType,
          account_number: claimData.accountNumber,
          start_date: claimData.startDate || new Date().toISOString().split('T')[0]
        })
      });
      const cs = await response.json();

      const newClaim: Claim = {
        id: cs.id.toString(),
        contactId: cs.contact_id.toString(),
        lender: cs.lender,
        status: cs.status as ClaimStatus,
        claimValue: Number(cs.claim_value),
        productType: cs.product_type,
        accountNumber: cs.account_number,
        startDate: cs.start_date,
        daysInStage: 0
      };

      setClaims(prev => [...prev, newClaim]);
      logActivity(newClaim.contactId, 'Claim Added', `New claim created for ${newClaim.lender}`, 'creation', newClaim.id);

      addNotification('success', 'Claim added successfully');
      return { success: true, message: 'Claim added', id: newClaim.id };
    } catch (e: any) {
      addNotification('error', 'Failed to add claim');
      return { success: false, message: e.message };
    }
  };

  const updateClaim = (claim: Claim) => {
    setClaims(prev => prev.map(c => c.id === claim.id ? claim : c));
    logActivity(claim.contactId, 'Claim Updated', `${claim.lender} claim details were updated`, 'claim_update', claim.id);

    if (claim.id.endsWith('-001')) {
      setContacts(prev => prev.map(c => {
        if (c.id === claim.contactId) {
          return {
            ...c,
            status: claim.status,
            claimValue: claim.claimValue,
            lender: claim.lender
          };
        }
        return c;
      }));
    }
    addNotification('success', 'Claim updated successfully');
    return { success: true, message: 'Claim updated' };
  };

  const updateClaimStatus = (claimId: string, newStatus: string) => {
    const isValidStatus = Object.values(ClaimStatus).includes(newStatus as ClaimStatus);
    if (!isValidStatus) {
      addNotification('error', 'Invalid status provided');
      return { success: false, message: 'Invalid status' };
    }

    // Find claim to log activity
    const claim = claims.find(c => c.id === claimId);
    if (claim) {
      logActivity(claim.contactId, 'Status Updated', `${claim.lender} claim moved to ${newStatus}`, 'status_change', claimId);
    }

    setClaims(prev => prev.map(c => {
      if (c.id === claimId) {
        return { ...c, status: newStatus as ClaimStatus, daysInStage: 0 };
      }
      return c;
    }));

    addNotification('success', 'Claim status updated');
    return { success: true, message: 'Status updated' };
  };

  // NEW: Bulk Update Logic
  const bulkUpdateClaims = (criteria: { lender?: string; status?: string; minDaysInStage?: number }, newStatus: string) => {
    const isValidStatus = Object.values(ClaimStatus).includes(newStatus as ClaimStatus);
    if (!isValidStatus) return { success: false, count: 0, message: `Invalid target status: ${newStatus}` };

    let count = 0;
    const affectedClaimIds: string[] = [];

    setClaims(prev => prev.map(c => {
      let matches = true;
      if (criteria.lender && !c.lender.toLowerCase().includes(criteria.lender.toLowerCase())) matches = false;
      if (criteria.status && c.status !== criteria.status) matches = false;
      if (criteria.minDaysInStage && (c.daysInStage || 0) < criteria.minDaysInStage) matches = false;

      if (matches) {
        count++;
        affectedClaimIds.push(c.id);
        // Log individual moves? Or one big log? Let's do individual for traceability in contact history
        logActivity(c.contactId, 'Bulk Status Update', `Claim moved to ${newStatus} via bulk operation`, 'status_change', c.id);
        return { ...c, status: newStatus as ClaimStatus, daysInStage: 0 };
      }
      return c;
    }));

    addNotification('success', `Bulk update: ${count} claims moved to ${newStatus}`);
    return { success: true, count, message: `Successfully moved ${count} claims to ${newStatus}.` };
  };

  // --- Calendar/Appointment Logic ---
  const addAppointment = (appt: Partial<Appointment>) => {
    const newAppt: Appointment = {
      id: `appt_${Date.now()}`,
      title: appt.title || 'Untitled Meeting',
      date: appt.date || new Date().toISOString(),
      contactId: appt.contactId,
      description: appt.description
    };
    setAppointments(prev => [...prev, newAppt]);
    if (appt.contactId) {
      logActivity(appt.contactId, 'Appointment Scheduled', `"${newAppt.title}" scheduled for ${new Date(newAppt.date).toLocaleDateString()}`, 'communication');
    }
    addNotification('success', 'Appointment scheduled');
    return { success: true, message: 'Appointment scheduled', id: newAppt.id };
  };

  const updateAppointment = (appt: Appointment) => {
    setAppointments(prev => prev.map(a => a.id === appt.id ? appt : a));
    if (appt.contactId) {
      logActivity(appt.contactId, 'Appointment Updated', `"${appt.title}" updated`, 'communication');
    }
    addNotification('success', 'Appointment updated');
    return { success: true, message: 'Appointment updated' };
  };

  const deleteAppointment = (id: string) => {
    const appt = appointments.find(a => a.id === id);
    setAppointments(prev => prev.filter(a => a.id !== id));
    if (appt?.contactId) {
      logActivity(appt.contactId, 'Appointment Cancelled', `"${appt.title}" was cancelled`, 'communication');
    }
    addNotification('success', 'Appointment deleted');
    return { success: true, message: 'Appointment deleted' };
  };

  // --- Document Logic ---
  const addDocument = async (docData: Partial<Document>, file?: File) => {
    let url = docData.url;
    let finalDocData = { ...docData };

    if (file) {
      try {
        const formData = new FormData();
        formData.append('document', file);
        if (docData.associatedContactId) {
          formData.append('contact_id', docData.associatedContactId);

          const response = await fetch(`${API_BASE_URL}/upload-document`, {
            method: 'POST',
            body: formData
          });
          const uploadResult = await response.json();
          if (uploadResult.success) {
            url = uploadResult.url;
          } else {
            throw new Error('Upload failed');
          }
        } else {
          const response = await fetch(`${API_BASE_URL}/upload-manual`, {
            method: 'POST',
            body: formData
          });
          const uploadResult = await response.json();
          if (uploadResult.success) {
            url = uploadResult.url;
          } else {
            throw new Error('Upload failed');
          }
        }
      } catch (e: any) {
        addNotification('error', 'Document upload failed');
        return { success: false, message: e.message };
      }
    }

    // Refresh document list from server to get the official DB record
    await fetchDocuments();

    if (docData.associatedContactId) {
      logActivity(docData.associatedContactId, 'Document Added', `New document uploaded`, 'note');
    }
    addNotification('success', `Document added successfully`);
    return { success: true, message: `Document added successfully` };
  };

  const updateDocument = (doc: Document) => {
    setDocuments(prev => prev.map(d => d.id === doc.id ? doc : d));
    addNotification('success', 'Document details updated');
    return { success: true, message: `Updated document: ${doc.name}` };
  };

  // --- Template Logic ---
  const addTemplate = (tplData: Partial<Template>) => {
    const newTpl: Template = {
      id: `t${Date.now()}`,
      name: tplData.name || 'Untitled Template',
      category: tplData.category || 'General',
      description: tplData.description || '',
      content: tplData.content || '',
      lastModified: new Date().toISOString().split('T')[0]
    };
    setTemplates(prev => [newTpl, ...prev]);
    addNotification('success', `Template '${newTpl.name}' created`);
    return { success: true, message: `Created template: ${newTpl.name}`, id: newTpl.id };
  };

  const updateTemplate = (tpl: Template) => {
    setTemplates(prev => prev.map(t => t.id === tpl.id ? tpl : t));
    addNotification('success', 'Template updated successfully');
    return { success: true, message: `Updated template: ${tpl.name}` };
  };

  // --- Form Logic ---
  const addForm = (formData: Partial<Form>) => {
    const newForm: Form = {
      id: `f${Date.now()}`,
      name: formData.name || 'Untitled Form',
      description: formData.description || '',
      elements: formData.elements || [],
      createdAt: new Date().toISOString().split('T')[0],
      responseCount: 0,
      status: 'Draft'
    };
    setForms(prev => [newForm, ...prev]);
    addNotification('success', `Form '${newForm.name}' created`);
    return { success: true, message: `Created form: ${newForm.name}`, id: newForm.id };
  };

  const updateForm = (frm: Form) => {
    setForms(prev => prev.map(f => f.id === frm.id ? frm : f));
    addNotification('success', 'Form updated successfully');
    return { success: true, message: `Updated form: ${frm.name}` };
  };

  const deleteForm = (id: string) => {
    setForms(prev => prev.filter(f => f.id !== id));
    addNotification('success', 'Form deleted successfully');
    return { success: true, message: `Deleted form` };
  };

  // --- Note Logic (Legacy) ---
  const addNote = (contactId: string, content: string) => {
    logActivity(contactId, 'Note Added', content, 'note');
    addNotification('success', 'Note added successfully');
  };

  // ============================================
  // CRM Specification Methods Implementation
  // ============================================

  // --- Communications ---
  const fetchCommunications = useCallback(async (clientId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/clients/${clientId}/communications`);
      if (!response.ok) throw new Error('Failed to fetch communications');
      const data = await response.json();

      const mappedComms: CRMCommunication[] = data.map((c: any) => ({
        id: c.id.toString(),
        clientId: c.client_id.toString(),
        channel: c.channel,
        direction: c.direction,
        subject: c.subject,
        content: c.content,
        callDurationSeconds: c.call_duration_seconds,
        callNotes: c.call_notes,
        agentId: c.agent_id,
        agentName: c.agent_name,
        timestamp: c.timestamp,
        read: c.read
      }));

      setCommunications(mappedComms);
    } catch (error) {
      console.error('Error fetching communications:', error);
    }
  }, []);

  const addCommunication = async (comm: Partial<CRMCommunication>): Promise<{ success: boolean; message: string; id?: string }> => {
    if (!comm.clientId) {
      addNotification('error', 'Client ID required for communication');
      return { success: false, message: 'Client ID required' };
    }

    try {
      const response = await fetch(`${API_BASE_URL}/communications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: comm.clientId,
          channel: comm.channel,
          direction: comm.direction || 'outbound',
          subject: comm.subject,
          content: comm.content,
          call_duration_seconds: comm.callDurationSeconds,
          call_notes: comm.callNotes,
          agent_id: currentUser?.id || 'system',
          agent_name: currentUser?.fullName || 'System'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add communication');
      }

      const data = await response.json();

      const newComm: CRMCommunication = {
        id: data.id.toString(),
        clientId: data.client_id.toString(),
        channel: data.channel,
        direction: data.direction,
        subject: data.subject,
        content: data.content,
        callDurationSeconds: data.call_duration_seconds,
        callNotes: data.call_notes,
        agentId: data.agent_id,
        agentName: data.agent_name,
        timestamp: data.timestamp,
        read: data.read
      };

      setCommunications(prev => [newComm, ...prev]);
      addNotification('success', `${comm.channel?.toUpperCase()} logged successfully`);
      return { success: true, message: 'Communication logged', id: newComm.id };
    } catch (e: any) {
      addNotification('error', e.message);
      return { success: false, message: e.message };
    }
  };

  // --- Workflow Triggers ---
  const fetchWorkflows = useCallback(async (clientId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/clients/${clientId}/workflows`);
      if (!response.ok) throw new Error('Failed to fetch workflows');
      const data = await response.json();

      const mappedWorkflows: WorkflowTrigger[] = data.map((w: any) => ({
        id: w.id.toString(),
        clientId: w.client_id.toString(),
        workflowType: w.workflow_type,
        workflowName: w.workflow_name,
        triggeredBy: w.triggered_by,
        triggeredAt: w.triggered_at,
        status: w.status,
        currentStep: w.current_step,
        totalSteps: w.total_steps,
        nextActionAt: w.next_action_at,
        nextActionDescription: w.next_action_description,
        completedAt: w.completed_at,
        cancelledAt: w.cancelled_at,
        cancelledBy: w.cancelled_by
      }));

      setWorkflowTriggers(mappedWorkflows);
    } catch (error) {
      console.error('Error fetching workflows:', error);
    }
  }, []);

  const triggerWorkflow = async (clientId: string, workflowType: string): Promise<{ success: boolean; message: string; id?: string }> => {
    // Find workflow config from constants
    const workflowConfig = WORKFLOW_TYPES.find(w => w.id === workflowType);
    if (!workflowConfig) {
      addNotification('error', 'Invalid workflow type');
      return { success: false, message: 'Invalid workflow type' };
    }

    try {
      const response = await fetch(`${API_BASE_URL}/workflows/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          workflow_type: workflowType,
          workflow_name: workflowConfig.name,
          triggered_by: currentUser?.id || 'system',
          total_steps: workflowConfig.totalSteps || 4,
          next_action_description: `Step 1: ${workflowConfig.sequence.split(' → ')[0]}`
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to trigger workflow');
      }

      const data = await response.json();

      const newWorkflow: WorkflowTrigger = {
        id: data.id.toString(),
        clientId: data.client_id.toString(),
        workflowType: data.workflow_type,
        workflowName: data.workflow_name,
        triggeredBy: data.triggered_by,
        triggeredAt: data.triggered_at,
        status: data.status,
        currentStep: data.current_step,
        totalSteps: data.total_steps,
        nextActionAt: data.next_action_at,
        nextActionDescription: data.next_action_description
      };

      setWorkflowTriggers(prev => [newWorkflow, ...prev]);
      addNotification('success', `${workflowConfig.name} workflow triggered`);
      return { success: true, message: 'Workflow triggered', id: newWorkflow.id };
    } catch (e: any) {
      addNotification('error', e.message);
      return { success: false, message: e.message };
    }
  };

  const cancelWorkflow = async (triggerId: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/workflows/${triggerId}/cancel`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cancelled_by: currentUser?.id || 'system'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to cancel workflow');
      }

      setWorkflowTriggers(prev => prev.map(w =>
        w.id === triggerId
          ? { ...w, status: 'cancelled' as const, cancelledAt: new Date().toISOString(), cancelledBy: currentUser?.id }
          : w
      ));

      addNotification('success', 'Workflow cancelled');
      return { success: true, message: 'Workflow cancelled' };
    } catch (e: any) {
      addNotification('error', e.message);
      return { success: false, message: e.message };
    }
  };

  // --- CRM Notes (Enhanced) ---
  const fetchNotes = useCallback(async (clientId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/clients/${clientId}/notes`);
      if (!response.ok) throw new Error('Failed to fetch notes');
      const data = await response.json();

      const mappedNotes: CRMNote[] = data.map((n: any) => ({
        id: n.id.toString(),
        clientId: n.client_id.toString(),
        content: n.content,
        pinned: n.pinned,
        createdBy: n.created_by,
        createdByName: n.created_by_name,
        createdAt: n.created_at,
        updatedBy: n.updated_by,
        updatedAt: n.updated_at
      }));

      setCrmNotes(mappedNotes);
    } catch (error) {
      console.error('Error fetching notes:', error);
    }
  }, []);

  const addCRMNote = async (clientId: string, content: string, pinned: boolean = false): Promise<{ success: boolean; message: string; id?: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/clients/${clientId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          pinned,
          created_by: currentUser?.id || 'system',
          created_by_name: currentUser?.fullName || 'System'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add note');
      }

      const data = await response.json();

      const newNote: CRMNote = {
        id: data.id.toString(),
        clientId: data.client_id.toString(),
        content: data.content,
        pinned: data.pinned,
        createdBy: data.created_by,
        createdByName: data.created_by_name,
        createdAt: data.created_at
      };

      setCrmNotes(prev => [newNote, ...prev]);
      addNotification('success', 'Note added successfully');
      return { success: true, message: 'Note added', id: newNote.id };
    } catch (e: any) {
      addNotification('error', e.message);
      return { success: false, message: e.message };
    }
  };

  const updateCRMNote = async (noteId: string, content: string, pinned?: boolean): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/notes/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          pinned,
          updated_by: currentUser?.id || 'system'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update note');
      }

      const data = await response.json();

      setCrmNotes(prev => prev.map(n =>
        n.id === noteId
          ? { ...n, content: data.content, pinned: data.pinned, updatedBy: data.updated_by, updatedAt: data.updated_at }
          : n
      ));

      addNotification('success', 'Note updated successfully');
      return { success: true, message: 'Note updated' };
    } catch (e: any) {
      addNotification('error', e.message);
      return { success: false, message: e.message };
    }
  };

  const deleteCRMNote = async (noteId: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/notes/${noteId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete note');
      }

      setCrmNotes(prev => prev.filter(n => n.id !== noteId));
      addNotification('success', 'Note deleted successfully');
      return { success: true, message: 'Note deleted' };
    } catch (e: any) {
      addNotification('error', e.message);
      return { success: false, message: e.message };
    }
  };

  // --- Action Timeline ---
  const fetchActionLogs = useCallback(async (clientId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/clients/${clientId}/actions`);
      if (!response.ok) throw new Error('Failed to fetch action logs');
      const data = await response.json();

      const mappedLogs: ActionLogEntry[] = data.map((a: any) => ({
        id: a.id.toString(),
        clientId: a.client_id?.toString(),
        claimId: a.claim_id?.toString(),
        actorType: a.actor_type,
        actorId: a.actor_id,
        actorName: a.actor_name,
        actionType: a.action_type,
        actionCategory: a.action_category,
        description: a.description,
        metadata: a.metadata,
        timestamp: a.timestamp,
        ipAddress: a.ip_address,
        userAgent: a.user_agent
      }));

      setActionLogs(mappedLogs);
    } catch (error) {
      console.error('Error fetching action logs:', error);
    }
  }, []);

  // --- Extended Contact Fields ---
  const updateContactExtended = async (contactId: string, data: {
    bankDetails?: BankDetails;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      state_county?: string;
      postalCode?: string;
    };
    previousAddress?: {
      line1?: string;
      line2?: string;
      city?: string;
      county?: string;
      postalCode?: string;
    };
    previousAddresses?: Array<{
      id: string;
      line1: string;
      line2?: string;
      city: string;
      county?: string;
      postalCode: string;
    }>;
    clientId?: string;
  }): Promise<{ success: boolean; message: string }> => {
    try {
      const requestBody: Record<string, any> = {};

      if (data.bankDetails) {
        requestBody.bank_name = data.bankDetails.bankName;
        requestBody.account_name = data.bankDetails.accountName;
        requestBody.sort_code = data.bankDetails.sortCode;
        requestBody.bank_account_number = data.bankDetails.accountNumber;
      }

      if (data.address) {
        requestBody.address_line_1 = data.address.line1;
        requestBody.address_line_2 = data.address.line2;
        requestBody.city = data.address.city;
        requestBody.state_county = data.address.state_county;
        requestBody.postal_code = data.address.postalCode;
      }

      if (data.previousAddress) {
        requestBody.previous_address_line_1 = data.previousAddress.line1;
        requestBody.previous_address_line_2 = data.previousAddress.line2;
        requestBody.previous_city = data.previousAddress.city;
        requestBody.previous_county = data.previousAddress.county;
        requestBody.previous_postal_code = data.previousAddress.postalCode;
      }

      if (data.previousAddresses) {
        requestBody.previous_addresses = JSON.stringify(data.previousAddresses);
      }

      if (data.clientId) {
        requestBody.client_id = data.clientId;
      }

      const response = await fetch(`${API_BASE_URL}/contacts/${contactId}/extended`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update contact');
      }

      // Update local state
      setContacts(prev => prev.map(c => {
        if (c.id === contactId) {
          return {
            ...c,
            bankDetails: data.bankDetails || c.bankDetails,
            address: data.address ? {
              line1: data.address.line1 || '',
              line2: data.address.line2,
              city: data.address.city || '',
              state_county: data.address.state_county || '',
              postalCode: data.address.postalCode || ''
            } : c.address,
            previousAddressObj: data.previousAddress ? {
              line1: data.previousAddress.line1 || '',
              line2: data.previousAddress.line2,
              city: data.previousAddress.city || '',
              state_county: data.previousAddress.county || '',
              postalCode: data.previousAddress.postalCode || ''
            } : c.previousAddressObj,
            previousAddresses: data.previousAddresses || c.previousAddresses,
            clientId: data.clientId || c.clientId
          };
        }
        return c;
      }));

      addNotification('success', 'Contact details updated successfully');
      return { success: true, message: 'Contact updated' };
    } catch (e: any) {
      addNotification('error', e.message);
      return { success: false, message: e.message };
    }
  };

  // --- Extended Claim Fields ---
  const updateClaimExtended = async (claimId: string, data: Record<string, any>): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/cases/${claimId}/extended`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update claim');
      }

      addNotification('success', 'Claim details updated successfully');
      return { success: true, message: 'Claim updated' };
    } catch (e: any) {
      addNotification('error', e.message);
      return { success: false, message: e.message };
    }
  };

  const fetchFullClaim = async (claimId: string): Promise<any> => {
    try {
      const response = await fetch(`${API_BASE_URL}/cases/${claimId}/full`);
      if (!response.ok) throw new Error('Failed to fetch claim');
      return await response.json();
    } catch (error) {
      console.error('Error fetching full claim:', error);
      return null;
    }
  };

  return (
    <CRMContext.Provider value={{
      currentUser, users, login, logout,
      initiateRegistration, verifyRegistration, updateUserRole, updateUserStatus,
      requestPasswordReset, resetPassword,
      contacts, documents, templates, forms, claims, appointments, activityLogs,
      notifications, addNotification, removeNotification,
      activeContext, setActiveContext,
      currentView, setCurrentView,
      updateContactStatus, updateContact, addContact, deleteContacts, getContactDetails, getPipelineStats,
      addClaim, updateClaim, updateClaimStatus, bulkUpdateClaims,
      addAppointment, updateAppointment, deleteAppointment, addDocument, updateDocument,
      addTemplate, updateTemplate,
      addForm, updateForm, deleteForm,
      addNote, theme, toggleTheme,
      // CRM Specification Methods (Phase 3)
      communications, fetchCommunications, addCommunication,
      workflowTriggers, fetchWorkflows, triggerWorkflow, cancelWorkflow,
      crmNotes, fetchNotes, addCRMNote, updateCRMNote, deleteCRMNote,
      actionLogs, fetchActionLogs,
      updateContactExtended, updateClaimExtended, fetchFullClaim
    }}>
      {children}
    </CRMContext.Provider>
  );
};

export const useCRM = () => {
  const context = useContext(CRMContext);
  if (context === undefined) {
    throw new Error('useCRM must be used within a CRMProvider');
  }
  return context;
};
