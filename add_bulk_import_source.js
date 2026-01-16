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

async function addBulkImportSource() {
  try {
    console.log('Connecting to RDS...');

    // Add 'Bulk Import' to contact_source enum
    console.log('Adding Bulk Import to contact_source enum...');

    await pool.query(`
      ALTER TYPE contact_source ADD VALUE IF NOT EXISTS 'Bulk Import';
    `);

    console.log('Successfully added "Bulk Import" to contact_source enum!');

    // Also add other useful source values
    const additionalSources = ['Website', 'Referral', 'AI Import'];
    for (const source of additionalSources) {
      try {
        await pool.query(`ALTER TYPE contact_source ADD VALUE IF NOT EXISTS '${source}';`);
        console.log(`Added "${source}" to contact_source enum`);
      } catch (e) {
        // Value might already exist
        console.log(`"${source}" already exists or could not be added`);
      }
    }

    console.log('Migration complete!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);

    // If the enum value already exists, that's fine
    if (err.message.includes('already exists')) {
      console.log('Enum value already exists - no action needed');
      process.exit(0);
    }

    process.exit(1);
  }
}

addBulkImportSource();
