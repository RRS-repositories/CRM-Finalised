import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  // Only use SSL if DB_SSL is set to 'true' in .env
  ssl: process.env.DB_SSL === 'true' ? {
    rejectUnauthorized: false
  } : false
});

async function initDb() {
  try {
    console.log('Connecting to RDS...');

    // Create Source Enum if it doesn't exist
    // Using a check because DO $$ ... $$ can be used for Postgres
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_source') THEN
          CREATE TYPE contact_source AS ENUM ('Client Filled', 'Manual Input', 'Website', 'Referral', 'AI Import', 'Bulk Import');
        END IF;
      END
      $$;
    `);

    // Add new enum values if they don't exist (for existing databases)
    await pool.query(`
      DO $$
      BEGIN
        ALTER TYPE contact_source ADD VALUE IF NOT EXISTS 'Website';
        ALTER TYPE contact_source ADD VALUE IF NOT EXISTS 'Referral';
        ALTER TYPE contact_source ADD VALUE IF NOT EXISTS 'AI Import';
        ALTER TYPE contact_source ADD VALUE IF NOT EXISTS 'Bulk Import';
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    // Create Contacts Table
    console.log('Creating contacts table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        full_name VARCHAR(200),
        email VARCHAR(255),
        phone VARCHAR(50),
        dob DATE,
        address_line_1 TEXT,
        address_line_2 TEXT,
        city VARCHAR(100),
        state_county VARCHAR(100),
        postal_code VARCHAR(20),
        previous_address TEXT,
        lived_less_than_3_years BOOLEAN,
        signature_url TEXT,
        source contact_source DEFAULT 'Manual Input',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create Cases Table
    console.log('Creating cases table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cases (
        id SERIAL PRIMARY KEY,
        contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
        case_number VARCHAR(100),
        lender VARCHAR(100),
        status VARCHAR(100),
        claim_value DECIMAL(10, 2),
        product_type VARCHAR(100),
        account_number VARCHAR(100),
        start_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create Documents Table
    console.log('Creating documents table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50),
        category VARCHAR(100),
        url TEXT NOT NULL,
        size VARCHAR(50),
        version INTEGER DEFAULT 1,
        tags TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create user_role ENUM if it doesn't exist
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
          CREATE TYPE user_role AS ENUM ('Management', 'IT', 'Payments', 'Admin', 'Sales');
        END IF;
      END
      $$;
    `);

    // Create Users Table
    console.log('Creating users table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        full_name VARCHAR(200) NOT NULL,
        password TEXT NOT NULL,
        role user_role DEFAULT 'Sales',
        is_approved BOOLEAN DEFAULT FALSE,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed initial admin user
    console.log('Seeding admin user...');
    await pool.query(`
      INSERT INTO users (email, full_name, password, role, is_approved)
      VALUES ('info@fastactionclaims.co.uk', 'System Administrator', 'Fastactionclaims123', 'Management', TRUE)
      ON CONFLICT (email) DO UPDATE SET password = 'Fastactionclaims123', is_approved = TRUE;
    `);

    // ============================================
    // Rowan Rose Solicitors CRM Specification Schema
    // ============================================

    // Add bank details columns to contacts table
    console.log('Adding bank details columns to contacts...');
    await pool.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100);
    `);
    await pool.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS account_name VARCHAR(100);
    `);
    await pool.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sort_code VARCHAR(8);
    `);
    await pool.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(8);
    `);

    // Add previous address columns to contacts table
    console.log('Adding previous address columns to contacts...');
    await pool.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS previous_address_line_1 TEXT;
    `);
    await pool.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS previous_address_line_2 TEXT;
    `);
    await pool.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS previous_city VARCHAR(100);
    `);
    await pool.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS previous_county VARCHAR(100);
    `);
    await pool.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS previous_postal_code VARCHAR(20);
    `);

    // Add client_id column (RR-contactId format)
    console.log('Adding client_id column to contacts...');
    await pool.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS client_id VARCHAR(20);
    `);

    // Add unique form link column for lender selection form
    console.log('Adding unique_form_link column to contacts...');
    await pool.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS unique_form_link TEXT;
    `);

    // Add second signature URL column
    console.log('Adding signature_2_url column to contacts...');
    await pool.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS signature_2_url TEXT;
    `);

    // Add extra_lenders column for storing additional lenders as free text
    console.log('Adding extra_lenders column to contacts...');
    await pool.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS extra_lenders TEXT;
    `);

    // Add LOA additional questions columns
    console.log('Adding LOA additional question columns to contacts...');
    await pool.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS had_ccj BOOLEAN DEFAULT false;
    `);
    await pool.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS victim_of_scam BOOLEAN DEFAULT false;
    `);
    await pool.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS problematic_gambling BOOLEAN DEFAULT false;
    `);
    await pool.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS betting_companies TEXT;
    `);

    // Add ip_address column - client IP when signature form was signed
    console.log('Adding ip_address column to contacts...');
    await pool.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);
    `);

    // Add questionnaire columns
    console.log('Adding questionnaire columns to contacts...');
    await pool.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS questionnaire_data JSONB;
    `);
    await pool.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS questionnaire_submitted BOOLEAN DEFAULT false;
    `);
    await pool.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS signature_questionnaire_url TEXT;
    `);

    // Add extended claim fields to cases table
    console.log('Adding extended claim fields to cases...');
    await pool.query(`
      ALTER TABLE cases ADD COLUMN IF NOT EXISTS lender_other VARCHAR(100);
    `);
    await pool.query(`
      ALTER TABLE cases ADD COLUMN IF NOT EXISTS finance_type VARCHAR(100);
    `);
    await pool.query(`
      ALTER TABLE cases ADD COLUMN IF NOT EXISTS finance_type_other VARCHAR(100);
    `);
    await pool.query(`
      ALTER TABLE cases ADD COLUMN IF NOT EXISTS number_of_loans INTEGER;
    `);
    await pool.query(`
      ALTER TABLE cases ADD COLUMN IF NOT EXISTS lender_reference VARCHAR(100);
    `);
    await pool.query(`
      ALTER TABLE cases ADD COLUMN IF NOT EXISTS dates_timeline TEXT;
    `);
    await pool.query(`
      ALTER TABLE cases ADD COLUMN IF NOT EXISTS apr DECIMAL(5, 2);
    `);
    await pool.query(`
      ALTER TABLE cases ADD COLUMN IF NOT EXISTS outstanding_balance DECIMAL(10, 2);
    `);
    await pool.query(`
      ALTER TABLE cases ADD COLUMN IF NOT EXISTS dsar_review TEXT;
    `);
    await pool.query(`
      ALTER TABLE cases ADD COLUMN IF NOT EXISTS complaint_paragraph TEXT;
    `);
    await pool.query(`
      ALTER TABLE cases ADD COLUMN IF NOT EXISTS offer_made DECIMAL(10, 2);
    `);
    await pool.query(`
      ALTER TABLE cases ADD COLUMN IF NOT EXISTS late_payment_charges DECIMAL(10, 2);
    `);
    await pool.query(`
      ALTER TABLE cases ADD COLUMN IF NOT EXISTS billed_finance_charges DECIMAL(10, 2);
    `);
    await pool.query(`
      ALTER TABLE cases ADD COLUMN IF NOT EXISTS total_refund DECIMAL(10, 2);
    `);
    await pool.query(`
      ALTER TABLE cases ADD COLUMN IF NOT EXISTS total_debt DECIMAL(10, 2);
    `);
    await pool.query(`
      ALTER TABLE cases ADD COLUMN IF NOT EXISTS client_fee DECIMAL(10, 2);
    `);
    await pool.query(`
      ALTER TABLE cases ADD COLUMN IF NOT EXISTS our_total_fee DECIMAL(10, 2);
    `);
    await pool.query(`
      ALTER TABLE cases ADD COLUMN IF NOT EXISTS fee_without_vat DECIMAL(10, 2);
    `);
    await pool.query(`
      ALTER TABLE cases ADD COLUMN IF NOT EXISTS vat DECIMAL(10, 2);
    `);
    await pool.query(`
      ALTER TABLE cases ADD COLUMN IF NOT EXISTS our_fee_net DECIMAL(10, 2);
    `);
    await pool.query(`
      ALTER TABLE cases ADD COLUMN IF NOT EXISTS spec_status VARCHAR(50);
    `);

    // Create Communications Table
    console.log('Creating communications table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS communications (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
        channel VARCHAR(20) NOT NULL,
        direction VARCHAR(10) NOT NULL,
        subject VARCHAR(255),
        content TEXT,
        call_duration_seconds INTEGER,
        call_notes TEXT,
        agent_id VARCHAR(50),
        agent_name VARCHAR(100),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        read BOOLEAN DEFAULT FALSE
      );
    `);

    // Create Workflow Triggers Table
    console.log('Creating workflow_triggers table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS workflow_triggers (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
        workflow_type VARCHAR(50) NOT NULL,
        workflow_name VARCHAR(100),
        triggered_by VARCHAR(50),
        triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'active',
        current_step INTEGER DEFAULT 1,
        total_steps INTEGER DEFAULT 4,
        next_action_at TIMESTAMP,
        next_action_description TEXT,
        completed_at TIMESTAMP,
        cancelled_at TIMESTAMP,
        cancelled_by VARCHAR(50)
      );
    `);

    // Create Previous Addresses Table
    console.log('Creating previous_addresses table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS previous_addresses (
        id SERIAL PRIMARY KEY,
        contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
        address_line_1 TEXT,
        address_line_2 TEXT,
        city VARCHAR(100),
        county VARCHAR(100),
        postal_code VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create Notes Table
    console.log('Creating notes table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        pinned BOOLEAN DEFAULT FALSE,
        created_by VARCHAR(50),
        created_by_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by VARCHAR(50),
        updated_at TIMESTAMP
      );
    `);

    // Create Action Logs Table
    console.log('Creating action_logs table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS action_logs (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
        claim_id INTEGER,
        actor_type VARCHAR(20) NOT NULL,
        actor_id VARCHAR(50),
        actor_name VARCHAR(100),
        action_type VARCHAR(50) NOT NULL,
        action_category VARCHAR(50),
        description TEXT,
        metadata JSONB,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ip_address VARCHAR(45),
        user_agent TEXT
      );
    `);

    // Create indexes for better query performance
    console.log('Creating indexes...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_communications_client_id ON communications(client_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_communications_timestamp ON communications(timestamp);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_triggers_client_id ON workflow_triggers(client_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_triggers_status ON workflow_triggers(status);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notes_client_id ON notes(client_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_action_logs_client_id ON action_logs(client_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_action_logs_timestamp ON action_logs(timestamp);
    `);

    // ============================================
    // OnlyOffice Templates Table (Persistent Storage)
    // ============================================
    console.log('Creating oo_templates table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS oo_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100) DEFAULT 'General',
        s3_key TEXT NOT NULL,
        file_name VARCHAR(255),
        file_size INTEGER,
        variable_fields JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT TRUE,
        template_type VARCHAR(50) DEFAULT 'DOCX',
        use_for_loa BOOLEAN DEFAULT FALSE,
        use_for_cover_letter BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_oo_templates_category ON oo_templates(category);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_oo_templates_active ON oo_templates(is_active) WHERE is_active = TRUE;
    `);

    // Critical indexes for contact-related queries (performance optimization)
    console.log('Creating performance indexes for contacts...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cases_contact_id ON cases(contact_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_contact_id ON documents(contact_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_previous_addresses_contact_id ON previous_addresses(contact_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_contacts_updated_at ON contacts(updated_at DESC);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases(created_at DESC);
    `);

    console.log('Database initialization complete!');
    process.exit(0);
  } catch (err) {
    console.error('Error initializing database:', err);
    process.exit(1);
  }
}

initDb();
