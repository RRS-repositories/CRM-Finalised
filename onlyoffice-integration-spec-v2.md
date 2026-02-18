# OnlyOffice CRM Integration — Phase 1 Technical Specification

## Overview

Phase 1 integrates ONLYOFFICE Document Server support into the Rowan Rose Solicitors CRM — building all frontend components and backend API routes without touching the database or deploying the Document Server. Metadata is stored in-memory temporarily. The OnlyOffice server and database integration follow in Phase 2.

---

## Architecture (Phase 1)

```
┌─────────────────────────────────────────────────────────┐
│                    CRM Frontend                          │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Document      │  │ Template     │  │ Template      │  │
│  │ Files (exist) │  │ Library      │  │ Editor (NEW)  │  │
│  │              │  │ (existing)   │  │               │  │
│  └──────────────┘  └──────────────┘  └───────┬───────┘  │
│                                              │          │
│  ┌───────────────────────────────────────────┘          │
│  │                                                      │
│  │  OOTemplateManager ─── Upload / List / Edit / Delete │
│  │  OODocumentList ────── Generated docs + actions      │
│  │  MergeFieldPicker ──── Copy {{fields}} to clipboard  │
│  │  GenerateDocModal ──── Select template + merge data  │
│  │  OnlyOfficeEditor ──── Full-screen editor overlay    │
│  │                        (shows fallback if OO not     │
│  │                         connected)                   │
│  └──────────────────────────────────────────────────────│
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  Node.js Backend                         │
│                                                          │
│  /api/oo/templates/*    — Template CRUD (in-memory)     │
│  /api/oo/documents/*    — Document gen & mgmt           │
│  /api/oo/callback       — OnlyOffice save callback      │
│                                                          │
│  Storage:                                                │
│  ├── Metadata: In-memory Map (temporary)                │
│  ├── Files: AWS S3                                      │
│  └── Merge: docxtemplater + pizzip                      │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────┐           ┌──────────────────────────┐
│   AWS S3          │           │ ONLYOFFICE Server        │
│                   │           │ (NOT YET DEPLOYED)       │
│  /oo-templates/   │           │                          │
│  /oo-documents/   │           │ Configured via env var   │
└──────────────────┘           │ ONLYOFFICE_URL           │
                               └──────────────────────────┘
```

---

## In-Memory Data Structures

These replace database tables for Phase 1. They will be replaced with proper database queries in Phase 2.

```javascript
// Template metadata
{
  id: 1,
  name: "FRL Counter Letter",
  description: "Standard counter-response to Final Response Letters",
  category: "FRL Counter",
  s3Key: "oo-templates/1708300000-frl-counter-letter.docx",
  mergeFields: ["client_name", "lender_name", "loan_amount", ...],
  createdAt: "2024-02-19T10:00:00Z",
  updatedAt: "2024-02-19T10:00:00Z"
}

// Document metadata
{
  id: 1,
  caseId: 42,
  templateId: 1,
  name: "FRL Counter - John Smith - Vanquis Bank",
  s3KeyDocx: "oo-documents/42/1_v1708300000.docx",
  s3KeyPdf: null,
  status: "draft",           // draft | final | sent
  ooDocKey: "doc_1_v1708300000",
  createdAt: "2024-02-19T10:30:00Z",
  updatedAt: "2024-02-19T10:30:00Z"
}
```

**Important**: Data is lost on server restart. This is intentional for Phase 1 — we only need it to persist long enough to test the flows. S3 files persist regardless.

---

## API Endpoints

### Template CRUD

**GET /api/oo/templates**
- Returns: Array of all templates from in-memory store
- Supports: `?category=FRL Counter` query filter

**POST /api/oo/templates**
- Accepts: multipart form (file + name + description + category)
- Action: Upload DOCX to S3 at `oo-templates/{timestamp}-{name}.docx`, parse for merge fields, store metadata in memory
- Returns: Created template object

**GET /api/oo/templates/:id**
- Returns: Template metadata + presigned S3 download URL

**PUT /api/oo/templates/:id**
- Accepts: JSON body (name, description, category)
- Returns: Updated template object

