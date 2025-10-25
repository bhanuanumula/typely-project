import pkg from 'pg';
const { Pool } = pkg;

export const pool = new Pool({
  user: 'postgres',          // replace with your PostgreSQL username
  host: 'localhost',         
  database: 'world',        // replace with your database name
  password: 'admin',    // replace with your database password
  port: 5432
});
