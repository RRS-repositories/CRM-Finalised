
import React, { useState } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Contacts from './components/Contacts';
import Pipeline from './components/Pipeline';
import Conversations from './components/Conversations';
import Documents from './components/Documents';
import Forms from './components/Forms';
import Workflows from './components/Workflows';
import Marketing from './components/Marketing';
import AIAssistant from './components/AIAssistant';
import AdminPanel from './components/AdminPanel'; // Renamed conceptually to Management Panel inside the file
import Settings from './components/Settings'; // Added Import
import ClientIntake from './components/IntakeForm/ClientIntake';
import Login from './components/Login';
import { ViewState } from './types';
import { CRMProvider, useCRM } from './context/CRMContext';

const AppContent = () => {
  const { currentUser, currentView, setCurrentView } = useCRM();
  const [isAIOpen, setIsAIOpen] = useState(false);

  // Standalone Route Check (Public)
  const isIntakePath = window.location.pathname.toLowerCase().replace(/\/$/, '') === '/intake';
  if (isIntakePath) {
    return <ClientIntake />;
  }

  // If not logged in, show Login Screen (which handles Sign Up too)
  if (!currentUser) {
    return <Login />;
  }

  // Router Logic
  const renderView = () => {
    switch (currentView) {
      case ViewState.DASHBOARD:
        return <Dashboard />;
      case ViewState.CONTACTS:
        return <Contacts />;
      case ViewState.PIPELINE:
        return <Pipeline />;
      // ... existing cases ...
      case ViewState.CONVERSATIONS:
      case ViewState.CONVERSATIONS_ALL:
        return <Conversations platformFilter="all" />;
      case ViewState.CONVERSATIONS_FACEBOOK:
        return <Conversations platformFilter="facebook" />;
      case ViewState.CONVERSATIONS_WHATSAPP:
        return <Conversations platformFilter="whatsapp" />;
      case ViewState.CONVERSATIONS_SMS:
        return <Conversations platformFilter="sms" />;
      case ViewState.CONVERSATIONS_EMAIL:
        return <Conversations platformFilter="email" />;

      case ViewState.MARKETING:
        return <Marketing />;
      case ViewState.DOCUMENTS:
        return <Documents />;
      case ViewState.FORMS:
        return <Forms />;
      case ViewState.WORKFLOW:
        return <Workflows />;
      case ViewState.SETTINGS:
        return <Settings />;
      case ViewState.MANAGEMENT:
        return <AdminPanel />;
      case ViewState.CLIENT_INTAKE:
        return <ClientIntake />;
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
            <h2 className="text-2xl font-bold mb-2">Coming Soon</h2>
            <p>The {currentView} module is under development.</p>
          </div>
        );
    }
  };

  return (
    <Layout
      currentView={currentView}
      onChangeView={setCurrentView}
      onToggleAI={() => setIsAIOpen(true)}
    >
      {renderView()}

      <AIAssistant
        isOpen={isAIOpen}
        onClose={() => setIsAIOpen(false)}
      />
    </Layout>
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