**DELETE /api/oo/templates/:id**
- Removes from in-memory store (S3 file left intact)

### OnlyOffice Editor Integration

**GET /api/oo/templates/:id/editor-config**
- Returns: JWT-signed OnlyOffice editor configuration for editing this template
- The config includes presigned S3 URL for the DOCX file

**GET /api/oo/documents/:id/editor-config**
- Returns: JWT-signed OnlyOffice editor configuration for editing this document

**POST /api/oo/callback**
- Receives: OnlyOffice save callback payload `{ status, url, key }`
- Status 2 or 6: Download updated file from OO-provided URL, upload to S3, rotate document key
- All other statuses: No action
- **Must always return** `{ "error": 0 }`

### Document Generation & Management

**POST /api/oo/documents/generate**
- Accepts: `{ templateId, caseId, name?, mergeData? }`
- If `mergeData` provided: use it directly for merge
- If not: use mock case data for testing
- Action: Download template from S3, merge with docxtemplater, save result to S3
- Returns: Created document object

**GET /api/oo/documents**
- Returns: Array of documents
- Supports: `?caseId=42` query filter

**GET /api/oo/documents/:id**
- Returns: Document metadata

**GET /api/oo/documents/:id/download**
- Returns: `{ url: "presigned_s3_url" }`
- Supports: `?format=pdf` to download PDF version if available

**POST /api/oo/documents/:id/convert-pdf**
- Action: Download DOCX from S3, convert via existing LibreOffice helpers, upload PDF to S3
- Returns: Updated document object with s3KeyPdf populated

**PUT /api/oo/documents/:id/status**
- Accepts: `{ status: "draft" | "final" | "sent" }`
- Returns: Updated document object

**DELETE /api/oo/documents/:id**
- Removes from in-memory store

---

## Frontend Components

### OnlyOfficeEditor.tsx

Full-screen overlay editor component.

**States**:
1. **Loading** — Fetching editor config from backend
2. **Editor active** — OnlyOffice editor rendered in container div
3. **Fallback** — OnlyOffice server not reachable; shows message + download link

**Fallback UI** (shown when OO server is unavailable):
```
┌──────────────────────────────────────────────┐
│ ← Back          Document Title               │
├──────────────────────────────────────────────┤
│                                              │
│    ⚠️ Document Editor Not Connected          │
│                                              │
│    The OnlyOffice Document Server is not     │
│    available. You can still download and     │
│    edit this document locally.               │
│                                              │
│    [Download DOCX]   [Open in new tab]       │
│                                              │
└──────────────────────────────────────────────┘
```

### OOTemplateManager.tsx

Template management interface.

```
┌──────────────────────────────────────────────────────┐
│ Templates                          [Upload Template] │
├──────────────────────────────────────────────────────┤
│ 🔍 Search...              Category: [All ▼]         │
├──────┬──────────┬────────────┬──────────┬────────────┤
│ Name │ Category │ Fields     │ Modified │ Actions    │
├──────┼──────────┼────────────┼──────────┼────────────┤
│ FRL  │ FRL      │ 12 fields  │ 19 Feb   │ ✏️ 📄 🗑️   │
│ LOBA │ LOBA     │ 8 fields   │ 18 Feb   │ ✏️ 📄 🗑️   │
└──────┴──────────┴────────────┴──────────┴────────────┘

✏️ = Edit in OnlyOffice    📄 = Generate Document    🗑️ = Delete
```

### OODocumentList.tsx

Generated documents table.

```
┌────────────────────────────────────────────────────────────────┐
│ Generated Documents                                            │
├────────┬──────────┬────────┬──────────┬──────────┬─────────────┤
│ Name   │ Template │ Status │ Created  │ Modified │ Actions     │
├────────┼──────────┼────────┼──────────┼──────────┼─────────────┤
│ FRL -  │ FRL      │ 🟡 Dra │ 19 Feb   │ 19 Feb   │ ✏️ ⬇️ 📑 🗑️  │
│ Smith  │ Counter  │  ft    │          │          │             │
└────────┴──────────┴────────┴──────────┴──────────┴─────────────┘

✏️ = Open in editor   ⬇️ = Download DOCX   📑 = Convert to PDF   🗑️ = Delete
```

