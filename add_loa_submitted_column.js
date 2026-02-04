// Add loa_submitted column to contacts table
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }
});

async function addLOASubmittedColumn() {
    try {
        console.log('Adding loa_submitted column to contacts table...');

        // Add loa_submitted column if it doesn't exist
        await pool.query(`
            ALTER TABLE contacts 
            ADD COLUMN IF NOT EXISTS loa_submitted BOOLEAN DEFAULT false
        `);

        console.log('✅ Successfully added loa_submitted column');
        process.exit(0);
    } catch (error) {
        console.error('Error adding column:', error);
        process.exit(1);
    }
}

addLOASubmittedColumn();
