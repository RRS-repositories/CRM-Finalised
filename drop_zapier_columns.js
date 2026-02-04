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

async function dropZapierColumns() {
    const client = await pool.connect();

    try {
        console.log('🗑️  Starting migration: Dropping unused Zapier columns...');

        // Start transaction
        await client.query('BEGIN');

        // Drop intake_via column if it exists
        console.log('Checking for intake_via column...');
        await client.query(`
      DO $$ 
      BEGIN 
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='contacts' AND column_name='intake_via'
        ) THEN
          ALTER TABLE contacts DROP COLUMN intake_via;
          RAISE NOTICE 'Dropped column: intake_via';
        ELSE
          RAISE NOTICE 'Column intake_via does not exist, skipping';
        END IF;
      END $$;
    `);

        // Drop zapier_processed column if it exists
        console.log('Checking for zapier_processed column...');
        await client.query(`
      DO $$ 
      BEGIN 
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='contacts' AND column_name='zapier_processed'
        ) THEN
          ALTER TABLE contacts DROP COLUMN zapier_processed;
          RAISE NOTICE 'Dropped column: zapier_processed';
        ELSE
          RAISE NOTICE 'Column zapier_processed does not exist, skipping';
        END IF;
      END $$;
    `);

        // Drop zapier_processed_at column if it exists
        console.log('Checking for zapier_processed_at column...');
        await client.query(`
      DO $$ 
      BEGIN 
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='contacts' AND column_name='zapier_processed_at'
        ) THEN
          ALTER TABLE contacts DROP COLUMN zapier_processed_at;
          RAISE NOTICE 'Dropped column: zapier_processed_at';
        ELSE
          RAISE NOTICE 'Column zapier_processed_at does not exist, skipping';
        END IF;
      END $$;
    `);

        // Commit transaction
        await client.query('COMMIT');

        console.log('✅ Migration completed successfully!');
        console.log('📊 Dropped columns: intake_via, zapier_processed, zapier_processed_at (if they existed)');

        process.exit(0);
    } catch (err) {
        // Rollback transaction on error
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', err);
        process.exit(1);
    } finally {
        client.release();
    }
}

dropZapierColumns();
