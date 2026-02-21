/**
 * Lender Utilities
 * Lookup lender address and email from all_lenders_details.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load lender data at startup
let allLendersData = null;

function loadLendersData() {
    if (allLendersData) return allLendersData;

    const lendersPath = path.join(__dirname, 'all_lenders_details.json');
    if (fs.existsSync(lendersPath)) {
        const content = fs.readFileSync(lendersPath, 'utf-8');
        allLendersData = JSON.parse(content.replace(/:\s*NaN/g, ': null'));
    } else {
        allLendersData = [];
    }

    return allLendersData;
}

/**
 * Find lender data by name (exact or partial match)
 */
function findLender(lenderName) {
    if (!lenderName) return null;

    const lenders = loadLendersData();
    const normalizedInput = lenderName.toUpperCase().trim();

    // Try exact match first
    let lenderData = lenders.find(l => l.lender?.toUpperCase() === normalizedInput);

    // Try partial match
    if (!lenderData) {
        lenderData = lenders.find(l => {
            const lenderUpper = l.lender?.toUpperCase() || '';
            return lenderUpper.includes(normalizedInput) || normalizedInput.includes(lenderUpper);
        });
    }

    return lenderData;
}

/**
 * Get lender address
 */
export function getLenderAddress(lenderName) {
    const lenderData = findLender(lenderName);

    if (!lenderData || !lenderData.address) return null;

    const addr = lenderData.address;
    return {
        company_name: addr.company_name && addr.company_name !== 'NaN' ? addr.company_name : '',
        first_line_address: addr.first_line_address && addr.first_line_address !== 'NaN' ? addr.first_line_address : '',
        town_city: addr.town_city && addr.town_city !== 'NaN' ? addr.town_city : '',
        postcode: addr.postcode && addr.postcode !== 'NaN' ? addr.postcode : ''
    };
}

/**
 * Get lender email
 */
export function getLenderEmail(lenderName) {
    const lenderData = findLender(lenderName);
    return lenderData?.email || null;
}
