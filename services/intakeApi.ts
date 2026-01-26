import { ClientFormData, Page1Response, Page2Response } from '../types';
import { API_ENDPOINTS } from '../src/config';

// The consolidated server runs on port 5000
const API_BASE_URL = API_ENDPOINTS.api;

export const submitPreviousAddress = async (data: { clientId: string | number, addresses: any[] }): Promise<any> => {
    const response = await fetch(`${API_BASE_URL}/submit-previous-address`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Network error' }));
        throw new Error(errorData.message || `Error: ${response.status}`);
    }

    return response.json();
};

export const submitPage1 = async (data: ClientFormData): Promise<Page1Response> => {
    const response = await fetch(`${API_BASE_URL}/submit-page1`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Network error' }));
        throw new Error(errorData.message || `Error: ${response.status}`);
    }

    return response.json();
};

export const uploadDocument = async (
    file: File,
    clientId: string,
    folderName: string
): Promise<Page2Response> => {
    const formData = new FormData();
    formData.append('document', file);
    formData.append('contact_id', clientId);
    formData.append('folder_name', folderName);

    const response = await fetch(`${API_BASE_URL}/upload-document`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Network error' }));
        throw new Error(errorData.message || `Error: ${response.status}`);
    }

    return response.json();
};
