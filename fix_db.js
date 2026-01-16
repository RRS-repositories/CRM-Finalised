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
    ssl: {
        rejectUnauthorized: false
    }
});

async function fixDb() {
    try {
        console.log('Checking and fixing contacts table columns...');

        const alterQueries = [
            'ALTER TABLE contacts ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)',
            'ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)',
            'ALTER TABLE contacts ADD COLUMN IF NOT EXISTS full_name VARCHAR(200)',
            'ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email VARCHAR(255)',
            'ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone VARCHAR(50)',
            'ALTER TABLE contacts ADD COLUMN IF NOT EXISTS dob DATE',
            'ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address_line_1 TEXT',
            'ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address_line_2 TEXT',
            'ALTER TABLE contacts ADD COLUMN IF NOT EXISTS city VARCHAR(100)',
            'ALTER TABLE contacts ADD COLUMN IF NOT EXISTS state_county VARCHAR(100)',
            'ALTER TABLE contacts ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20)',
            'ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source VARCHAR(50)',
            'ALTER TABLE contacts ADD COLUMN IF NOT EXISTS signature_url TEXT'
        ];

        for (const query of alterQueries) {
            try {
                await pool.query(query);
                console.log(`Executed: ${query}`);
            } catch (e) {
                console.warn(`Failed or already exists: ${query}`, e.message);
            }
        }

        console.log('Database fix complete!');
        process.exit(0);
    } catch (err) {
        console.error('Error fixing database:', err);
        process.exit(1);
    }
}

fixDb();
