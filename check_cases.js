import pool from './db.js';

async function checkCases() {
    try {
        const res = await pool.query("SELECT status, count(*) FROM cases GROUP BY status");
        console.log('Case status counts:');
        console.log(JSON.stringify(res.rows, null, 2));

        const pra = await pool.query("SELECT id, lender, status FROM cases WHERE lender ILIKE '%PRA%' LIMIT 5");
        console.log('Recent PRA-related cases:');
        console.log(JSON.stringify(pra.rows, null, 2));

        process.exit(0);
    } catch (err) {
        console.error('Error checking cases:', err);
        process.exit(1);
    }
}

checkCases();
