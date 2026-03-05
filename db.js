import dotenv from 'dotenv';
dotenv.config();

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: {
        require: true,
        rejectUnauthorized: false
    }
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

export default pool;
