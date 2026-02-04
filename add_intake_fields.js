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
    ssl: process.env.DB_SSL === 'true' ? {
        rejectUnauthorized: false
    } : false
});

async function migrate() {
    try {
        console.log('🔄 Starting migration: add_intake_fields...');

        // Add intake_lender field to contacts table
        console.log('📝 Adding intake_lender column to contacts table...');
        await pool.query(`
      ALTER TABLE contacts 
      ADD COLUMN IF NOT EXISTS intake_lender VARCHAR(50);
    `);

        // Add comment for clarity
        await pool.query(`
      COMMENT ON COLUMN contacts.intake_lender IS 'Tracks which intake form was used: VANQUIS, LOANS2GO, or GAMBLING';
    `);

        // Create submission_tokens table
        console.log('📝 Creating submission_tokens table...');
        await pool.query(`
      CREATE TABLE IF NOT EXISTS submission_tokens (
        id SERIAL PRIMARY KEY,
        token UUID UNIQUE NOT NULL,
        contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
        lender VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        used_at TIMESTAMP,
        is_used BOOLEAN DEFAULT FALSE,
        expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days')
      );
    `);

        // Create indexes for submission_tokens
        console.log('📝 Creating indexes for submission_tokens...');
        await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_submission_tokens_token ON submission_tokens(token);
    `);
        await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_submission_tokens_contact ON submission_tokens(contact_id);
    `);
        await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_submission_tokens_used ON submission_tokens(is_used);
    `);

        // Add performance indexes
        console.log('📝 Adding performance indexes...');
        await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_contacts_intake_lender ON contacts(intake_lender);
    `);
        await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_contacts_source ON contacts(source);
    `);
        await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cases_contact_id ON cases(contact_id);
    `);
        await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cases_lender ON cases(lender);
    `);
        await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
    `);

        console.log('✅ Migration completed successfully!');
        console.log('\nSummary:');
        console.log('  - Added intake_lender column to contacts table');
        console.log('  - Created submission_tokens table with CASCADE delete');
        console.log('  - Created 8 indexes for better query performance');

        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

migrate();
