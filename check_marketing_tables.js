import pool from './db.js';

async function checkTables() {
    try {
        const potentialTables = [
            'platform_accounts', 'campaigns', 'ad_sets', 'creatives', 'ads',
            'daily_metrics', 'hourly_metrics', 'ad_leads', 'ai_reports',
            'marketing_conversations', 'marketing_messages'
        ];

        const res = await pool.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)",
            [potentialTables]
        );

        const foundTables = res.rows.map(r => r.table_name);
        console.log('Tables found:', foundTables.length);
        console.log('Found:', foundTables.join(', '));

        const missing = potentialTables.filter(t => !foundTables.includes(t));
        if (missing.length > 0) {
            console.log('Missing:', missing.join(', '));
        } else {
            console.log('All core marketing tables found.');
        }

        process.exit(0);
    } catch (err) {
        console.error('Error checking tables:', err);
        process.exit(1);
    }
}

checkTables();
