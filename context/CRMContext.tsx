
import React, { createContext, useContext, useState, useRef, ReactNode, useEffect, useCallback, useMemo } from 'react';
import { Contact, ClaimStatus, Document, DocumentStatus, Template, Form, User, Role, Claim, ActivityLog, Notification, ViewState, CRMCommunication, WorkflowTrigger, CRMNote, ActionLogEntry, BankDetails, PreviousAddressEntry, Task, TaskReminder, PersistentNotification, TimelineItem, SupportTicket } from '../types';
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
  deleteUser: (userId: string) => Promise<void>;

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
  errorToasts: PersistentNotification[];
  removeErrorToast: (id: string) => void;

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
  addClaim: (claim: Partial<Claim>) => Promise<{ success: boolean; message: string; id?: string; category3?: boolean; lender?: string }>;
  updateClaim: (claim: Claim) => { success: boolean; message: string };
  deleteClaim: (claimId: string) => Promise<{ success: boolean; message: string }>;
  updateClaimStatus: (claimId: string, newStatus: string) => Promise<{ success: boolean; message: string }>;
  bulkUpdateClaimStatusByIds: (claimIds: string[], newStatus: string) => Promise<{ success: boolean; count: number; message: string }>;
  bulkUpdateClaims: (criteria: { lender?: string; status?: string; minDaysInStage?: number }, newStatus: string) => { success: boolean; count: number; message: string };

  // Calendar
  addAppointment: (appt: Partial<Appointment>) => { success: boolean; message: string; id: string };
  updateAppointment: (appt: Appointment) => { success: boolean; message: string };
  deleteAppointment: (id: string) => { success: boolean; message: string };

  // Document Methods
  addDocument: (doc: Partial<Document>, file?: File) => Promise<{ success: boolean; message: string; id?: string }>;
  updateDocument: (doc: Document) => { success: boolean; message: string };
  updateDocumentStatus: (docId: string, status: DocumentStatus) => Promise<void>;
  sendDocument: (docId: string) => Promise<{ trackingUrl?: string; declineUrl?: string } | null>;
  fetchDocumentTimeline: (docId: string) => Promise<any[]>;

  // Template Methods
  addTemplate: (tpl: Partial<Template>) => Promise<{ success: boolean; message: string; id?: string }>;
  updateTemplate: (tpl: Template) => Promise<{ success: boolean; message: string }>;
  deleteTemplate: (id: string) => Promise<{ success: boolean; message: string }>;

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
  notesLoading: boolean;
  fetchNotes: (clientId: string) => Promise<void>;
  addCRMNote: (clientId: string, content: string, pinned?: boolean) => Promise<{ success: boolean; message: string; id?: string }>;
  updateCRMNote: (noteId: string, content: string, pinned?: boolean) => Promise<{ success: boolean; message: string }>;
  deleteCRMNote: (noteId: string) => Promise<{ success: boolean; message: string }>;

  // Action Timeline
  actionLogs: ActionLogEntry[];
  fetchActionLogs: (clientId: string) => Promise<void>;
  fetchAllActionLogs: () => Promise<void>;

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
    documentChecklist?: {
      identification?: boolean;
      extraLender?: boolean;
      questionnaire?: boolean;
      poa?: boolean;
    };
    checklistChange?: {
      field: string;
      value: boolean;
    };
    extraLenders?: string;
  }) => Promise<{ success: boolean; message: string }>;

  // Extended Claim Fields
  updateClaimExtended: (claimId: string, data: Record<string, any>) => Promise<{ success: boolean; message: string }>;
  fetchFullClaim: (claimId: string) => Promise<any>;

  // Data Refresh
  refreshAllData: () => Promise<void>;

  // Theme
  theme: Theme;
  toggleTheme: () => void;

  // View Navigation
  currentView: ViewState;
  setCurrentView: (view: ViewState) => void;

  // Contact Navigation (for navigating from Pipeline to Contacts)
  pendingContactNavigation: { contactId: string; tab: string; claimId?: string } | null;
  navigateToContact: (contactId: string, tab?: string, claimId?: string) => void;
  clearContactNavigation: () => void;

  // ============================================
  // TASKS & CALENDAR SYSTEM
  // ============================================
  tasks: Task[];
  fetchTasks: (filters?: { startDate?: string; endDate?: string; status?: string; assignedTo?: string }) => Promise<void>;
  addTask: (task: Partial<Task>) => Promise<{ success: boolean; message: string; id?: string }>;
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<{ success: boolean; message: string }>;
  deleteTask: (taskId: string) => Promise<{ success: boolean; message: string }>;
  completeTask: (taskId: string) => Promise<{ success: boolean; message: string }>;
  rescheduleTask: (taskId: string, newDate: string, newStartTime?: string) => Promise<{ success: boolean; message: string; newTaskId?: string }>;

  // Persistent Notifications
  persistentNotifications: PersistentNotification[];
  unreadNotificationCount: number;
  fetchPersistentNotifications: () => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;

  // Combined Timeline
  fetchCombinedTimeline: (contactId: string) => Promise<TimelineItem[]>;

  // Lazy-load cases for a specific contact
  fetchCasesForContact: (contactId: string) => Promise<void>;

  // Fetch all claims (for Pipeline view)
  fetchAllClaims: () => Promise<void>;

  // Support Tickets
  tickets: SupportTicket[];
  fetchTickets: () => Promise<void>;
  createTicket: (title: string, description: string, screenshot?: File) => Promise<{ success: boolean; message: string }>;
  resolveTicket: (ticketId: string) => Promise<{ success: boolean; message: string }>;

  // Loading state for initial data fetch
  isLoading: boolean;

  // Pagination for contacts
  contactsPagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
    isLoadingMore: boolean;
  };
  loadMoreContacts: (search?: string) => Promise<void>;
  fetchContactsPage: (page: number, limit: number, filters?: {
    firstName?: string;
    lastName?: string;
    fullName?: string;
    email?: string;
    phone?: string;
    postcode?: string;
    clientId?: string;
  }) => Promise<void>;
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

// Helper to get initial ViewState from URL
const getInitialViewState = (): ViewState => {
  const pathname = window.location.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const routeMap: Record<string, ViewState> = {
    '/': ViewState.DASHBOARD,
    '/dashboard': ViewState.DASHBOARD,
    '/contacts': ViewState.CONTACTS,
    '/cases': ViewState.PIPELINE,
    '/calendar': ViewState.CALENDAR,
    '/conversations': ViewState.CONVERSATIONS_ALL,
    '/conversations/facebook': ViewState.CONVERSATIONS_FACEBOOK,
    '/conversations/whatsapp': ViewState.CONVERSATIONS_WHATSAPP,
    '/conversations/sms': ViewState.CONVERSATIONS_SMS,
    '/conversations/email': ViewState.CONVERSATIONS_EMAIL,
    '/marketing': ViewState.MARKETING,
    '/documents': ViewState.DOCUMENTS,
    '/forms': ViewState.FORMS,
    '/automation': ViewState.WORKFLOW,
    '/settings': ViewState.SETTINGS,
    '/management': ViewState.MANAGEMENT,
    '/accounts': ViewState.LENDERS,
  };
  return routeMap[pathname] || ViewState.DASHBOARD;
};

