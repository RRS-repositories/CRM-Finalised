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
      VALUES ('info@fastactionclaims.co.uk', 'System Administrator', 'Fastactionclaims123!', 'Management', TRUE)
      ON CONFLICT (email) DO NOTHING;
    `);

    console.log('Database initialization complete!');
    process.exit(0);
  } catch (err) {
    console.error('Error initializing database:', err);
    process.exit(1);
  }
}

initDb();
