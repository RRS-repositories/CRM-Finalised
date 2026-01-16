# Running Guide: Rowan Rose Solicitors Integrated System

This guide provides steps to run the unified FastAction CRM and Client Intake application.

## Prerequisites
- **Node.js**: Ensure Node.js (v16+) is installed.
- **PostgreSQL**: Ensure your RDS or local database is accessible.
- **AWS Credentials**: Ensure your S3 bucket and credentials are set in `.env`.

---

## 1. Initial Setup
> [!IMPORTANT]
> All commands below MUST be run from within the `fastaction-crm` directory.

```powershell
cd "e:\Rowan Rose Solicitors\AWS\fastaction-crm"
npm install
```

## 2. Environment Variables
Verify that your `.env` file contains all necessary credentials from both projects. It should look something like this:

```env
DB_USER=...
DB_HOST=...
DB_NAME=...
DB_PASSWORD=...
DB_PORT=...

AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=...
S3_BUCKET_NAME=...

EMAIL_USER=...
EMAIL_PASS=...
```

## 3. Database Initialization
If this is the first time running the system, initialize the database tables:

```powershell
node init_db.js
```

## 4. Running the Application

You need to run both the **Backend Server** (for API & PDF generation) and the **Frontend** (Vite Dev Server).

### Step A: Start the Backend Server
Open a terminal and run:

```powershell
npm run server
```
*The server will start on `http://localhost:5000`.*

### Step B: Start the Frontend
Open **another** terminal and run:

```powershell
npm run dev
```
*The application will be accessible at `http://localhost:5173` (or the port shown in the terminal).*

---

## 5. Using the System
- **CRM Dashboard**: Login at `/` using your agent credentials.
- **Client Intake Form**: 
  - Go to **Settings** in the CRM sidebar.
  - Click the **Open Client Intake Form** button.
  - This will navigate you to the live intake flow within the same app.
- **Verification**: 
  - Fill out the form as a client.
  - Check the **Contacts** list in the CRM; the new lead should appear instantly with the source "Client Filled".
  - S3 will automatically contain the generated **Terms.pdf** and uploaded documents.