export const CRMProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);

  // Theme & View State
  const [theme, setTheme] = useState<Theme>('light');
  const [currentView, setCurrentView] = useState<ViewState>(getInitialViewState());

  // Contact Navigation (for navigating from Pipeline to Contacts with specific tab and claim
  const [pendingContactNavigation, setPendingContactNavigation] = useState<{ contactId: string; tab: string; claimId?: string } | null>(null);

  const navigateToContact = useCallback((contactId: string, tab: string = 'claims', claimId?: string) => {
    setPendingContactNavigation({ contactId, tab, claimId });
    setCurrentView(ViewState.CONTACTS);
  }, []);

  const clearContactNavigation = useCallback(() => {
    setPendingContactNavigation(null);
  }, []);

  // Temporary storage for users who haven't verified email yet (initialized from localStorage)
  const [pendingRegistrations, setPendingRegistrations] = useState<Record<string, PendingRegistration>>(() => {
    try {
      const stored = localStorage.getItem('pendingRegistrations');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

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
  const [notesLoading, setNotesLoading] = useState(false);
  const [actionLogs, setActionLogs] = useState<ActionLogEntry[]>([]);

  // Tasks & Persistent Notifications State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [persistentNotifications, setPersistentNotifications] = useState<PersistentNotification[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [errorToasts, setErrorToasts] = useState<PersistentNotification[]>([]);
  const seenNotificationIds = useRef<Set<string>>(new Set());
  const isFirstNotificationFetch = useRef(true);

  // Support Tickets State
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  // Loading State for initial data fetch
  const [isLoading, setIsLoading] = useState(true);

  // Pagination State for contacts
  const [contactsPagination, setContactsPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
    hasMore: false,
    isLoadingMore: false
  });

  // Auth Persistence Initialization with session verification
  useEffect(() => {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        setCurrentUser(user);

        // Verify session is still valid (user exists and is approved)
        fetch(`${API_BASE_URL}/auth/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, email: user.email })
        })
          .then(res => res.json())
          .then(data => {
            if (!data.valid) {
              console.warn('Session invalid:', data.reason);
              localStorage.removeItem('currentUser');
              localStorage.removeItem('mattermostToken');
              setCurrentUser(null);
            }
          })
          .catch(err => console.error('Session verification error:', err));
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

  // --- Error Toast Notifications (from worker errors) ---
  const playNotificationSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch (e) { /* Ignore audio errors */ }
  }, []);

  const addErrorToast = useCallback((notification: PersistentNotification) => {
    setErrorToasts(prev => [...prev, { ...notification, isExiting: false }]);
    playNotificationSound();

    // Auto-dismiss after 10 seconds
    setTimeout(() => {
      removeErrorToast(notification.id);
    }, 10000);
  }, [playNotificationSound]);

  const removeErrorToast = useCallback((id: string) => {
    setErrorToasts(prev => prev.map(n => n.id === id ? { ...n, isExiting: true } : n));
    setTimeout(() => {
      setErrorToasts(prev => prev.filter(n => n.id !== id));
    }, 500);
  }, []);

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
        createdAt: c.created_at,
        address: {
          line1: c.address_line_1,
          line2: c.address_line_2,
          city: c.city,
          state_county: c.state_county,
          postalCode: c.postal_code
        },
        // Use JSONB column if available (saved from CRM), otherwise fall back to separate table
        previousAddresses: (() => {
          // Parse previous_addresses - handle both array and string cases
          let prevAddrs = c.previous_addresses;
          if (typeof prevAddrs === 'string') {
            try { prevAddrs = JSON.parse(prevAddrs); } catch { prevAddrs = null; }
          }
          if (prevAddrs && Array.isArray(prevAddrs) && prevAddrs.length > 0) {
            return prevAddrs.map((pa: any, idx: number) => ({
              id: pa.id || `prev_addr_${idx}`,
              line1: pa.line1 || pa.address_line_1 || '',
              line2: pa.line2 || pa.address_line_2 || '',
              city: pa.city || '',
              county: pa.county || pa.state_county || '',
              postalCode: pa.postalCode || pa.postal_code || ''
            }));
          }
          // Fall back to separate table
          if (c.previous_addresses_list) {
            return c.previous_addresses_list.map((pa: any) => ({
              id: pa.id.toString(),
              line1: pa.address_line_1,
              line2: pa.address_line_2,
              city: pa.city,
              county: pa.county,
              postalCode: pa.postal_code
            }));
          }
          return [];
        })(),
        // Document checklist flags
        documentChecklist: c.document_checklist ? (
          typeof c.document_checklist === 'string'
            ? JSON.parse(c.document_checklist)
            : c.document_checklist
        ) : { identification: false, extraLender: false, questionnaire: false, poa: false },
        // Bank details mapping
        bankDetails: {
          bankName: c.bank_name || '',
          accountName: c.account_name || '',
          sortCode: c.sort_code || '',
          accountNumber: c.bank_account_number || ''
        }
      }));
      setContacts(mappedContacts);

      // Cases are now lazy-loaded when a contact is opened (see fetchCasesForContact)
    } catch (error) {
      console.error('Error fetching data:', error);
      addNotification('error', 'Failed to load data from server. Ensure backend is running.');
    }
  };

  // Load more contacts (for pagination/infinite scroll)
  const loadMoreContacts = async (search?: string) => {
    if (contactsPagination.isLoadingMore || !contactsPagination.hasMore) return;

    setContactsPagination(prev => ({ ...prev, isLoadingMore: true }));

    try {
      const nextPage = contactsPagination.page + 1;
      const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
      const response = await fetch(`${API_BASE_URL}/contacts/paginated?page=${nextPage}&limit=${contactsPagination.limit}${searchParam}`);

      if (!response.ok) throw new Error('Failed to fetch more contacts');
      const data = await response.json();

      if (data.contacts && Array.isArray(data.contacts)) {
        const mappedContacts: Contact[] = data.contacts.map((c: any) => ({
          id: c.id.toString(),
          firstName: c.first_name,
          lastName: c.last_name,
          fullName: c.full_name,
          email: c.email,
          phone: c.phone,
          status: ClaimStatus.NEW_LEAD,
          lastActivity: 'Active',
          source: c.source,
          dateOfBirth: c.date_of_birth,
          createdAt: c.created_at,
          address: {
            line1: c.address_line_1,
            line2: c.address_line_2,
            city: c.city,
            state_county: c.state_county,
            postalCode: c.postal_code
          },
          previousAddresses: (() => {
            let prevAddrs = c.previous_addresses;
            if (typeof prevAddrs === 'string') {
              try { prevAddrs = JSON.parse(prevAddrs); } catch { prevAddrs = null; }
            }
            if (prevAddrs && Array.isArray(prevAddrs) && prevAddrs.length > 0) {
              return prevAddrs.map((pa: any, idx: number) => ({
                id: pa.id || `prev_addr_${idx}`,
                line1: pa.line1 || pa.address_line_1 || '',
                line2: pa.line2 || pa.address_line_2 || '',
                city: pa.city || '',
                county: pa.county || pa.state_county || '',
                postalCode: pa.postalCode || pa.postal_code || ''
              }));
            }
            if (c.previous_addresses_list) {
              return c.previous_addresses_list.map((pa: any) => ({
                id: pa.id.toString(),
                line1: pa.address_line_1,
                line2: pa.address_line_2,
                city: pa.city,
                county: pa.county,
                postalCode: pa.postal_code
              }));
            }
            return [];
          })(),
          documentChecklist: c.document_checklist ? (
            typeof c.document_checklist === 'string'
              ? JSON.parse(c.document_checklist)
              : c.document_checklist
          ) : { identification: false, extraLender: false, questionnaire: false, poa: false },
          bankDetails: {
            bankName: c.bank_name || '',
            accountName: c.account_name || '',
            sortCode: c.sort_code || '',
            accountNumber: c.bank_account_number || ''
          },
          extraLenders: c.extra_lenders,
          hadCCJ: c.had_ccj || false,
          victimOfScam: c.victim_of_scam || false,
          problematicGambling: c.problematic_gambling || false,
          bettingCompanies: c.betting_companies || '',
          questionnaireData: c.questionnaire_data || undefined,
          questionnaireSubmitted: c.questionnaire_submitted || false,
          signatureQuestionnaireUrl: c.signature_questionnaire_url || '',
        }));

        // Append to existing contacts
        setContacts(prev => [...prev, ...mappedContacts]);

        // Update pagination state
        if (data.pagination) {
          setContactsPagination({
            page: data.pagination.page,
            limit: data.pagination.limit,
            total: data.pagination.total,
            totalPages: data.pagination.totalPages,
            hasMore: data.pagination.hasMore,
            isLoadingMore: false
          });
        }
      }
    } catch (error) {
      console.error('Error loading more contacts:', error);
      setContactsPagination(prev => ({ ...prev, isLoadingMore: false }));
    }
  };

  // Server-side paginated fetch (replaces contacts in state)
  const fetchContactsPage = async (page: number, limit: number, filters?: {
    fullName?: string;
    email?: string;
    phone?: string;
    postcode?: string;
    clientId?: string;
  }) => {
    setContactsPagination(prev => ({ ...prev, isLoadingMore: true }));
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (filters?.fullName) params.set('fullName', filters.fullName);
      if (filters?.email) params.set('email', filters.email);
      if (filters?.phone) params.set('phone', filters.phone);
      if (filters?.postcode) params.set('postcode', filters.postcode);
      if (filters?.clientId) params.set('clientId', filters.clientId);

      const response = await fetch(`${API_BASE_URL}/contacts/paginated?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch contacts page');
      const data = await response.json();

      if (data.contacts && Array.isArray(data.contacts)) {
        const mappedContacts: Contact[] = data.contacts.map((c: any) => ({
          id: c.id.toString(),
          firstName: c.first_name,
          lastName: c.last_name,
          fullName: c.full_name,
          email: c.email,
          phone: c.phone,
          status: ClaimStatus.NEW_LEAD,
          lastActivity: 'Active',
          source: c.source,
          dateOfBirth: c.dob,
          createdAt: c.created_at,
          address: {
            line1: c.address_line_1,
            line2: c.address_line_2,
            city: c.city,
            state_county: c.state_county,
            postalCode: c.postal_code
          },
          previousAddresses: (() => {
            let prevAddrs = c.previous_addresses;
            if (typeof prevAddrs === 'string') {
              try { prevAddrs = JSON.parse(prevAddrs); } catch { prevAddrs = null; }
            }
            if (prevAddrs && Array.isArray(prevAddrs) && prevAddrs.length > 0) {
              return prevAddrs.map((pa: any, idx: number) => ({
                id: pa.id || `prev_addr_${idx}`,
                line1: pa.line1 || pa.address_line_1 || '',
                line2: pa.line2 || pa.address_line_2 || '',
                city: pa.city || '',
                county: pa.county || pa.state_county || '',
                postalCode: pa.postalCode || pa.postal_code || ''
              }));
            }
            if (c.previous_addresses_list) {
              return c.previous_addresses_list.map((pa: any) => ({
                id: pa.id.toString(),
                line1: pa.address_line_1,
                line2: pa.address_line_2,
                city: pa.city,
                county: pa.county,
                postalCode: pa.postal_code
              }));
            }
            return [];
          })(),
          documentChecklist: c.document_checklist ? (
            typeof c.document_checklist === 'string'
              ? JSON.parse(c.document_checklist)
              : c.document_checklist
          ) : { identification: false, extraLender: false, questionnaire: false, poa: false },
          bankDetails: {
            bankName: c.bank_name || '',
            accountName: c.account_name || '',
            sortCode: c.sort_code || '',
            accountNumber: c.bank_account_number || ''
          },
          extraLenders: c.extra_lenders,
          hadCCJ: c.had_ccj || false,
          victimOfScam: c.victim_of_scam || false,
          problematicGambling: c.problematic_gambling || false,
          bettingCompanies: c.betting_companies || '',
          questionnaireData: c.questionnaire_data || undefined,
          questionnaireSubmitted: c.questionnaire_submitted || false,
          signatureQuestionnaireUrl: c.signature_questionnaire_url || '',
          clientId: c.client_id
        }));

        setContacts(mappedContacts);

        if (data.pagination) {
          setContactsPagination({
            page: data.pagination.page,
            limit: data.pagination.limit,
            total: data.pagination.total,
            totalPages: data.pagination.totalPages,
            hasMore: data.pagination.hasMore,
            isLoadingMore: false
          });
        }
      }
    } catch (error) {
      console.error('Error fetching contacts page:', error);
      setContactsPagination(prev => ({ ...prev, isLoadingMore: false }));
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
        dateModified: d.created_at?.split('T')[0],
        documentStatus: (d.document_status as DocumentStatus) || 'Draft',
        trackingToken: d.tracking_token || null,
        sentAt: d.sent_at || null,
      }));

      setDocuments(mappedDocs);
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  // Lazy-load cases for a specific contact (called when contact detail is opened)
  const fetchCasesForContact = async (contactId: string) => {
    try {
      const caseRes = await fetch(`${API_BASE_URL}/contacts/${contactId}/cases`);
      if (!caseRes.ok) return;
      const caseData = await caseRes.json();
      const newCases = caseData.map((cs: any) => ({
        id: cs.id.toString(),
        contactId: cs.contact_id.toString(),
        lender: cs.lender,
        status: cs.status as ClaimStatus,
        claimValue: Number(cs.claim_value),
        productType: cs.product_type,
        accountNumber: cs.account_number,
        startDate: cs.start_date ? new Date(cs.start_date).toLocaleDateString('en-GB') : '',
        createdAt: cs.created_at,
        daysInStage: 0
      }));
      // Merge with existing claims, replacing any existing claims for this contact
      setClaims(prev => {
        const otherClaims = prev.filter(c => c.contactId !== contactId);
        return [...otherClaims, ...newCases];
      });
    } catch (e) {
      console.error(`Error fetching cases for contact ${contactId}:`, e);
    }
  };

  // Fetch all claims at once (for Pipeline view)
  // === PERFORMANCE: Track last fetch time to avoid re-fetching on every mount ===
  const claimsFetchedAtRef = React.useRef<number>(0);

  const fetchAllClaims = useCallback(async () => {
    // Skip re-fetch if data was fetched less than 30 seconds ago
    const now = Date.now();
    if (now - claimsFetchedAtRef.current < 30000 && claims.length > 0) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/cases`);
      if (!response.ok) return;
      const data = await response.json();
      const allClaims = data.map((cs: any) => ({
        id: cs.id.toString(),
        contactId: cs.contact_id.toString(),
        lender: cs.lender,
        status: cs.status as ClaimStatus,
        claimValue: Number(cs.claim_value),
        productType: cs.product_type,
        accountNumber: cs.account_number,
        startDate: cs.start_date ? new Date(cs.start_date).toLocaleDateString('en-GB') : '',
        createdAt: cs.created_at,
        daysInStage: 0,
        contactName: cs.contact_full_name || [cs.contact_first_name, cs.contact_last_name].filter(Boolean).join(' ') || '',
      }));
      setClaims(allClaims);
      claimsFetchedAtRef.current = now;
    } catch (e) {
      console.error('Error fetching all claims:', e);
    }
  }, [claims.length]);

  // Fetch templates from backend
  const fetchTemplates = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/templates`);
      if (response.ok) {
        const data = await response.json();
        // Server returns { success: true, templates: [...] }
        const list = data.templates || data;
        if (Array.isArray(list) && list.length > 0) {
          setTemplates(list);
        } else {
          // No saved templates yet - use mock templates as defaults
          setTemplates(MOCK_TEMPLATES);
        }
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
      setTemplates(MOCK_TEMPLATES);
    }
  };

  // Refresh all data from the server - call this after any mutation
  const refreshAllData = useCallback(async () => {
    console.log('[CRMContext] Refreshing all data...');
    await Promise.all([
      fetchContacts(),
      fetchDocuments(),
      (async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/actions/all`);
          if (response.ok) {
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
          }
        } catch (error) {
          console.error('Error fetching action logs:', error);
        }
      })()
    ]);
    console.log('[CRMContext] Data refresh complete');
  }, []);

  // OPTIMIZED: Single API call to fetch all initial data in parallel
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      const startTime = performance.now();

      try {
        // Try optimized combined endpoint first
        const response = await fetch(`${API_BASE_URL}/init-data`);

        if (response.ok) {
          const data = await response.json();

          // Map contacts
          if (data.contacts && Array.isArray(data.contacts)) {
            const mappedContacts: Contact[] = data.contacts.map((c: any) => ({
              id: c.id.toString(),
              firstName: c.first_name,
              lastName: c.last_name,
              fullName: c.full_name,
              email: c.email,
              phone: c.phone,
              status: ClaimStatus.NEW_LEAD,
              lastActivity: 'Active',
              source: c.source,
              dateOfBirth: c.dob,
              createdAt: c.created_at,
              address: {
                line1: c.address_line_1,
                line2: c.address_line_2,
                city: c.city,
                state_county: c.state_county,
                postalCode: c.postal_code
              },
              previousAddresses: (() => {
                let prevAddrs = c.previous_addresses;
                if (typeof prevAddrs === 'string') {
                  try { prevAddrs = JSON.parse(prevAddrs); } catch { prevAddrs = null; }
                }
                if (prevAddrs && Array.isArray(prevAddrs) && prevAddrs.length > 0) {
                  return prevAddrs.map((pa: any, idx: number) => ({
                    id: pa.id || `prev_addr_${idx}`,
                    line1: pa.line1 || pa.address_line_1 || '',
                    line2: pa.line2 || pa.address_line_2 || '',
                    city: pa.city || '',
                    county: pa.county || pa.state_county || '',
                    postalCode: pa.postalCode || pa.postal_code || ''
                  }));
                }
                if (c.previous_addresses_list) {
                  return c.previous_addresses_list.map((pa: any) => ({
                    id: pa.id.toString(),
                    line1: pa.address_line_1,
                    line2: pa.address_line_2,
                    city: pa.city,
                    county: pa.county,
                    postalCode: pa.postal_code
                  }));
                }
                return [];
              })(),
              documentChecklist: c.document_checklist ? (
                typeof c.document_checklist === 'string'
                  ? JSON.parse(c.document_checklist)
                  : c.document_checklist
              ) : { identification: false, extraLender: false, questionnaire: false, poa: false },
              bankDetails: {
                bankName: c.bank_name || '',
                accountName: c.account_name || '',
                sortCode: c.sort_code || '',
                accountNumber: c.bank_account_number || ''
              },
              extraLenders: c.extra_lenders,
              hadCCJ: c.had_ccj || false,
              victimOfScam: c.victim_of_scam || false,
              problematicGambling: c.problematic_gambling || false,
              bettingCompanies: c.betting_companies || '',
              questionnaireData: c.questionnaire_data || undefined,
              questionnaireSubmitted: c.questionnaire_submitted || false,
              signatureQuestionnaireUrl: c.signature_questionnaire_url || '',
              clientId: c.client_id
            }));
            setContacts(mappedContacts);
          }

          // Map cases/claims
          if (data.cases && Array.isArray(data.cases)) {
            const allClaims = data.cases.map((cs: any) => ({
              id: cs.id.toString(),
              contactId: cs.contact_id.toString(),
              lender: cs.lender,
              status: cs.status as ClaimStatus,
              claimValue: Number(cs.claim_value),
              productType: cs.product_type,
              accountNumber: cs.account_number,
              startDate: cs.start_date ? new Date(cs.start_date).toLocaleDateString('en-GB') : '',
              createdAt: cs.created_at,
              daysInStage: 0
            }));
            setClaims(allClaims);
          }

          // Map action logs
          if (data.actionLogs && Array.isArray(data.actionLogs)) {
            const mappedLogs: ActionLogEntry[] = data.actionLogs.map((a: any) => ({
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
          }

          // Documents are now lazy-loaded per contact, so we skip loading all documents here
          // This significantly improves initial load time

          // Set pagination from server response
          if (data.contactsPagination) {
            setContactsPagination({
              page: data.contactsPagination.page,
              limit: data.contactsPagination.limit,
              total: data.contactsPagination.total,
              totalPages: data.contactsPagination.totalPages,
              hasMore: data.contactsPagination.hasMore,
              isLoadingMore: false
            });
          }

          const loadTime = performance.now() - startTime;
          console.log(`[CRMContext] Data loaded in ${loadTime.toFixed(0)}ms (optimized) - ${data.contacts?.length || 0} of ${data.contactsPagination?.total || '?'} contacts`);
        } else {
          // Fallback to individual fetches if combined endpoint fails
          console.log('[CRMContext] Combined endpoint failed, falling back to individual fetches');
          await Promise.all([
            fetchContacts(),
            fetchDocuments(),
            fetchAllClaims()
          ]);
        }
        // Fetch templates from backend (separate from init-data)
        await fetchTemplates();
      } catch (error) {
        console.error('Error during init:', error);
        // Fallback to individual fetches
        await Promise.all([
          fetchContacts(),
          fetchDocuments()
        ]);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  // Activity logs are fetched from the server (fetchAllActionLogs / fetchActionLogs)
  // No need to generate mock logs from contacts array

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

        // Store Mattermost token if available
        if (data.mattermostToken) {
          localStorage.setItem('mattermostToken', data.mattermostToken);
        }

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

    // Store in both state and localStorage (survives page refresh)
    setPendingRegistrations(prev => {
      const updated = { ...prev, [email]: pendingUser };
      localStorage.setItem('pendingRegistrations', JSON.stringify(updated));
      return updated;
    });

    // Send the email
    await emailService.sendVerificationEmail(email, code);
    addNotification('info', 'Verification code sent to email');

    return true;
  };

  const verifyRegistration = async (email: string, code: string): Promise<{ success: boolean; message: string }> => {
    // Check both state and localStorage
    let pending = pendingRegistrations[email];
    if (!pending) {
      // Try to load from localStorage
      const stored = localStorage.getItem('pendingRegistrations');
      if (stored) {
        const storedPending = JSON.parse(stored);
        pending = storedPending[email];
      }
    }
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
        // Clear pending from both state and localStorage
        const newPending = { ...pendingRegistrations };
        delete newPending[email];
        setPendingRegistrations(newPending);
        localStorage.setItem('pendingRegistrations', JSON.stringify(newPending));

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
    localStorage.removeItem('mattermostToken');
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

  const deleteUser = async (userId: string) => {
    const userToDelete = users.find(u => u.id === userId);
    if (userToDelete?.email === 'info@fastactionclaims.co.uk') return;

    try {
      const res = await fetch(`${API_BASE_URL}/users/${userId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setUsers(prev => prev.filter(u => u.id !== userId));
        addNotification('success', `User ${userToDelete?.fullName || ''} deleted successfully`);
      } else {
        addNotification('error', data.message || 'Failed to delete user');
      }
    } catch (err) {
      addNotification('error', 'Failed to delete user');
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

    const requestBody: Record<string, any> = {
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

    // Include previous addresses if provided (don't stringify - the body will be stringified as a whole)
    if (contactData.previousAddresses && contactData.previousAddresses.length > 0) {
      requestBody.previous_addresses = contactData.previousAddresses;
    }

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
        previousAddresses: contactData.previousAddresses,
        status: ClaimStatus.NEW_LEAD,
        lastActivity: 'Just now',
        source: c.source
      };

      setContacts(prev => [...prev, newContact]);
      logActivity(newContact.id, 'Contact Created', `Contact created via ${newContact.source}`, 'creation');
      addNotification('success', `Contact ${newContact.fullName} created successfully`);
      // Refresh all data to ensure UI is in sync
      await refreshAllData();
      return { success: true, message: `Created contact for ${newContact.fullName}`, id: newContact.id };
    } catch (e: any) {
      console.error('[CRMContext addContact] Error:', e);
      addNotification('error', `Failed to create contact: ${e.message}`);
      return { success: false, message: e.message };
    }
  };

  const deleteContacts = async (ids: string[]) => {
    try {
      // Delete each contact via API
      const deletePromises = ids.map(async (id) => {
        const response = await fetch(`${API_BASE_URL}/contacts/${id}`, {
          method: 'DELETE'
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to delete contact');
        }

        return response.json();
      });

      await Promise.all(deletePromises);

      // Update local state
      setContacts(prev => prev.filter(c => !ids.includes(c.id)));
      setClaims(prev => prev.filter(c => !ids.includes(c.contactId)));

      addNotification('success', `${ids.length} contact(s) deleted successfully`);
      // Refresh all data to ensure UI is in sync
      await refreshAllData();
      return { success: true, message: `Deleted ${ids.length} contacts` };
    } catch (e: any) {
      console.error('Error deleting contacts:', e);
      addNotification('error', `Failed to delete contacts: ${e.message}`);
      return { success: false, message: e.message };
    }
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

      // Handle error responses (e.g., duplicate lender)
      if (!response.ok) {
        addNotification('error', cs.error || 'Failed to create claim');
        return { success: false, message: cs.error || 'Failed to create claim' };
      }

      // Handle Category 3 lender confirmation flow
      if (cs.category3) {
        addNotification('info', cs.message || `Confirmation email sent to client for ${cs.lender}`);
        logActivity(claimData.contactId, 'Category 3 Confirmation Sent', `Awaiting client confirmation for ${cs.lender}`, 'email');
        return { success: true, category3: true, message: cs.message, lender: cs.lender };
      }

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

  const updateClaimStatus = async (claimId: string, newStatus: string): Promise<{ success: boolean; message: string }> => {
    const isValidStatus = Object.values(ClaimStatus).includes(newStatus as ClaimStatus);
    if (!isValidStatus) {
      addNotification('error', 'Invalid status provided');
      return { success: false, message: 'Invalid status' };
    }

    try {
      // Call the backend API to persist the status change
      const response = await fetch(`${API_BASE_URL}/cases/${claimId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (!response.ok) {
        // Try to parse as JSON, but handle HTML error pages gracefully
        let errorMessage = 'Failed to update claim status';
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          } else {
            errorMessage = `Server error: ${response.status} ${response.statusText}`;
          }
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      // Find claim to log activity
      const claim = claims.find(c => c.id === claimId);
      if (claim) {
        logActivity(claim.contactId, 'Status Updated', `${claim.lender} claim moved to ${newStatus}`, 'status_change', claimId);
      }

      // Update local state immediately for responsiveness - no need for full refresh
      setClaims(prev => prev.map(c => {
        if (c.id === claimId) {
          return { ...c, status: newStatus as ClaimStatus, daysInStage: 0 };
        }
        return c;
      }));

      addNotification('success', 'Claim status updated');
      return { success: true, message: 'Status updated' };
    } catch (e: any) {
      addNotification('error', e.message || 'Failed to update status');
      return { success: false, message: e.message };
    }
  };

  // Optimized bulk update - single API call for multiple claims
  const bulkUpdateClaimStatusByIds = async (claimIds: string[], newStatus: string): Promise<{ success: boolean; count: number; message: string }> => {
    const isValidStatus = Object.values(ClaimStatus).includes(newStatus as ClaimStatus);
    if (!isValidStatus) {
      addNotification('error', 'Invalid status provided');
      return { success: false, count: 0, message: 'Invalid status' };
    }

    if (claimIds.length === 0) {
      return { success: false, count: 0, message: 'No claims selected' };
    }

    try {
      // Single API call to update all claims at once
      const response = await fetch(`${API_BASE_URL}/cases/bulk/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimIds, status: newStatus })
      });

      if (!response.ok) {
        let errorMessage = 'Failed to bulk update claims';
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          } else {
            errorMessage = `Server error: ${response.status} ${response.statusText}`;
          }
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();

      // Log activity for each updated claim
      claimIds.forEach(claimId => {
        const claim = claims.find(c => c.id === claimId);
        if (claim) {
          logActivity(claim.contactId, 'Bulk Status Update', `${claim.lender} claim moved to ${newStatus}`, 'status_change', claimId);
        }
      });

      // Update local state immediately for responsiveness
      setClaims(prev => prev.map(c => {
        if (claimIds.includes(c.id)) {
          return { ...c, status: newStatus as ClaimStatus, daysInStage: 0 };
        }
        return c;
      }));

      addNotification('success', `${result.updatedCount || claimIds.length} claims updated to ${newStatus}`);
      // Local state already updated - no need for full refresh
      return { success: true, count: result.updatedCount || claimIds.length, message: `Updated ${result.updatedCount || claimIds.length} claims` };
    } catch (e: any) {
      addNotification('error', e.message || 'Failed to bulk update');
      return { success: false, count: 0, message: e.message };
    }
  };

  const deleteClaim = async (claimId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/cases/${claimId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        let errorMessage = 'Failed to delete claim';
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          } else {
            errorMessage = `Server error: ${response.status} ${response.statusText}`;
          }
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      let result = { message: 'Claim deleted' };
      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          result = await response.json();
        }
      } catch {
        // Ignore JSON parse errors for success response
      }

      // Update local state
      setClaims(prev => prev.filter(c => c.id !== claimId));

      addNotification('success', 'Claim deleted successfully');
      return { success: true, message: result.message || 'Claim deleted' };
    } catch (e: any) {
      console.error('Error deleting claim:', e);
      addNotification('error', `Failed to delete claim: ${e.message}`);
      return { success: false, message: e.message };
    }
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
          // Pass category for category-based folder structure
          if (docData.category) {
            formData.append('category', docData.category);
          }

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

  const updateDocumentStatus = async (docId: string, status: DocumentStatus) => {
    const doc = documents.find(d => d.id === docId);
    const previousStatus = doc?.documentStatus || 'Draft';
    // Optimistic update
    setDocuments(prev => prev.map(d =>
      d.id === docId ? { ...d, documentStatus: status } : d
    ));
    try {
      await fetch(`${API_BASE_URL}/documents/${docId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          previous_status: previousStatus,
          actor_id: currentUser?.id,
          actor_name: currentUser?.fullName || currentUser?.email,
        }),
      });
    } catch (err) {
      console.error('Failed to update document status:', err);
    }
  };

  const sendDocument = async (docId: string): Promise<{ trackingUrl?: string; declineUrl?: string } | null> => {
    const doc = documents.find(d => d.id === docId);
    if (!doc) return null;
    // Optimistic update to Sent
    setDocuments(prev => prev.map(d =>
      d.id === docId ? { ...d, documentStatus: 'Sent' as DocumentStatus, sentAt: new Date().toISOString() } : d
    ));
    try {
      const res = await fetch(`${API_BASE_URL}/documents/${docId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor_id: currentUser?.id,
          actor_name: currentUser?.fullName || currentUser?.email,
          contact_id: doc.associatedContactId,
        }),
      });
      if (!res.ok) throw new Error('Failed to send document');
      const data = await res.json();
      // Update local doc with tracking token
      setDocuments(prev => prev.map(d =>
        d.id === docId ? { ...d, trackingToken: data.tracking_token } : d
      ));
      addNotification('success', `Document marked as Sent`);
      return { trackingUrl: data.tracking_url, declineUrl: data.decline_url };
    } catch (err) {
      console.error('Failed to send document:', err);
      // Revert optimistic update
      setDocuments(prev => prev.map(d =>
        d.id === docId ? { ...d, documentStatus: doc.documentStatus, sentAt: doc.sentAt } : d
      ));
      addNotification('error', 'Failed to send document');
      return null;
    }
  };

  const fetchDocumentTimeline = async (docId: string): Promise<any[]> => {
    try {
      const res = await fetch(`${API_BASE_URL}/documents/${docId}/timeline`);
      if (!res.ok) throw new Error('Failed to fetch timeline');
      return await res.json();
    } catch (err) {
      console.error('Failed to fetch document timeline:', err);
      return [];
    }
  };

  // --- Template Logic ---
  const addTemplate = async (tplData: Partial<Template>): Promise<{ success: boolean; message: string; id?: string }> => {
    const newTpl: Template = {
      id: `t${Date.now()}`,
      name: tplData.name || 'Untitled Template',
      category: tplData.category || 'General',
      description: tplData.description || '',
      content: tplData.content || '',
      lastModified: new Date().toISOString().split('T')[0],
      customVariables: tplData.customVariables || [],
    };
    try {
      const res = await fetch(`${API_BASE_URL}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTpl),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to save template');
      }
      setTemplates(prev => [newTpl, ...prev]);
      addNotification('success', `Template '${newTpl.name}' created`);
      return { success: true, message: `Created template: ${newTpl.name}`, id: newTpl.id };
    } catch (err) {
      console.error('Error saving template:', err);
      addNotification('error', 'Failed to save template to server');
      return { success: false, message: 'Failed to save template' };
    }
  };

  const updateTemplate = async (tpl: Template): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch(`${API_BASE_URL}/templates/${tpl.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tpl),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to update template');
      }
      setTemplates(prev => prev.map(t => t.id === tpl.id ? tpl : t));
      addNotification('success', 'Template updated successfully');
      return { success: true, message: `Updated template: ${tpl.name}` };
    } catch (err) {
      console.error('Error updating template:', err);
      addNotification('error', 'Failed to save template — changes may be lost');
      return { success: false, message: 'Failed to update template' };
    }
  };

  const deleteTemplate = async (id: string): Promise<{ success: boolean; message: string }> => {
    const tpl = templates.find(t => t.id === id);
    try {
      const res = await fetch(`${API_BASE_URL}/templates/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to delete template');
      }
      setTemplates(prev => prev.filter(t => t.id !== id));
      addNotification('success', `Template deleted`);
      return { success: true, message: `Deleted template: ${tpl?.name || id}` };
    } catch (err) {
      console.error('Error deleting template:', err);
      addNotification('error', 'Failed to delete template');
      return { success: false, message: 'Failed to delete template' };
    }
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
    setCommunications([]);
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
      // Refresh to sync
      await refreshAllData();
      return { success: true, message: 'Communication logged', id: newComm.id };
    } catch (e: any) {
      addNotification('error', e.message);
      return { success: false, message: e.message };
    }
  };

  // --- Workflow Triggers ---
  const fetchWorkflows = useCallback(async (clientId: string) => {
    setWorkflowTriggers([]);
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
      // Refresh to sync
      await refreshAllData();
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
      // Refresh to sync
      await refreshAllData();
      return { success: true, message: 'Workflow cancelled' };
    } catch (e: any) {
      addNotification('error', e.message);
      return { success: false, message: e.message };
    }
  };

  // --- CRM Notes (Enhanced) ---
  const fetchNotes = useCallback(async (clientId: string) => {
    setNotesLoading(true);
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
    } finally {
      setNotesLoading(false);
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
      const noteData = data.note || data; // Server returns { success: true, note: {...} }

      const newNote: CRMNote = {
        id: noteData.id.toString(),
        clientId: noteData.client_id.toString(),
        content: noteData.content,
        pinned: noteData.pinned,
        createdBy: noteData.created_by,
        createdByName: noteData.created_by_name,
        createdAt: noteData.created_at
      };

      setCrmNotes(prev => [newNote, ...prev]);
      addNotification('success', 'Note added successfully');
      // Refresh to sync
      await refreshAllData();
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
      // Refresh to sync
      await refreshAllData();
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
      // Refresh to sync
      await refreshAllData();
      return { success: true, message: 'Note deleted' };
    } catch (e: any) {
      addNotification('error', e.message);
      return { success: false, message: e.message };
    }
  };

  // --- Action Timeline ---
  const fetchActionLogs = useCallback(async (clientId: string) => {
    setActionLogs([]);
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

      // Merge with existing logs instead of replacing them
      // Remove old logs for this client and add the new ones
      setActionLogs(prevLogs => {
        const otherClientLogs = prevLogs.filter(log => String(log.clientId) !== String(clientId));
        return [...otherClientLogs, ...mappedLogs];
      });
    } catch (error) {
      console.error('Error fetching action logs:', error);
    }
  }, []);

  // Fetch all action logs (latest per client) for contacts list view
  const fetchAllActionLogs = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/actions/all`);
      if (!response.ok) throw new Error('Failed to fetch all action logs');
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
      console.error('Error fetching all action logs:', error);
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
    documentChecklist?: {
      identification?: boolean;
      extraLender?: boolean;
      questionnaire?: boolean;
      poa?: boolean;
    };
    checklistChange?: {
      field: string;
      value: boolean;
    };
    extraLenders?: string;
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
        requestBody.previous_addresses = data.previousAddresses;
      }

      if (data.clientId) {
        requestBody.client_id = data.clientId;
      }

      if (data.documentChecklist) {
        requestBody.document_checklist = data.documentChecklist;
      }

      // Include checklist change details for action logging
      if (data.checklistChange) {
        requestBody.checklist_change = data.checklistChange;
      }

      if (data.extraLenders !== undefined) {
        requestBody.extra_lenders = data.extraLenders;
      }

      // Include current user info for action logging
      if (currentUser) {
        requestBody.actor_id = currentUser.id;
        requestBody.actor_name = currentUser.fullName;
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
            clientId: data.clientId || c.clientId,
            documentChecklist: data.documentChecklist || c.documentChecklist,
            extraLenders: data.extraLenders !== undefined ? data.extraLenders : c.extraLenders
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
      // Refresh all data to ensure UI is in sync
      await refreshAllData();
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

  // ============================================
  // TASKS & CALENDAR METHODS
  // ============================================

  const fetchTasks = useCallback(async (filters?: { startDate?: string; endDate?: string; status?: string; assignedTo?: string }) => {
    try {
      const params = new URLSearchParams();
      if (filters?.startDate) params.append('startDate', filters.startDate);
      if (filters?.endDate) params.append('endDate', filters.endDate);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.assignedTo) params.append('assignedTo', filters.assignedTo);

      const response = await fetch(`${API_BASE_URL}/tasks?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch tasks');
      const data = await response.json();

      const mappedTasks: Task[] = data.map((t: any) => ({
        id: t.id.toString(),
        title: t.title,
        description: t.description,
        type: t.type,
        status: t.status,
        date: t.date,
        startTime: t.start_time,
        endTime: t.end_time,
        assignedTo: t.assigned_to?.toString(),
        assignedToName: t.assigned_to_name,
        assignedBy: t.assigned_by?.toString(),
        assignedByName: t.assigned_by_name,
        assignedAt: t.assigned_at,
        isRecurring: t.is_recurring,
        recurrencePattern: t.recurrence_pattern,
        recurrenceEndDate: t.recurrence_end_date,
        parentTaskId: t.parent_task_id?.toString(),
        contactIds: t.linked_contacts?.map((c: any) => c.id.toString()) || [],
        linkedContacts: t.linked_contacts || [],
        claimIds: t.linked_claims?.map((c: any) => c.id.toString()) || [],
        linkedClaims: t.linked_claims || [],
        reminders: t.reminders?.map((r: any) => ({
          id: r.id.toString(),
          taskId: t.id.toString(),
          reminderTime: r.reminder_time,
          reminderType: 'in_app',
          isSent: r.is_sent
        })) || [],
        createdBy: t.created_by?.toString(),
        createdByName: t.created_by_name,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        completedAt: t.completed_at,
        completedBy: t.completed_by?.toString()
      }));

      setTasks(mappedTasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  }, []);

  const addTask = async (taskData: Partial<Task>): Promise<{ success: boolean; message: string; id?: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: taskData.title,
          description: taskData.description,
          type: taskData.type || 'appointment',
          date: taskData.date,
          startTime: taskData.startTime,
          endTime: taskData.endTime,
          assignedTo: taskData.assignedTo ? parseInt(taskData.assignedTo) : null,
          assignedBy: currentUser?.id ? parseInt(currentUser.id) : null,
          isRecurring: taskData.isRecurring || false,
          recurrencePattern: taskData.recurrencePattern,
          recurrenceEndDate: taskData.recurrenceEndDate,
          contactIds: taskData.contactIds?.map(id => parseInt(id)),
          claimIds: taskData.claimIds?.map(id => parseInt(id)),
          reminders: taskData.reminders?.map(r => ({
            reminderTime: r.reminderTime,
            reminderType: r.reminderType
          })),
          createdBy: currentUser?.id ? parseInt(currentUser.id) : null
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to create task');

      await fetchTasks();
      addNotification('success', 'Task created successfully');
      return { success: true, message: 'Task created', id: result.id.toString() };
    } catch (error: any) {
      console.error('Error creating task:', error);
      addNotification('error', `Failed to create task: ${error.message}`);
      return { success: false, message: error.message };
    }
  };

  const updateTask = async (taskId: string, updates: Partial<Task>): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: updates.title,
          description: updates.description,
          type: updates.type,
          status: updates.status,
          date: updates.date,
          startTime: updates.startTime,
          endTime: updates.endTime,
          assignedTo: updates.assignedTo ? parseInt(updates.assignedTo) : undefined,
          assignedBy: updates.assignedBy ? parseInt(updates.assignedBy) : undefined,
          isRecurring: updates.isRecurring,
          recurrencePattern: updates.recurrencePattern,
          recurrenceEndDate: updates.recurrenceEndDate,
          contactIds: updates.contactIds?.map(id => parseInt(id)),
          claimIds: updates.claimIds?.map(id => parseInt(id)),
          reminders: updates.reminders?.map(r => ({
            reminderTime: r.reminderTime,
            reminderType: r.reminderType
          }))
        })
      });

      if (!response.ok) throw new Error('Failed to update task');

      await fetchTasks();
      addNotification('success', 'Task updated');
      return { success: true, message: 'Task updated' };
    } catch (error: any) {
      console.error('Error updating task:', error);
      addNotification('error', `Failed to update task: ${error.message}`);
      return { success: false, message: error.message };
    }
  };

  const deleteTask = async (taskId: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete task');

      setTasks(prev => prev.filter(t => t.id !== taskId));
      addNotification('success', 'Task deleted');
      return { success: true, message: 'Task deleted' };
    } catch (error: any) {
      console.error('Error deleting task:', error);
      addNotification('error', `Failed to delete task: ${error.message}`);
      return { success: false, message: error.message };
    }
  };

  const completeTask = async (taskId: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completedBy: currentUser?.id ? parseInt(currentUser.id) : null })
      });

      if (!response.ok) throw new Error('Failed to complete task');

      await fetchTasks();
      addNotification('success', 'Task marked as completed');
      return { success: true, message: 'Task completed' };
    } catch (error: any) {
      console.error('Error completing task:', error);
      addNotification('error', `Failed to complete task: ${error.message}`);
      return { success: false, message: error.message };
    }
  };

  const rescheduleTask = async (taskId: string, newDate: string, newStartTime?: string): Promise<{ success: boolean; message: string; newTaskId?: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newDate,
          newStartTime,
          rescheduledBy: currentUser?.id ? parseInt(currentUser.id) : null
        })
      });

      if (!response.ok) throw new Error('Failed to reschedule task');
      const result = await response.json();

      await fetchTasks();
      addNotification('success', 'Task rescheduled');
      return { success: true, message: 'Task rescheduled', newTaskId: result.newTaskId?.toString() };
    } catch (error: any) {
      console.error('Error rescheduling task:', error);
      addNotification('error', `Failed to reschedule task: ${error.message}`);
      return { success: false, message: error.message };
    }
  };

  // ============================================
  // PERSISTENT NOTIFICATIONS METHODS
  // ============================================

  const fetchPersistentNotifications = useCallback(async () => {
    if (!currentUser?.id) return;

    try {
      const [notifResponse, countResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/notifications?userId=${currentUser.id}`),
        fetch(`${API_BASE_URL}/notifications/count?userId=${currentUser.id}`)
      ]);

      if (notifResponse.ok) {
        const data = await notifResponse.json();
        const mapped: PersistentNotification[] = data.map((n: any) => ({
          id: n.id.toString(),
          userId: n.user_id?.toString() || '',
          type: n.type,
          title: n.title,
          message: n.message,
          link: n.link,
          relatedTaskId: n.related_task_id?.toString(),
          taskTitle: n.task_title,
          taskDate: n.task_date,
          contactId: n.contact_id?.toString(),
          contactName: n.contact_name,
          isRead: n.is_read,
          createdAt: n.created_at
        }));
        setPersistentNotifications(mapped);

        // Detect new error notifications and show toasts
        if (isFirstNotificationFetch.current) {
          // First load: show toasts for recent unread errors (last 30 min), seed the rest
          const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
          const recentUnread: PersistentNotification[] = [];
          mapped.forEach(n => {
            if (n.type === 'action_error' && !n.isRead && n.createdAt > thirtyMinAgo) {
              recentUnread.push(n);
            }
            seenNotificationIds.current.add(n.id);
          });
          // Show up to 5 most recent as toasts (they're already sorted desc)
          recentUnread.slice(0, 5).reverse().forEach(n => {
            addErrorToast(n);
          });
          isFirstNotificationFetch.current = false;
        } else {
          const newErrors = mapped.filter(
            n => n.type === 'action_error' && !n.isRead && !seenNotificationIds.current.has(n.id)
          );
          if (newErrors.length > 0) {
            newErrors.forEach(n => {
              seenNotificationIds.current.add(n.id);
              addErrorToast(n);
            });
            // Refresh claims data so status changes (e.g. reverted to LOA Signed) appear live
            claimsFetchedAtRef.current = 0; // Reset cache to force fresh fetch
            fetchAllClaims();
          }
        }
      }

      if (countResponse.ok) {
        const countData = await countResponse.json();
        setUnreadNotificationCount(countData.count);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  }, [currentUser?.id, addErrorToast, fetchAllClaims]);

  const markNotificationRead = async (notificationId: string): Promise<void> => {
    try {
      await fetch(`${API_BASE_URL}/notifications/${notificationId}/read`, { method: 'PATCH' });
      setPersistentNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
      );
      setUnreadNotificationCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification read:', error);
    }
  };

  const markAllNotificationsRead = async (): Promise<void> => {
    if (!currentUser?.id) return;

    try {
      await fetch(`${API_BASE_URL}/notifications/read-all`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: parseInt(currentUser.id) })
      });
      setPersistentNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadNotificationCount(0);
    } catch (error) {
      console.error('Error marking all notifications read:', error);
    }
  };

  // ============================================
  // SUPPORT TICKETS
  // ============================================

  const fetchTickets = async (): Promise<void> => {
    if (!currentUser?.id) return;
    try {
      const response = await fetch(`${API_BASE_URL}/tickets?userId=${currentUser.id}&role=${currentUser.role}`);
      if (!response.ok) throw new Error('Failed to fetch tickets');
      const data = await response.json();
      setTickets(data.map((t: any) => ({
        id: t.id.toString(),
        userId: t.user_id.toString(),
        userName: t.user_name,
        title: t.title,
        description: t.description,
        screenshotUrl: t.screenshot_url || undefined,
        screenshotKey: t.screenshot_key || undefined,
        status: t.status,
        resolvedBy: t.resolved_by?.toString(),
        resolvedByName: t.resolved_by_name,
        resolvedAt: t.resolved_at,
        createdAt: t.created_at,
      })));
    } catch (error) {
      console.error('Error fetching tickets:', error);
    }
  };

  const createTicket = async (title: string, description: string, screenshot?: File): Promise<{ success: boolean; message: string }> => {
    if (!currentUser?.id) return { success: false, message: 'Not logged in' };
    try {
      const formData = new FormData();
      formData.append('userId', currentUser.id);
      formData.append('userName', currentUser.fullName);
      formData.append('title', title);
      formData.append('description', description);
      if (screenshot) {
        formData.append('screenshot', screenshot);
      }

      const response = await fetch(`${API_BASE_URL}/tickets`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error('Failed to create ticket');
      const data = await response.json();

      // Refresh tickets list
      await fetchTickets();
      // Refresh notifications (Management users will see the new notification)
      await fetchPersistentNotifications();

      return { success: true, message: 'Ticket created successfully' };
    } catch (error) {
      console.error('Error creating ticket:', error);
      return { success: false, message: 'Failed to create ticket' };
    }
  };

  const resolveTicket = async (ticketId: string): Promise<{ success: boolean; message: string }> => {
    if (!currentUser?.id) return { success: false, message: 'Not logged in' };
    try {
      const response = await fetch(`${API_BASE_URL}/tickets/${ticketId}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolvedBy: parseInt(currentUser.id),
          resolvedByName: currentUser.fullName,
        }),
      });
      if (!response.ok) throw new Error('Failed to resolve ticket');

      // Refresh tickets
      await fetchTickets();

      return { success: true, message: 'Ticket resolved successfully' };
    } catch (error) {
      console.error('Error resolving ticket:', error);
      return { success: false, message: 'Failed to resolve ticket' };
    }
  };

  const fetchCombinedTimeline = async (contactId: string): Promise<TimelineItem[]> => {
    try {
      const response = await fetch(`${API_BASE_URL}/contacts/${contactId}/combined-timeline`);
      if (!response.ok) throw new Error('Failed to fetch timeline');
      const data = await response.json();

      return data.map((item: any) => ({
        id: item.id.toString(),
        title: item.title,
        type: item.type,
        itemType: item.item_type,
        timestamp: item.timestamp,
        status: item.status,
        direction: item.direction,
        actionCategory: item.action_category
      }));
    } catch (error) {
      console.error('Error fetching combined timeline:', error);
      return [];
    }
  };

  // Fetch tasks and notifications on user login
  useEffect(() => {
    if (currentUser) {
      fetchTasks();
      fetchPersistentNotifications();

      // Check for reminders every minute
      const reminderInterval = setInterval(() => {
        fetch(`${API_BASE_URL}/reminders/check`, { method: 'POST' })
          .then(() => fetchPersistentNotifications())
          .catch(console.error);
      }, 60000);

      return () => clearInterval(reminderInterval);
    }
  }, [currentUser, fetchTasks, fetchPersistentNotifications]);

  // === PERFORMANCE: Memoize Provider value to prevent cascade re-renders ===
  // Without this, every state change creates a new object reference, causing ALL
  // context consumers to re-render even if they don't use the changed state.
  const contextValue = useMemo(() => ({
    currentUser, users, login, logout,
    initiateRegistration, verifyRegistration, updateUserRole, updateUserStatus, deleteUser,
    requestPasswordReset, resetPassword,
    contacts, documents, templates, forms, claims, appointments, activityLogs,
    notifications, addNotification, removeNotification,
    errorToasts, removeErrorToast,
    activeContext, setActiveContext,
    currentView, setCurrentView,
    pendingContactNavigation, navigateToContact, clearContactNavigation,
    updateContactStatus, updateContact, addContact, deleteContacts, getContactDetails, getPipelineStats,
    addClaim, updateClaim, deleteClaim, updateClaimStatus, bulkUpdateClaimStatusByIds, bulkUpdateClaims,
    addAppointment, updateAppointment, deleteAppointment, addDocument, updateDocument, updateDocumentStatus, sendDocument, fetchDocumentTimeline,
    addTemplate, updateTemplate, deleteTemplate,
    addForm, updateForm, deleteForm,
    addNote, theme, toggleTheme,
    communications, fetchCommunications, addCommunication,
    workflowTriggers, fetchWorkflows, triggerWorkflow, cancelWorkflow,
    crmNotes, notesLoading, fetchNotes, addCRMNote, updateCRMNote, deleteCRMNote,
    actionLogs, fetchActionLogs, fetchAllActionLogs,
    updateContactExtended, updateClaimExtended, fetchFullClaim,
    refreshAllData,
    tasks, fetchTasks, addTask, updateTask, deleteTask, completeTask, rescheduleTask,
    persistentNotifications, unreadNotificationCount, fetchPersistentNotifications,
    markNotificationRead, markAllNotificationsRead, fetchCombinedTimeline, fetchCasesForContact, fetchAllClaims,
    tickets, fetchTickets, createTicket, resolveTicket,
    isLoading,
    contactsPagination, loadMoreContacts, fetchContactsPage
  }), [
    currentUser, users, contacts, documents, templates, forms, claims, appointments,
    activityLogs, notifications, errorToasts, activeContext, currentView, pendingContactNavigation,
    communications, workflowTriggers, crmNotes, notesLoading, actionLogs, theme,
    tasks, persistentNotifications, unreadNotificationCount, tickets, isLoading, contactsPagination,
    // Stable callbacks (useCallback) won't trigger re-renders
    login, logout, initiateRegistration, verifyRegistration, updateUserRole, updateUserStatus,
    deleteUser, requestPasswordReset, resetPassword, addNotification, removeNotification,
    removeErrorToast, setActiveContext, setCurrentView, navigateToContact, clearContactNavigation,
    updateContactStatus, updateContact, addContact, deleteContacts, getContactDetails,
    getPipelineStats, addClaim, updateClaim, deleteClaim, updateClaimStatus,
    bulkUpdateClaimStatusByIds, bulkUpdateClaims, addAppointment, updateAppointment,
    deleteAppointment, addDocument, updateDocument, sendDocument, fetchDocumentTimeline, addTemplate, updateTemplate, deleteTemplate,
    addForm, updateForm, deleteForm, addNote, toggleTheme, fetchCommunications,
    addCommunication, fetchWorkflows, triggerWorkflow, cancelWorkflow, fetchNotes,
    addCRMNote, updateCRMNote, deleteCRMNote, fetchActionLogs, fetchAllActionLogs,
    updateContactExtended, updateClaimExtended, fetchFullClaim, refreshAllData,
    fetchTasks, addTask, updateTask, deleteTask, completeTask, rescheduleTask,
    fetchPersistentNotifications, markNotificationRead, markAllNotificationsRead,
    fetchCombinedTimeline, fetchCasesForContact, fetchAllClaims, loadMoreContacts, fetchContactsPage,
    fetchTickets, createTicket, resolveTicket
  ]);

  return (
    <CRMContext.Provider value={contextValue}>
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
