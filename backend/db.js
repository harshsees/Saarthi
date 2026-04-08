const mysql = require("mysql2");

/**
 * Robust Hostname Cleaning Logic
 * This handles cases where users copy the full URI (mysql://...), 
 * include the port, or have accidental leading/trailing spaces.
 */
function cleanHost(rawHost) {
  if (!rawHost) return "";
  
  let host = rawHost.trim();
  
  // 1. Handle full URIs (e.g. mysql://user:pass@host:port/db)
  try {
    if (host.includes("://")) {
      const url = new URL(host);
      host = url.hostname;
      console.log("🔗 Extracted hostname from URI:", host);
    } else if (host.includes("/")) {
      // Handle partial paths like "host/database"
      host = host.split("/")[0];
    }
  } catch (e) {
    // If URL parsing fails, continue with simple replacement
  }

  // 2. Handle host:port format (if not already handled by URL parser)
  if (host.includes(":")) {
    const parts = host.split(":");
    host = parts[0];
    console.log("📍 Stripped port from hostname:", host);
  }

  // 3. Aiven-specific fix for the ".d." segment
  // Some Aiven hostnames provided in the URI have an extra '.d.' which is for internal use.
  if (host.includes(".d.aivencloud.com")) {
    host = host.replace(".d.aivencloud.com", ".aivencloud.com");
    console.log("🛠️  Auto-fixed Aiven Hostname: Stripped '.d.' prefix ->", host);
  }

  return host;
}

const rawHost = process.env.DB_HOST || "";
const dbHost = cleanHost(rawHost);

// Use createPool for better production stability and auto-reconnection
const pool = mysql.createPool({
  host: dbHost,
  user: (process.env.DB_USER || "").trim(),
  password: (process.env.DB_PASSWORD || "").trim(),
  database: (process.env.DB_NAME || "").trim(),
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
    console.error("Attempted Host:", `[${dbHost}]`); // Using brackets to spot invisible spaces
    
    if (err.code === 'ENOTFOUND') {
      console.error("💡 TIP: DNS Lookup failed. This means the Hostname is invalid.");
      console.error("👉 ACTION: check your Aiven dashboard and ensure DB_HOST in Render exactly matches the 'Host' field.");
      if (rawHost.includes("mysql://")) {
        console.error("👉 NOTE: It looks like you pasted a full URI starting with 'mysql://'. We tried to extract the host, but please double-check.");
      }
    } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
      console.error("💡 TIP: Connection timed out or refused.");
      console.error("👉 ACTION: Make sure your Aiven 'IP Filter' includes '0.0.0.0/0' to allow Render to connect.");
    }
  } else {
    console.log("✅ MySQL Connected Success (via Pool to " + dbHost + ")");
    connection.release();
  }
});

// Export the pool 
module.exports = pool;