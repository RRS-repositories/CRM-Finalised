// API Configuration
// This file centralizes all API endpoints for easy deployment configuration

// Determine the API base URL based on environment
const getApiBaseUrl = (): string => {
    // Check if we're in production (deployed on EC2)
    // In production build, use the current window location
    // In development, use localhost
    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (isDevelopment) {
        // Development mode - use localhost
        return 'http://localhost:5000';
    }

    // Production mode - use the current window location to construct API URL
    // This allows the app to work on any domain/IP
    return `${window.location.protocol}//${window.location.hostname}:5000`;
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
