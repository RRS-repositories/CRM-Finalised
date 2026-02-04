# CRM Claim Details Page - Dev Specification

**Client:** Rowan Rose Solicitors  
**Date:** 20 January 2026  
**Version:** 1.0

---

## Layout Requirements

- All fields must be displayed in a **SINGLE COLUMN** layout (not 2 columns)
- Fields appear in the exact order specified below within each section

---

## Dynamic Field Logic (EF = Extra Fields)

Fields marked **(EF)** are dynamic and must generate additional instances based on:

1. **Type of Finance multi-select:** When an additional finance type is selected (e.g., both Loan and Credit Card with same lender), all (EF) fields should duplicate to capture details for each finance type.

2. **No of Loans dropdown:** When a number greater than 1 is selected (e.g., 5), all (EF) fields should generate that many additional input fields to capture details for each loan.

> **KEY:** Fields marked with **(EF)** = Extra Fields that duplicate based on finance type or loan count

---

## SECTION 1: CLAIM DETAILS

| Field Name | Field Type | Notes |
|------------|------------|-------|
| Lender | Dropdown - Single Select | List of all lenders |
| Status | Dropdown - Single Select | Claim status options |
| Type of Finance | Dropdown - Multi Select | Triggers (EF) duplication when multiple selected |
| Account Number **(EF)** | Single Line Text | Duplicates per finance type |
| No of Loans | Dropdown - Number 1-50 | Triggers (EF) duplication based on count |
| Value of Loan(s) **(EF)** | Single Line Text | Duplicates per loan count |
| Start Date(s) **(EF)** | Single Line Text | Duplicates per loan count |
| End Date(s) **(EF)** | Single Line Text | Duplicates per loan count |
| APR (%) **(EF)** | Single Line Text | Duplicates per loan count |
| Billed/Interest Charges | Single Line Text | |
| Late Payment Charges | Single Line Text | |
| Overlimit Charges | Single Line Text | |
| Credit Limit & Increases | Large Text Field | Multi-line textarea |
| DSAR Review | Large Text Field | Multi-line textarea |
| Complaint Paragraph | Large Text Field | Multi-line textarea |

---

## SECTION 2: PAYMENT SECTION

| Field Name | Field Type | Notes |
|------------|------------|-------|
| Offer Made | Single Line Text | Amount offered by lender |
| Total Refund | Single Line Text | |
| Total Debt | Single Line Text | |
| Balance Due to Client | Single Line Text | |
| Our Fees + VAT | Single Line Text | |
| Our Fees - VAT | Single Line Text | |
| VAT | Single Line Text | |
| Total Fee | Single Line Text | |
| Outstanding Debt | Single Line Text | |

---

## SECTION 3: PAYMENT PLAN

| Field Name | Field Type | Notes |
|------------|------------|-------|
| Client Outstanding Fees | Single Line Text | |
| Payment Plan | Dropdown - Single Select | Options: Plan Set Up / Missed Payment / Not Set Up / Settled |
| Plan Date | Single Line Text | Date field |
| Term of the Plan | Single Line Text | |
| Start Date | Single Line Text | Date field |
| Remaining Balance | Single Line Text | |

---

## Technical Implementation Notes

### 1. Dynamic Field Generation
When 'Type of Finance' has multiple selections OR 'No of Loans' is greater than 1, dynamically generate additional instances of all (EF) fields. Each instance should be clearly labelled (e.g., "Loan 1 Value", "Loan 2 Value" or "Credit Card APR", "Loan APR").

### 2. Field Validation
- Currency fields should accept decimal values
- Date fields should use a date picker
- APR field should accept percentage format

### 3. Data Storage
Dynamic (EF) fields should be stored as arrays or nested objects to accommodate variable numbers of entries per claim.

### 4. Additional Fields
The specification allows for additional fields to be added as requirements evolve. Any new dynamic fields should follow the same (EF) pattern.