### MergeFieldPicker.tsx

Dropdown that copies merge field placeholders to clipboard.

```
┌─────────────────────┐
│ Insert Field ▼      │
├─────────────────────┤
│ ▸ Client            │
│   {{client_name}}   │
│   {{client_address}}│
│   {{client_email}}  │
│ ▸ Lender            │
│   {{lender_name}}   │
│   {{lender_ref}}    │
│ ▸ Loan              │
│ ▸ Affordability     │
│ ▸ Case              │
│ ▸ Firm              │
└─────────────────────┘
Click → copies to clipboard → toast: "Copied {{client_name}}"
```

### GenerateDocumentModal.tsx

Modal for generating a merged document.

```
┌──────────────────────────────────────┐
│ Generate Document              [✕]   │
├──────────────────────────────────────┤
│                                      │
│ Template: FRL Counter Letter         │
│                                      │
│ Case ID: [________]                  │
│                                      │
│ ☐ Use custom merge data             │
│ ┌──────────────────────────────────┐ │
│ │ { "client_name": "John Smith" } │ │
│ │                                  │ │
│ └──────────────────────────────────┘ │
│                                      │
│ [Cancel]              [Generate]     │
└──────────────────────────────────────┘
```

### Documents.tsx Modification

Add third tab only. Existing tabs untouched.

```
┌─────────────────┬─────────────────┬─────────────────┐
│ Document Files  │ Template Library│ Template Editor  │ ← NEW TAB
│ (existing)      │ (existing)      │ (OnlyOffice)    │
└─────────────────┴─────────────────┴─────────────────┘
```

---

## Merge Fields Reference

| Group | Fields |
|-------|--------|
| Client | client_name, client_address, client_email, client_phone, client_dob |
| Lender | lender_name, lender_address, lender_ref, lender_entity |
| Loan | loan_amount, loan_date, loan_type, interest_rate, monthly_repayment, total_repayable, loan_term |
| Affordability | dti_ratio, disposable_income, monthly_income, monthly_expenditure, total_debt |
| Case | case_ref, case_status, settlement_amount |
| Firm | firm_name, firm_trading_name, solicitor_name, firm_address, sra_number, firm_entity, company_number, today_date |

**Firm defaults** (hardcoded):
- firm_name: "Rowan Rose Solicitors"
- firm_trading_name: "Fast Action Claims"
- firm_address: "Boat Shed, Exchange Quay, Salford M5 3EQ"
- sra_number: "8000843"
- firm_entity: "Rowan Rose Ltd"
- company_number: "12916452"

---

## Environment Variables

```env
ONLYOFFICE_URL=https://docs.example.com           # Will be set when OO server is deployed
ONLYOFFICE_JWT_SECRET=change_this_to_strong_secret # Must match OO server config
ONLYOFFICE_CALLBACK_BASE_URL=https://crm.example.com  # Where OO server calls back
```

---

## Dependencies

```json
{
  "jsonwebtoken": "^9.x",
  "docxtemplater": "^3.x",
  "pizzip": "^3.x"
}
```

Existing dependencies already in use: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `multer`

---

## Phase 2 (Future — NOT part of this build)

1. Deploy OnlyOffice Document Server on Hostinger VPS (Docker behind Traefik)
2. Create `oo_templates` and `oo_documents` database tables
3. Replace in-memory Maps with database queries
4. Wire up real case data from existing cases table for merge fields
5. Point `ONLYOFFICE_URL` to live server
6. Build OnlyOffice plugin for merge field insertion (replacing clipboard approach)
7. Email integration — send generated PDFs to lenders directly

---

## What This Phase Does NOT Include

- ❌ Database tables or migrations
- ❌ Docker / deployment configuration
- ❌ OnlyOffice server setup
- ❌ Real case data lookup (uses mock data or request body)
- ❌ Changes to existing tabs or functionality
- ❌ OnlyOffice custom plugins
- ❌ Email sending
