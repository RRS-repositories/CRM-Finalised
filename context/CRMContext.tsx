
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Contact, ClaimStatus, Document, Template, Form, User, Role, Claim, ActivityLog, Notification, ViewState } from '../types';
import { MOCK_CONTACTS, MOCK_DOCUMENTS, MOCK_TEMPLATES, MOCK_FORMS } from '../constants';
import { emailService } from '../services/emailService';

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
  updateContact: (contact: Contact) => { success: boolean; message: string };
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

  // Notes
  addNote: (contactId: string, content: string) => void;

  // Theme
  theme: Theme;
  toggleTheme: () => void;

  // View Navigation
  currentView: ViewState;
  setCurrentView: (view: ViewState) => void;
}

const CRMContext = createContext<CRMContextType | undefined>(undefined);
const API_BASE_URL = 'http://localhost:5000/api';

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

  const updateContact = (contact: Contact) => {
    let found = false;
    const updated = contacts.map(c => {
      if (c.id === contact.id) {
        found = true;
        logActivity(c.id, 'Details Updated', 'Contact personal details were updated', 'note');
        return contact;
      }
      return c;
    });

    if (!found) {
      addNotification('error', 'Contact not found');
      return { success: false, message: `Contact not found: ${contact.id}` };
    }
    setContacts(updated);
    addNotification('success', 'Contact details updated successfully');
    return { success: true, message: `Updated contact ${contact.fullName}` };
  };

  const addContact = async (contactData: Partial<Contact>) => {
    try {
      const response = await fetch(`${API_BASE_URL}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: contactData.firstName,
          last_name: contactData.lastName,
          email: contactData.email,
          phone: contactData.phone,
          dob: contactData.dateOfBirth,
          address_line_1: contactData.address?.line1,
          address_line_2: contactData.address?.line2,
          city: contactData.address?.city,
          state_county: contactData.address?.state_county,
          postal_code: contactData.address?.postalCode
        })
      });
      const c = await response.json();

      const newContact: Contact = {
        id: c.id.toString(),
        fullName: c.full_name,
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
      addNotification('error', 'Failed to create contact');
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

  // --- Note Logic ---
  const addNote = (contactId: string, content: string) => {
    logActivity(contactId, 'Note Added', content, 'note');
    addNotification('success', 'Note added successfully');
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
      addAppointment, addDocument, updateDocument,
      addTemplate, updateTemplate,
      addForm, updateForm, deleteForm,
      addNote, theme, toggleTheme
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
