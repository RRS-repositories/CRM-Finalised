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

async function fixSourceColumn() {
  try {
    console.log('Connecting to RDS...');

    // Change the source column from enum to VARCHAR
    // This allows any value to be stored
    console.log('Converting source column from enum to VARCHAR...');

    await pool.query(`
      ALTER TABLE contacts
      ALTER COLUMN source TYPE VARCHAR(100)
      USING source::text;
    `);

    console.log('Successfully converted source column to VARCHAR!');
    console.log('You can now use any source value including "Bulk Import"');

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);

    // If already VARCHAR, that's fine
    if (err.message.includes('already') || err.message.includes('cannot be cast')) {
      console.log('Column may already be VARCHAR or needs different handling');
    }

    process.exit(1);
  }
}

fixSourceColumn();
