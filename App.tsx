
import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Contacts from './components/Contacts';
import Pipeline from './components/Pipeline';
import Calendar from './components/Calendar';
import Conversations from './components/Conversations';
import { EmailConversations } from './components/Email';
import Documents from './components/Documents';
import Forms from './components/Forms';
import Workflows from './components/Workflows';
import Marketing from './components/Marketing';
import AIAssistant from './components/AIAssistant';
import AdminPanel from './components/AdminPanel';
import Settings from './components/Settings';
import ClientIntake from './components/IntakeForm/ClientIntake';
import LenderIntake from './components/IntakeForm/LenderIntake';
import LoaSelectionForm from './components/LoaSelectionForm';
import Login from './components/Login';
import MattermostPanel from './components/MattermostPanel';
import { ViewState } from './types';
import { CRMProvider, useCRM } from './context/CRMContext';

// Route to ViewState mapping
const routeToViewState: Record<string, ViewState> = {
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
  '/mattermost': ViewState.MATTERMOST,
};

// ViewState to route mapping
export const viewStateToRoute: Record<ViewState, string> = {
  [ViewState.DASHBOARD]: '/dashboard',
  [ViewState.CONTACTS]: '/contacts',
  [ViewState.PIPELINE]: '/cases',
  [ViewState.CALENDAR]: '/calendar',
  [ViewState.CONVERSATIONS]: '/conversations',
  [ViewState.CONVERSATIONS_ALL]: '/conversations',
  [ViewState.CONVERSATIONS_FACEBOOK]: '/conversations/facebook',
  [ViewState.CONVERSATIONS_WHATSAPP]: '/conversations/whatsapp',
  [ViewState.CONVERSATIONS_SMS]: '/conversations/sms',
  [ViewState.CONVERSATIONS_EMAIL]: '/conversations/email',
  [ViewState.MARKETING]: '/marketing',
  [ViewState.DOCUMENTS]: '/documents',
  [ViewState.FORMS]: '/forms',
  [ViewState.WORKFLOW]: '/automation',
  [ViewState.SETTINGS]: '/settings',
  [ViewState.MANAGEMENT]: '/management',
  [ViewState.LENDERS]: '/accounts',
  [ViewState.CLIENT_INTAKE]: '/client-intake',
  [ViewState.MATTERMOST]: '/mattermost',
};

// Loading spinner component
const LoadingSpinner = () => (
  <div className="fixed inset-0 bg-white dark:bg-slate-900 flex flex-col items-center justify-center z-50">
    <div className="relative">
      {/* Outer ring */}
      <div className="w-16 h-16 border-4 border-blue-200 dark:border-blue-900 rounded-full animate-pulse"></div>
      {/* Spinning ring */}
      <div className="absolute top-0 left-0 w-16 h-16 border-4 border-transparent border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
    </div>
    <p className="mt-4 text-gray-600 dark:text-gray-400 text-sm font-medium">Loading CRM data...</p>
  </div>
);

const AppContent = () => {
  const { currentUser, currentView, setCurrentView, isLoading } = useCRM();
  const [isAIOpen, setIsAIOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Sync URL with currentView state
  useEffect(() => {
    const pathname = location.pathname.toLowerCase().replace(/\/$/, '') || '/';
    const viewState = routeToViewState[pathname];
    if (viewState && viewState !== currentView) {
      setCurrentView(viewState);
    }
  }, [location.pathname, setCurrentView]);

  // Navigation handler that updates both state and URL
  const handleChangeView = (view: ViewState) => {
    setCurrentView(view);
    const route = viewStateToRoute[view];
    if (route) {
      navigate(route);
    }
  };

  // If not logged in, show Login Screen
  if (!currentUser) {
    return (
      <Routes>
        {/* Public standalone routes */}
        <Route path="/intake/vanquis" element={<LenderIntake lenderType="VANQUIS" />} />
        <Route path="/intake/loans2go" element={<LenderIntake lenderType="LOANS2GO" />} />
        <Route path="/intake/gambling" element={<LenderIntake lenderType="GAMBLING" />} />
        <Route path="/loa-form/*" element={<LoaSelectionForm />} />
        {/* Default to login for all other routes when not authenticated */}
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  // Show loading spinner while initial data is being fetched
  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <Routes>
      {/* Public standalone routes - NO sidebar/layout (must be first to take priority) */}
      <Route path="/intake/vanquis" element={<LenderIntake lenderType="VANQUIS" />} />
      <Route path="/intake/loans2go" element={<LenderIntake lenderType="LOANS2GO" />} />
      <Route path="/intake/gambling" element={<LenderIntake lenderType="GAMBLING" />} />
      <Route path="/loa-form/*" element={<LoaSelectionForm />} />

      {/* All other routes wrapped in Layout with sidebar */}
      <Route path="*" element={
        <>
          <Layout
            currentView={currentView}
            onChangeView={handleChangeView}
            onToggleAI={() => setIsAIOpen(true)}
          >
            <Routes>
              {/* Dashboard */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />

              {/* Contacts */}
              <Route path="/contacts" element={<Contacts />} />

              {/* Cases/Pipeline */}
              <Route path="/cases" element={<Pipeline />} />

              {/* Calendar */}
              <Route path="/calendar" element={<Calendar />} />

              {/* Conversations */}
              <Route path="/conversations" element={<Conversations platformFilter="all" />} />
              <Route path="/conversations/facebook" element={<Conversations platformFilter="facebook" />} />
              <Route path="/conversations/whatsapp" element={<Conversations platformFilter="whatsapp" />} />
              <Route path="/conversations/sms" element={<Conversations platformFilter="sms" />} />
              <Route path="/conversations/email" element={<EmailConversations />} />

              {/* Marketing */}
              <Route path="/marketing" element={<Marketing />} />

              {/* Documents */}
              <Route path="/documents" element={<Documents />} />

              {/* Forms */}
              <Route path="/forms" element={<Forms />} />

              {/* Automation/Workflow */}
              <Route path="/automation" element={<Workflows />} />

              {/* Settings */}
              <Route path="/settings" element={<Settings />} />

              {/* Management (Admin Panel) */}
              <Route path="/management" element={<AdminPanel />} />

              {/* Accounts/Lenders */}
              <Route path="/accounts" element={
                <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
                  <h2 className="text-2xl font-bold mb-2">Coming Soon</h2>
                  <p>The Accounts module is under development.</p>
                </div>
              } />

              {/* Mattermost Team Chat */}
              <Route path="/mattermost" element={<MattermostPanel />} />

              {/* Client Intake (internal) */}
              <Route path="/client-intake" element={<ClientIntake />} />

              {/* Fallback - redirect unknown routes to dashboard */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Layout>

          <AIAssistant
            isOpen={isAIOpen}
            onClose={() => setIsAIOpen(false)}
          />
        </>
      } />
    </Routes>
  );
};

function App() {
  return (
    <CRMProvider>
      <AppContent />
    </CRMProvider>
  );
}

export default App;
