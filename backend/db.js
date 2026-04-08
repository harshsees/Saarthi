const mysql = require("mysql2");

// Aiven Hostname Fix: Sometimes hostnames are copied with an extra ".d." which causes ENOTFOUND.
// We strip it automatically to prevent DNS errors.
let dbHost = process.env.DB_HOST || "";
if (dbHost.includes(".d.aivencloud.com")) {
  dbHost = dbHost.replace(".d.aivencloud.com", ".aivencloud.com");
  console.log("🛠️  Auto-fixing Aiven Hostname: Stripping '.d.' prefix.");
}

// Use createPool for better production stability and auto-reconnection
const pool = mysql.createPool({
  host: dbHost,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT) || 14118,
  ssl: {
    rejectUnauthorized: false
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000 // 10s timeout
});

// Test the pool connection on startup
pool.getConnection((err, connection) => {
  if (err) {
    console.error("❌ MySQL Pool Connection Failed!");
    console.error("Error Code:", err.code);
    console.error("Attempted Host:", dbHost);
    
    if (err.code === 'ENOTFOUND') {
      console.error("💡 TIP: Still DNS issues. Please verify the Host in your Aiven dashboard.");
    } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
      console.error("💡 TIP: Connection timed out. Make sure your Aiven 'IP Filter' is set to '0.0.0.0/0' to allow Render to connect.");
    }
  } else {
    console.log("✅ MySQL Connected Success (via Pool to " + dbHost + ")");
    connection.release();
  }
});

// Export the pool 
module.exports = pool;