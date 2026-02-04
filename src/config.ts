// API Configuration
// This file centralizes all API endpoints for easy deployment configuration

// Determine the API base URL based on environment
const getApiBaseUrl = (): string => {
    // Use empty string so requests use relative paths (e.g. /api/...)
    // Vite proxy forwards /api/* to the backend on port 5000
    return '';
};

export const API_BASE_URL = getApiBaseUrl();
export const API_ENDPOINTS = {
    base: API_BASE_URL,
    api: `${API_BASE_URL}/api`,
    sendEmail: `${API_BASE_URL}/send-email`,
    auth: {
        login: `${API_BASE_URL}/api/auth/login`,
        register: `${API_BASE_URL}/api/auth/register`,
    },
    contacts: `${API_BASE_URL}/api/contacts`,
    cases: `${API_BASE_URL}/api/cases`,
    documents: `${API_BASE_URL}/api/documents`,
    submitPage1: `${API_BASE_URL}/api/submit-page1`,
    uploadDocument: `${API_BASE_URL}/api/upload-document`,
};

export default API_ENDPOINTS;
