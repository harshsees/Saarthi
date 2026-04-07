const mysql = require("mysql2");

// Use createPool for better production stability and auto-reconnection
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 14118,
  ssl: {
    rejectUnauthorized: false
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test the pool connection on startup
pool.getConnection((err, connection) => {
  if (err) {
    console.error("❌ MySQL Pool Connection Failed!");
    console.error("Error Code:", err.code);
    console.error("Hostname:", process.env.DB_HOST);
    if (err.code === 'ENOTFOUND') {
      console.error("💡 TIP: The hostname is not resolving. Check your Aiven dashboard for the correct 'Host' name and ensure it's copied correctly into Render environment variables.");
    }
  } else {
    console.log("✅ MySQL Connected (via Pool)");
    connection.release();
  }
});

// Export the pool
module.exports = pool;