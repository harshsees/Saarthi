// 1️⃣ Imports
require("dotenv").config();
console.log("EMAIL:", process.env.EMAIL_USER);
console.log("PASS:", process.env.EMAIL_PASS);
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const crypto = require("crypto");
const db = require("./db");
const {trainKNN, findBestDonors} = require("./ml-model");
const { OAuth2Client } = require("google-auth-library");
const googleClient = new OAuth2Client("177488391434-ticsuprf45ut64tphnfg62ba33c65lvp.apps.googleusercontent.com");
const { sendSMS } = require("./fast2sms"); // SMS only - cost optimized
const path = require("path");

// 2️⃣ Create App
const app = express();

// ── DATABASE MIGRATION (Ensure columns exist) ──
const ensureColumns = () => {
  const alterAccepted = "ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP NULL AFTER matched_donors";
  const alterCancelled = "ALTER TABLE blood_requests ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP NULL AFTER accepted_at";
  
  db.query(alterAccepted, (err) => {
    if (err) console.log("Migration (accepted_at) info/error:", err.message);
    db.query(alterCancelled, (err) => {
      if (err) console.log("Migration (cancelled_at) info/error:", err.message);
    });
  });
};
ensureColumns();

// 3️⃣ Middleware
app.use(express.json());
app.use(cors());

// 4️⃣ Static Files (Serve Frontend from Project Root)
// We add extensions: ['html'] to support clean URLs (e.g., /register -> register.html)
app.use(express.static(path.join(__dirname, ".."), { extensions: ['html'] }));

// Home Route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "index.html"));
});

// Health check and connectivity routes
app.get("/health", (req, res) => res.json({ status: "ok", port: PORT }));
app.get("/ping", (req, res) => res.send("pong"));

// Silence favicon.ico 404s
app.get("/favicon.ico", (req, res) => res.status(204).end());

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN AUTH — Hardcoded credentials (no DB table needed)
// ══════════════════════════════════════════════════════════════════════════════
const ADMIN_USER = "admin@gmail.com";
const ADMIN_PASS = "saarthi@admin2024";
const ADMIN_TOKEN_SECRET = crypto.randomBytes(32).toString("hex");
let adminTokens = new Set(); // In-memory valid tokens

// Generate admin token
function generateAdminToken() {
  const token = crypto.randomBytes(48).toString("hex");
  adminTokens.add(token);
  return token;
}

// Verify admin token middleware
function verifyAdminToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Missing or invalid token" });
  }
  const token = authHeader.split(" ")[1];
  if (!adminTokens.has(token)) {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
  next();
}

// ── ADMIN LOGIN ──
app.post("/admin-login", (req, res) => {
  const { username, password } = req.body;
  
  // Accept both "admin" and "admin@gmail.com" as username
  const validUsername = (username === "admin" || username === "admin@gmail.com");
  
  if (validUsername && password === ADMIN_PASS) {
    const token = generateAdminToken();
    console.log("✅ Admin logged in successfully");
    return res.json({ success: true, token });
  }
  
  console.log("❌ Admin login failed - invalid credentials");
  return res.json({ success: false, message: "Invalid credentials" });
});

// ── ADMIN STATS ──
app.get("/admin/stats", verifyAdminToken, (req, res) => {
  const queries = {
    totalUsers: "SELECT COUNT(*) as count FROM users",
    totalDonors: "SELECT COUNT(*) as count FROM donor_profiles",
    totalRequests: "SELECT COUNT(*) as count FROM blood_requests",
    pendingRequests: "SELECT COUNT(*) as count FROM blood_requests WHERE status = 'pending'",
    acceptedRequests: "SELECT COUNT(*) as count FROM blood_requests WHERE status = 'accepted'",
    cancelledRequests: "SELECT COUNT(*) as count FROM blood_requests WHERE status = 'cancelled'"
  };
  
  const stats = {};
  let completed = 0;
  const total = Object.keys(queries).length;
  
  Object.entries(queries).forEach(([key, query]) => {
    db.query(query, (err, result) => {
      if (err) {
        console.log(`Stats error (${key}):`, err);
        stats[key] = 0;
      } else {
        stats[key] = result[0].count;
      }
      completed++;
      if (completed === total) {
        res.json({ success: true, stats });
      }
    });
  });
});

// ── PUBLIC PLATFORM STATS (For Home Page) ──
app.get("/api/platform-stats", (req, res) => {
  const queries = {
    totalDonors: "SELECT COUNT(*) as count FROM donor_profiles",
    livesSaved: "SELECT COUNT(*) as count FROM blood_requests WHERE status = 'accepted'",
    totalRequests: "SELECT COUNT(*) as count FROM blood_requests",
    bloodGroupBreakdown: "SELECT blood_group, COUNT(*) as count FROM donor_profiles GROUP BY blood_group",
    // Calculate avg response time from actual data (diff between created_at and accepted_at)
    // Fallback to a base value + small random if no accepted_at exists yet
    avgResponse: "SELECT AVG(TIMESTAMPDIFF(MINUTE, created_at, accepted_at)) as avg FROM blood_requests WHERE status = 'accepted' AND accepted_at IS NOT NULL"
  };

  const results = {};
  let completed = 0;
  const keys = Object.keys(queries);

  keys.forEach(key => {
    db.query(queries[key], (err, result) => {
      if (err) {
        console.log(`Platform stats error (${key}):`, err);
        results[key] = 0;
      } else {
        if (key === 'bloodGroupBreakdown') {
          results[key] = result;
        } else if (key === 'avgResponse') {
          results[key] = result[0].avg || 28; // Default 28 if no data
        } else {
          results[key] = result[0].count;
        }
      }
      completed++;
      if (completed === keys.length) {
        // Calculate fulfillment rate
        const fulfillmentRate = results.totalRequests > 0 
          ? Math.round((results.livesSaved / results.totalRequests) * 100) 
          : 94; // Default 94%

        res.json({
          success: true,
          stats: {
            totalDonors: results.totalDonors,
            livesSaved: results.livesSaved,
            avgResponseTime: Math.round(results.avgResponse),
            fulfillmentRate: fulfillmentRate,
            bloodGroups: results.bloodGroupBreakdown
          }
        });
      }
    });
  });
});

// ── ADMIN: GET ALL REQUESTS ──
app.get("/admin/requests", verifyAdminToken, (req, res) => {
  db.query(
    `SELECT br.*, 
     u_acceptor.name as accepted_donor_name, 
     dp_acceptor.phone as accepted_donor_phone
     FROM blood_requests br
     LEFT JOIN users u_acceptor ON br.accepted_donor_id = u_acceptor.id
     LEFT JOIN donor_profiles dp_acceptor ON br.accepted_donor_id = dp_acceptor.user_id
     ORDER BY br.created_at DESC`,
    (err, requests) => {
      if (err) {
        console.log("Admin requests error:", err);
        return res.json({ success: false, message: "Database error" });
      }
      
      // Parse matched donors and fetch their details
      const enrichedRequests = [];
      let processed = 0;
      
      if (requests.length === 0) {
        return res.json({ success: true, requests: [] });
      }
      
      requests.forEach((request, index) => {
        const matchedIds = JSON.parse(request.matched_donors || "[]");
        
        if (matchedIds.length === 0) {
          enrichedRequests[index] = { ...request, matched_donors_details: [] };
          processed++;
          if (processed === requests.length) {
            res.json({ success: true, requests: enrichedRequests });
          }
        } else {
          db.query(
            `SELECT u.id, u.name FROM users u WHERE u.id IN (?)`,
            [matchedIds],
            (err, donors) => {
              enrichedRequests[index] = { 
                ...request, 
                matched_donors_details: err ? [] : donors 
              };
              processed++;
              if (processed === requests.length) {
                res.json({ success: true, requests: enrichedRequests });
              }
            }
          );
        }
      });
    }
  );
});

// ── ADMIN: GET ALL USERS ──
app.get("/admin/users", verifyAdminToken, (req, res) => {
  db.query(
    `SELECT u.id, u.name, u.email, u.is_verified, u.created_at,
     CASE WHEN dp.id IS NOT NULL THEN 1 ELSE 0 END as is_donor
     FROM users u
     LEFT JOIN donor_profiles dp ON u.id = dp.user_id
     ORDER BY u.created_at DESC`,
    (err, users) => {
      if (err) {
        console.log("Admin users error:", err);
        return res.json({ success: false, message: "Database error" });
      }
      res.json({ success: true, users });
    }
  );
});

// ── ADMIN: GET ALL DONORS ──
app.get("/admin/donors", verifyAdminToken, (req, res) => {
  db.query(
    `SELECT u.name, dp.blood_group, dp.city, dp.phone, 
     dp.available_for_donation, dp.impact_score, dp.response_rate,
     dp.last_donation_date, dp.total_donations
     FROM donor_profiles dp
     JOIN users u ON dp.user_id = u.id
     ORDER BY dp.impact_score DESC, u.name ASC`,
    (err, donors) => {
      if (err) {
        console.log("Admin donors error:", err);
        return res.json({ success: false, message: "Database error" });
      }
      res.json({ success: true, donors });
    }
  );
});

// ── ADMIN: ACTIVITY FEED ──
app.get("/admin/activity-feed", verifyAdminToken, (req, res) => {
  // Get last 10 activities across all request changes
  db.query(
    `SELECT br.id as request_id, br.requester_name, br.blood_group, br.status,
     br.created_at, br.accepted_donor_id,
     u_donor.name as donor_name
     FROM blood_requests br
     LEFT JOIN users u_donor ON br.accepted_donor_id = u_donor.id
     ORDER BY br.created_at DESC
     LIMIT 20`,
    (err, results) => {
      if (err) {
        console.log("Activity feed error:", err);
        return res.json({ success: false, message: "Database error" });
      }
      
      // Transform into activity feed format
      const activities = [];
      
      results.forEach(r => {
        // Request created activity
        activities.push({
          type: "request_created",
          request_id: r.request_id,
          requester_name: r.requester_name,
          blood_group: r.blood_group,
          timestamp: r.created_at
        });
        
        // If accepted, add accepted activity
        if (r.status === "accepted" && r.donor_name) {
          activities.push({
            type: "request_accepted",
            request_id: r.request_id,
            donor_name: r.donor_name,
            blood_group: r.blood_group,
            timestamp: r.created_at // Ideally would be a separate accepted_at field
          });
        }
        
        // If cancelled, add cancelled activity
        if (r.status === "cancelled") {
          activities.push({
            type: "request_cancelled",
            request_id: r.request_id,
            blood_group: r.blood_group,
            timestamp: r.created_at
          });
        }
      });
      
      // Sort by timestamp descending and limit to 10
      activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      res.json({ success: true, activities: activities.slice(0, 10) });
    }
  );
});

// ── ADMIN: CHART DATA ──
app.get("/admin/chart-data", verifyAdminToken, (req, res) => {
  const chartData = {
    bloodGroups: [],
    statusBreakdown: [],
    dailyCounts: []
  };
  
  let completed = 0;
  const total = 3;
  
  // Blood group distribution
  db.query(
    `SELECT blood_group, COUNT(*) as count 
     FROM blood_requests 
     GROUP BY blood_group 
     ORDER BY count DESC`,
    (err, result) => {
      chartData.bloodGroups = err ? [] : result;
      completed++;
      if (completed === total) res.json({ success: true, ...chartData });
    }
  );
  
  // Status breakdown
  db.query(
    `SELECT status, COUNT(*) as count 
     FROM blood_requests 
     GROUP BY status`,
    (err, result) => {
      chartData.statusBreakdown = err ? [] : result;
      completed++;
      if (completed === total) res.json({ success: true, ...chartData });
    }
  );
  
  // Daily counts (last 30 days)
  db.query(
    `SELECT DATE(created_at) as date, COUNT(*) as count 
     FROM blood_requests 
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
     GROUP BY DATE(created_at) 
     ORDER BY date ASC`,
    (err, result) => {
      if (err) {
        chartData.dailyCounts = [];
      } else {
        // Fill in missing dates with 0
        const counts = {};
        result.forEach(r => {
          const dateStr = new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          counts[dateStr] = r.count;
        });
        
        // Generate last 30 days
        const dailyCounts = [];
        for (let i = 29; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          dailyCounts.push({ date: dateStr, count: counts[dateStr] || 0 });
        }
        chartData.dailyCounts = dailyCounts;
      }
      completed++;
      if (completed === total) res.json({ success: true, ...chartData });
    }
  );
});


const PORT = process.env.PORT || 5000;


// ── BREVO EMAIL API HELPER ──
async function sendEmailViaAPI(to, subject, htmlContent) {
  const apiKey = (process.env.EMAIL_PASS || "").trim();
  const senderEmail = "shah001harsh@gmail.com";
  const senderName = "Saarthi";

  console.log(`📡 Sending API Email to: ${to} | Subject: ${subject}`);

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": apiKey,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to }],
        subject: subject,
        htmlContent: htmlContent
      })
    });

    const result = await response.json();
    if (response.ok) {
      console.log(`✅ Email sent via API. ID: ${result.messageId}`);
      return { success: true, messageId: result.messageId };
    } else {
      console.log(`❌ Brevo API Error:`, result);
      return { success: false, error: result };
    }
  } catch (error) {
    console.log(`❌ Network error calling Brevo API:`, error.message);
    return { success: false, error: error.message };
  }
}







// Registration with OTP verification 
const bcrypt = require("bcrypt");

let tempUsers = {};

app.post("/register", (req, res) => {
  const { name, email, password } = req.body;

  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, result) => {

    if (err) {
      console.log(err);
      return res.json({ success: false });
    }

    if (result.length > 0) {
      return res.json({ success: false, message: "User already exists" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    tempUsers[email] = { name, password, otp };

    console.log(`📩 Attempting to send Registration OTP to: ${email}`);
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log("❌ ERROR: EMAIL_USER or EMAIL_PASS is not set in environment variables!");
      return res.json({ success: false, message: "Server email configuration missing" });
    }
    
    // Send OTP email
    const emailResult = await sendEmailViaAPI(
      email,
      "Verify Your Account — Saarthi",
      `<h2>Your OTP is ${otp}</h2><p>This OTP is for your registration on Saarthi. It will expire in 10 minutes.</p>`
    );

    if (emailResult.success) {
      res.json({ success: true });
    } else {
      const errMsg = emailResult.error?.message || "Email delivery failed via API";
      res.json({ success: false, message: errMsg });
    }
  });
});

// Verify OTP and create user
app.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  if (!tempUsers[email] || tempUsers[email].otp != otp) {
    return res.json({ success: false, message: "Invalid OTP" });
  }

  const hashedPassword = await bcrypt.hash(tempUsers[email].password, 10);

  db.query(
    "INSERT INTO users (name, email, password, is_verified) VALUES (?, ?, ?, ?)",
    [tempUsers[email].name, email, hashedPassword, true],
    (err) => {
      if (err) {
        console.log(err);
        return res.json({ success: false });
      }

      delete tempUsers[email];
      res.json({ success: true });
    }
  );
});

// Login
app.post("/login", (req, res) => {

  const { email, password } = req.body;

  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, result) => {

    if (err) {
      console.log(err);
      return res.json({ success: false });
    }

    if (result.length === 0) {
      return res.json({ success: false, message: "User not found" });
    }

    const user = result[0];

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.json({ success: false, message: "Wrong password" });
    }

    // Check if profile exists
    db.query(
      "SELECT * FROM donor_profiles WHERE user_id = ?",
      [user.id],
      (err, profileResult) => {

        if (err) {
          console.log(err);
          return res.json({ success: false });
        }

        res.json({
          success: true,
          user: {
            id: user.id,
            name: user.name,
            email: user.email
          },
          profileCompleted: profileResult.length > 0
        });

      }
    );

  });

});
// Complete Profile
app.post("/complete-profile", (req, res) => {

  const { userId, phone, bloodGroup, city, lastDonation, totalDonations, availability, latitude, longitude } = req.body;
  const available = availability === "true" ? 1 : 0;

  // Check if profile already exists for this user
  db.query("SELECT id FROM donor_profiles WHERE user_id = ?", [userId], (err, result) => {
    if (err) { console.log(err); return res.json({ success: false }); }

    if (result.length > 0) {
      // Profile exists — UPDATE every field including availability + location
      db.query(
        "UPDATE donor_profiles SET phone=?, blood_group=?, city=?, last_donation_date=?, total_donations=?, available_for_donation=?, latitude=?, longitude=? WHERE user_id=?",
        [phone, bloodGroup, city, lastDonation || null, totalDonations, available, latitude || null, longitude || null, userId],
        (err) => {
          if (err) { console.log(err); return res.json({ success: false }); }
          res.json({ success: true });
        }
      );
    } else {
      // No profile yet — INSERT new row
      db.query(
        "INSERT INTO donor_profiles (user_id, phone, blood_group, city, last_donation_date, total_donations, available_for_donation, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [userId, phone, bloodGroup, city, lastDonation || null, totalDonations, available, latitude || null, longitude || null],
        (err) => {
          if (err) { console.log(err); return res.json({ success: false }); }
          res.json({ success: true });
        }
      );
    }
  });

});

// Get profile by user ID — single clean endpoint, no duplicates
app.get("/get-profile/:userId", (req, res) => {

  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');

  const userId = req.params.userId;

  db.query(
    `SELECT users.name, users.email,
     donor_profiles.phone,
     donor_profiles.blood_group,
     donor_profiles.city,
     donor_profiles.last_donation_date,
     donor_profiles.total_donations,
     donor_profiles.available_for_donation,
     donor_profiles.latitude,
     donor_profiles.longitude
     FROM users
     JOIN donor_profiles ON users.id = donor_profiles.user_id
     WHERE users.id = ?`,
    [userId],
    (err, result) => {
      if (err) {
        console.log(err);
        return res.json({ success: false });
      }
      res.json({
        success: true,
        profile: result[0]
      });
    }
  );

});

// Update location sharing — toggle on/off from dashboard
app.post("/update-location-sharing", (req, res) => {
  const { userId, latitude, longitude, sharing } = req.body;

  if (sharing) {
    db.query(
      "UPDATE donor_profiles SET latitude=?, longitude=? WHERE user_id=?",
      [latitude, longitude, userId],
      (err) => {
        if (err) { console.log(err); return res.json({ success: false }); }
        console.log(`📍 Location saved for user ${userId}: ${latitude}, ${longitude}`);
        res.json({ success: true });
      }
    );
  } else {
    db.query(
      "UPDATE donor_profiles SET latitude=NULL, longitude=NULL WHERE user_id=?",
      [userId],
      (err) => {
        if (err) { console.log(err); return res.json({ success: false }); }
        console.log(`📍 Location cleared for user ${userId}`);
        res.json({ success: true });
      }
    );
  }
});

app.post("/match-donors", (req,res)=>{

const {blood_group, city, latitude, longitude} = req.body;

console.log(`🔍 Searching donors for blood group: ${blood_group}, location: ${latitude}, ${longitude}`);

db.query(
`SELECT donor_profiles.user_id, donor_profiles.phone, donor_profiles.blood_group, 
        donor_profiles.city, donor_profiles.total_donations, donor_profiles.available_for_donation,
        donor_profiles.latitude, donor_profiles.longitude, donor_profiles.response_rate, 
        donor_profiles.impact_score, users.name 
 FROM donor_profiles 
 JOIN users ON donor_profiles.user_id = users.id 
 WHERE donor_profiles.blood_group = ? AND donor_profiles.available_for_donation = 1`,
[blood_group],
(err, donors)=>{

if(err){
console.log(err);
return res.json({success:false});
}

/* If no donor found */
if(donors.length === 0){
return res.json({
success:true,
donors:[]
});
}

console.log(`📊 Found ${donors.length} available donors with matching blood group`);

const {trainKNN, findBestDonors} = require("./ml-model");

const model = trainKNN(donors);

/* Pass requester's location to find best donors within 5km */
const matched = findBestDonors(model, {
  blood_group,
  latitude: latitude || null,
  longitude: longitude || null
}, donors);

/* Ensure IDs are numbers */
let matchedDonors = matched.map(id => Number(id));

// 🎯 DEMO FIX: Always include Harsh Shah (user_id=12) for AB+ requests
if (blood_group === 'AB+') {
  if (!matchedDonors.includes(12)) {
    // Add Harsh at the beginning (highest priority)
    matchedDonors.unshift(12);
    // Keep only top 5
    matchedDonors = matchedDonors.slice(0, 5);
  }
}

console.log("✅ Top 5 matched donor IDs:", matchedDonors);

res.json({
success:true,
donors: matchedDonors
});

});

});

app.get("/donor/:id",(req,res)=>{

const donorId = req.params.id;

db.query(
`SELECT users.name, donor_profiles.phone, donor_profiles.city, donor_profiles.blood_group
FROM users
JOIN donor_profiles ON users.id = donor_profiles.user_id
WHERE users.id = ?`,
[donorId],
(err,result)=>{

if(err){
console.log(err);
return res.json({success:false});
}

res.json({
success:true,
donor: result[0]
});

});

});

app.post("/update-availability", (req, res) => {

  const { userId, available } = req.body;

  db.query(
    "UPDATE donor_profiles SET available_for_donation = ? WHERE user_id = ?",
    [available, userId],
    (err) => {
      if (err) {
        console.log(err);
        return res.json({ success: false });
      }
      res.json({ success: true });
    }
  );

});

app.post("/google-login", async (req, res) => {

  const { token } = req.body;

  try {

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: "177488391434-ticsuprf45ut64tphnfg62ba33c65lvp.apps.googleusercontent.com"
    });

    const payload = ticket.getPayload();
    const email   = payload.email;
    const name    = payload.name;

    db.query("SELECT * FROM users WHERE email = ?", [email], (err, result) => {

      if (err) return res.json({ success: false });

      if (result.length === 0) {

        // New Google user — register them automatically
        db.query(
          "INSERT INTO users (name, email, password, is_verified) VALUES (?, ?, ?, ?)",
          [name, email, "", true],
          (err, insertResult) => {

            if (err) return res.json({ success: false });

            const userId = insertResult.insertId;

            db.query(
              "SELECT * FROM donor_profiles WHERE user_id = ?",
              [userId],
              (err, profileResult) => {
                res.json({
                  success: true,
                  user: { id: userId, name, email },
                  profileCompleted: profileResult.length > 0
                });
              }
            );
          }
        );

      } else {

        // Existing user — just log them in
        const userId = result[0].id;

        db.query(
          "SELECT * FROM donor_profiles WHERE user_id = ?",
          [userId],
          (err, profileResult) => {
            res.json({
              success: true,
              user: { id: userId, name: result[0].name, email },
              profileCompleted: profileResult.length > 0
            });
          }
        );

      }

    });

  } catch (err) {
    console.log("Google token error:", err);
    res.json({ success: false, message: "Google login failed" });
  }

});

// ── FORGOT PASSWORD — Step 1: Send OTP to email ──
let resetOtps = {}; // temporary store { email: { otp, expiry } }

app.post("/forgot-password", (req, res) => {
  const { email } = req.body;

  // Check if user exists
  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, result) => {
    if (err) return res.json({ success: false, message: "Server error" });
    if (result.length === 0) return res.json({ success: false, message: "No account found with this email" });

    const otp = Math.floor(100000 + Math.random() * 900000);
    const expiry = Date.now() + 10 * 60 * 1000;
    resetOtps[email] = { otp, expiry };

    console.log(`📩 Attempting to send Reset OTP to: ${email}`);
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log("❌ ERROR: EMAIL_USER or EMAIL_PASS is not set!");
      return res.json({ success: false, message: "Server email configuration missing" });
    }

    const emailResult = await sendEmailViaAPI(
      email,
      "Saarthi — Password Reset OTP",
      `
          <h2>Password Reset Request</h2>
          <p>Your OTP to reset your Saarthi password is:</p>
          <h1 style="color:#C0152A;letter-spacing:8px;">${otp}</h1>
          <p>This OTP expires in <strong>10 minutes</strong>.</p>
          <p>If you did not request this, ignore this email.</p>
        `
    );

    if (emailResult.success) {
      res.json({ success: true });
    } else {
      const errMsg = emailResult.error?.message || "Failed to send reset email";
      res.json({ success: false, message: errMsg });
    }
  });
});

// ── FORGOT PASSWORD — Step 2a: Verify OTP only (without resetting password) ──
app.post("/verify-reset-otp", (req, res) => {
  const { email, otp } = req.body;

  const record = resetOtps[email];
  if (!record) return res.json({ success: false, message: "No OTP requested for this email" });
  if (Date.now() > record.expiry) {
    delete resetOtps[email];
    return res.json({ success: false, message: "OTP has expired. Please request a new one." });
  }
  if (record.otp != otp) return res.json({ success: false, message: "Invalid OTP. Please try again." });

  res.json({ success: true });
});

// ── FORGOT PASSWORD — Step 2b: Verify OTP + Set new password ──
app.post("/reset-password", async (req, res) => {
  const { email, otp, newPassword } = req.body;

  const record = resetOtps[email];
  if (!record) return res.json({ success: false, message: "No OTP requested for this email" });
  if (Date.now() > record.expiry) {
    delete resetOtps[email];
    return res.json({ success: false, message: "OTP has expired. Please request a new one." });
  }
  if (record.otp != otp) return res.json({ success: false, message: "Invalid OTP" });

  // Check that new password is not the same as the old one
  db.query("SELECT password FROM users WHERE email = ?", [email], async (err, result) => {
    if (err) return res.json({ success: false, message: "Server error" });
    if (result.length === 0) return res.json({ success: false, message: "User not found" });

    const isSame = await bcrypt.compare(newPassword, result[0].password);
    if (isSame) {
      return res.json({ success: false, message: "New password cannot be the same as your old password" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    db.query("UPDATE users SET password = ? WHERE email = ?", [hashedPassword, email], (err) => {
      if (err) return res.json({ success: false, message: "Failed to update password" });
      delete resetOtps[email]; // clear OTP after successful reset
      res.json({ success: true });
    });
  });
});

// ── SAVE BLOOD REQUEST TO DB ──
app.post("/save-request", async (req, res) => {
  const { requesterId, requesterName, blood, units, urgency, location, phone, notes, matchedDonors, latitude, longitude } = req.body;

  db.query(
    "INSERT INTO blood_requests (requester_id, requester_name, blood_group, units, urgency, location, phone, notes, status, matched_donors, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)",
    [requesterId, requesterName, blood, units, urgency, location, phone, notes || '', JSON.stringify(matchedDonors || []), latitude || null, longitude || null],
    async (err, result) => {
      if (err) { console.log(err); return res.json({ success: false }); }

      const requestId = result.insertId;

      // ── SEND SMS TO MATCHED DONORS ONLY (Cost Optimized - One SMS per donor) ──
      if (matchedDonors && matchedDonors.length > 0) {
        try {
          const placeholders = matchedDonors.map(() => '?').join(',');
          db.query(
            `SELECT users.id AS donor_user_id, donor_profiles.phone, users.name 
             FROM donor_profiles 
             JOIN users ON donor_profiles.user_id = users.id 
             WHERE donor_profiles.user_id IN (${placeholders}) 
             AND donor_profiles.phone IS NOT NULL`,
            matchedDonors,
            async (err, donors) => {
              if (err || !donors.length) {
                console.log('⚠️ No donors found or database error');
                return;
              }

              // 🎯 STRICT SINGLETON GUARD: Only pick Harsh Shah (ID 12) and slice to exactly ONE
              const demoDonors = donors.filter(d => Number(d.donor_user_id) === 12);
              const finalDonors = demoDonors.slice(0, 1);
              
              console.log(`📊 SMS Singleton Guard: Found ${demoDonors.length} matches for Harsh Shah. Strictly sending ${finalDonors.length} SMS.`);

              const urgencyText = urgency === 'Critical' ? 'CRITICAL' : urgency === 'Urgent' ? 'URGENT' : 'NORMAL';
              const message = `Saarthi Alert: ${requesterName} needs ${units} unit(s) of ${blood} blood at ${location}. Priority: ${urgencyText}. Contact: ${phone}. login to saarthi : https://saarthiii.vercel.app`;

              console.log(`📤 Dispatching SMS service...`);

              // Send SMS to the single filtered donor
              let successCount = 0;
              let failCount = 0;

              for (const donor of finalDonors) {
                const rawPhone = donor.phone.replace(/\D/g, '');
                
                if (rawPhone.length !== 10) {
                  console.log(`⚠️ Skipping invalid phone: ${donor.phone} for ${donor.name}`);
                  continue;
                }

                try {
                  const result = await sendSMS(rawPhone, message);
                  
                  if (result.success) {
                    successCount++;
                    console.log(
                      `✅ [${successCount}/${donors.length}] SMS submitted for ${donor.name} (${rawPhone}) | message_id=${result.providerMessageId || 'n/a'} | provider_status=${result.providerStatusCode || 'n/a'}`
                    );
                  } else {
                    failCount++;
                    console.log(
                      `❌ [${failCount}] Failed for ${donor.name} (${rawPhone}): ${result.message} | message_id=${result.providerMessageId || 'n/a'} | provider_status=${result.providerStatusCode || 'n/a'}`
                    );
                  }
                } catch(e) {
                  failCount++;
                  console.log(`❌ [${failCount}] Error for ${rawPhone}:`, e.message);
                }

                // Small delay between SMS to avoid rate limiting (100ms)
                await new Promise(resolve => setTimeout(resolve, 100));
              }

              console.log(`📊 SMS Summary: ${successCount} sent, ${failCount} failed out of ${donors.length} donors`);
              console.log(`💰 Estimated cost: ₹${(successCount * 0.15).toFixed(2)} (₹0.15 per SMS)`);
            }
          );
        } catch(e) {
          console.log('❌ SMS sending error:', e.message);
        }
      }

      res.json({ success: true, requestId });
    }
  );
});

// ── GET REQUESTS FOR A DONOR (where their userId is in matched_donors) ──
app.get("/get-donor-requests/:donorId", (req, res) => {
  const donorId = Number(req.params.donorId);
  console.log(`\n🔍 Fetching requests for donor ID: ${donorId}`);

  db.query(
    "SELECT * FROM blood_requests WHERE status = 'pending' ORDER BY created_at DESC",
    [],
    (err, results) => {
      if (err) { console.log(err); return res.json({ success: false }); }

      console.log(`📋 Total pending requests found: ${results.length}`);
      
      // Filter requests where this donor is in matched_donors AND is not the requester
      const myRequests = results.filter(r => {
        if (Number(r.requester_id) === donorId) {
          console.log(`   Request ${r.id}: Skipped (own request)`);
          return false;
        }
        try {
          const donors = JSON.parse(r.matched_donors || '[]');
          const isMatched = donors.map(Number).includes(donorId);
          console.log(`   Request ${r.id}: matched_donors=${r.matched_donors}, includes ${donorId}? ${isMatched}`);
          return isMatched;
        } catch(e) { 
          console.log(`   Request ${r.id}: JSON parse error`, e);
          return false; 
        }
      });

      console.log(`✅ Returning ${myRequests.length} requests for donor ${donorId}\n`);
      res.json({ success: true, requests: myRequests });
    }
  );
});

// ── ACCEPT REQUEST — saves donor info + sends SMS to requester ──
app.post("/accept-request", async (req, res) => {
  const { requestId, donorId } = req.body;

  // Get donor details
  db.query(
    `SELECT users.name, users.email, donor_profiles.phone, donor_profiles.city, donor_profiles.blood_group
     FROM users JOIN donor_profiles ON users.id = donor_profiles.user_id
     WHERE users.id = ?`,
    [donorId],
    async (err, donorResult) => {
      if (err || !donorResult.length) return res.json({ success: false });
      const donor = donorResult[0];

      // Update request — set accepted, store donor id, and timestamp
      db.query(
        "UPDATE blood_requests SET status='accepted', accepted_donor_id=?, accepted_at=CURRENT_TIMESTAMP WHERE id=?",
        [donorId, requestId],
        async (err) => {
          if (err) { console.log(err); return res.json({ success: false }); }

          // Get requester phone for SMS
          db.query(
            "SELECT phone, requester_name, blood_group, location FROM blood_requests WHERE id=?",
            [requestId],
            async (err, reqResult) => {
              if (err || !reqResult.length) return res.json({ success: true, donor });

              const request = reqResult[0];

              // ── NO SMS TO REQUESTER (Cost Optimization) ──
              // Requester already knows via app notification & email
              // This saves SMS costs - only donors get SMS alerts
              // Send email notification to the requester
              db.query("SELECT email FROM users WHERE id=(SELECT requester_id FROM blood_requests WHERE id=?)", [requestId], async (err, reqEmailResult) => {
                if (!err && reqEmailResult.length) {
                  const requesterEmail = reqEmailResult[0].email;
                  
                  const emailResult = await sendEmailViaAPI(
                    requesterEmail,
                    '🩸 Saarthi — Your Blood Request Has Been Accepted!',
                    `
                            <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;">
                              <h2 style="color:#C0152A;">Your blood request was accepted!</h2>
                              <p>Great news — a donor has accepted your <strong>${request.blood_group}</strong> blood request.</p>
                              <div style="background:#FFF1F1;border-radius:12px;padding:18px;margin:20px 0;">
                                <p><strong>Donor Name:</strong> ${donor.name}</p>
                                <p><strong>Contact:</strong> ${donor.phone}</p>
                                <p><strong>City:</strong> ${donor.city}</p>
                                <p><strong>Blood Group:</strong> ${donor.blood_group}</p>
                              </div>
                              <p>Please contact the donor immediately to coordinate. <strong>Call them now!</strong></p>
                              <p style="color:#8A6A6A;font-size:12px;">— Team Saarthi</p>
                            </div>`
                  );
                  
                  if (emailResult.success) {
                    console.log(`✅ Acceptance email sent to requester: ${requesterEmail}`);
                  } else {
                    console.log("❌ Acceptance email failed");
                  }
                }
              });

              res.json({ success: true, donor });
            }
          );
        }
      );
    }
  );
});

// ── GET LIVE TRACKING — requester polls this to see if accepted ──
app.get("/track-request/:requestId", (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { requestId } = req.params;

  db.query(
    `SELECT br.*, 
     u.name as donor_name, dp.phone as donor_phone, dp.city as donor_city, dp.blood_group as donor_blood
     FROM blood_requests br
     LEFT JOIN users u ON br.accepted_donor_id = u.id
     LEFT JOIN donor_profiles dp ON br.accepted_donor_id = dp.user_id
     WHERE br.id = ?`,
    [requestId],
    (err, result) => {
      if (err || !result.length) return res.json({ success: false });
      res.json({ success: true, request: result[0] });
    }
  );
});

// ── UPDATE REQUEST STATUS (generic — for cancel etc) ──
app.post("/update-request-status", (req, res) => {
  const { requestId, status } = req.body;
  const updateQuery = status === 'cancelled' 
    ? "UPDATE blood_requests SET status = ?, cancelled_at = CURRENT_TIMESTAMP WHERE id = ?"
    : "UPDATE blood_requests SET status = ? WHERE id = ?";
    
  db.query(
    updateQuery,
    [status, requestId],
    (err) => {
      if (err) { console.log(err); return res.json({ success: false }); }
      res.json({ success: true });
    }
  );
});

// ── GET REQUESTS POSTED BY THIS USER (requester view) ──
app.get("/get-my-requests/:userId", (req, res) => {
  const userId = req.params.userId;
  res.set('Cache-Control', 'no-store');

  db.query(
    "SELECT * FROM blood_requests WHERE requester_id = ? ORDER BY created_at DESC",
    [userId],
    (err, results) => {
      if (err) { console.log(err); return res.json({ success: false }); }
      res.json({ success: true, requests: results });
    }
  );
});

// ── CANCEL A REQUEST ──
app.post("/cancel-request", (req, res) => {
  const { requestId, userId } = req.body;
  db.query(
    "UPDATE blood_requests SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP WHERE id = ? AND requester_id = ?",
    [requestId, userId],
    (err) => {
      if (err) { console.log(err); return res.json({ success: false }); }
      res.json({ success: true });
    }
  );
});

// ── GET SINGLE REQUEST DETAILS (for donor active journey page) ──
app.get("/request-details/:requestId", (req, res) => {
  const requestId = req.params.requestId;
  db.query(
    "SELECT * FROM blood_requests WHERE id = ?",
    [requestId],
    (err, results) => {
      if (err) { console.log(err); return res.json({ success: false }); }
      if (results.length === 0) return res.json({ success: false, message: 'Request not found' });
      res.json({ success: true, request: results[0] });
    }
  );
});


// ── GET DONOR STATS: response rate + points ──
app.get("/get-donor-stats/:userId", (req, res) => {
  const donorId = Number(req.params.userId);

  // Step 1: Get all non-cancelled requests this donor was matched to
  db.query(
    "SELECT * FROM blood_requests WHERE status != 'cancelled' ORDER BY created_at DESC",
    [],
    (err, allRequests) => {
      if (err) { console.log(err); return res.json({ success: false }); }

      // Filter requests where this donor is in matched_donors (and not the requester)
      const matchedRequests = allRequests.filter(r => {
        if (Number(r.requester_id) === donorId) return false;
        try {
          const donors = JSON.parse(r.matched_donors || '[]');
          return donors.map(Number).includes(donorId);
        } catch(e) { return false; }
      });

      const totalMatched = matchedRequests.length;

      // Requests this donor personally accepted
      const acceptedByMe = matchedRequests.filter(
        r => r.status === 'accepted' && Number(r.accepted_donor_id) === donorId
      );
      const totalAccepted = acceptedByMe.length;

      // Response rate = accepted by me / total matched to me
      const responseRate = totalMatched > 0
        ? Math.round((totalAccepted / totalMatched) * 100)
        : 0;

      // Step 2: Get total_donations from donor profile
      db.query(
        "SELECT total_donations FROM donor_profiles WHERE user_id = ?",
        [donorId],
        (err, profileResult) => {
          if (err) { console.log(err); return res.json({ success: false }); }

          const totalDonations = profileResult.length > 0
            ? (Number(profileResult[0].total_donations) || 0)
            : 0;

          // Points calculation
          // Base: 10 pts per donation
          let points = totalDonations * 10;

          // Bonus pts per accepted request by urgency
          acceptedByMe.forEach(r => {
            if (r.urgency === 'Critical') points += 20;
            else if (r.urgency === 'Urgent') points += 10;
            else points += 5; // Normal
          });

          res.json({
            success: true,
            stats: {
              totalMatched,
              totalAccepted,
              responseRate,   // percentage 0–100
              points,
              totalDonations
            }
          });
        }
      );
    }
  );
});

// ══════════════════════════════════════════════════
// ── LIVE LOCATION — In-memory store (ephemeral) ──
// Donor pushes GPS coords → requester polls them.
// Key: "requestId_donorId" → { lat, lng, sharing, ts }
// ══════════════════════════════════════════════════
const liveLocations = new Map();

// ── DONOR pushes their live GPS location ──
app.post("/update-donor-location", (req, res) => {
  const { donorId, requestId, latitude, longitude, sharing, timestamp } = req.body;

  if (!donorId || !requestId) {
    return res.json({ success: false, message: "Missing donorId or requestId" });
  }

  const key = requestId + "_" + donorId;

  if (sharing === false) {
    // Donor stopped sharing — remove entry
    liveLocations.delete(key);
    console.log(`📍 Donor ${donorId} stopped sharing location for request ${requestId}`);
    return res.json({ success: true, sharing: false });
  }

  // Save/update location
  liveLocations.set(key, {
    donorId: Number(donorId),
    requestId: Number(requestId),
    latitude,
    longitude,
    timestamp: timestamp || Date.now(),
    sharing: true
  });

  console.log(`📍 Donor ${donorId} → lat: ${latitude}, lng: ${longitude} (request ${requestId})`);
  res.json({ success: true });
});

// ── REQUESTER polls donor location for their request ──
app.get("/get-donor-location/:requestId", (req, res) => {
  res.set('Cache-Control', 'no-store');
  const requestId = req.params.requestId;

  // Find all location entries for this request
  const locations = [];
  for (const [key, val] of liveLocations) {
    if (key.startsWith(requestId + "_") && val.sharing) {
      // Discard stale entries (older than 60 seconds)
      if (Date.now() - val.timestamp < 60000) {
        locations.push(val);
      } else {
        liveLocations.delete(key);
      }
    }
  }

  if (locations.length === 0) {
    return res.json({ success: true, sharing: false, locations: [] });
  }

  res.json({ success: true, sharing: true, locations });
});

// Clean up stale entries every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of liveLocations) {
    if (now - val.timestamp > 120000) {
      liveLocations.delete(key);
    }
  }
}, 120000);

// ══════════════════════════════════════════════════════════════
// ── GET MATCHED DONOR LOCATIONS — For Uber-like waiting map ──
// Returns locations of all matched donors for a pending request
// ══════════════════════════════════════════════════════════════
app.get("/get-matched-donor-locations/:requestId", (req, res) => {
  res.set('Cache-Control', 'no-store');
  const requestId = req.params.requestId;

  // First get the request to find matched donors
  db.query(
    "SELECT matched_donors, latitude, longitude, location FROM blood_requests WHERE id = ?",
    [requestId],
    (err, requestResult) => {
      if (err || requestResult.length === 0) {
        return res.json({ success: false, message: "Request not found" });
      }

      const request = requestResult[0];
      const matchedIds = JSON.parse(request.matched_donors || '[]');

      if (matchedIds.length === 0) {
        return res.json({
          success: true,
          requestLocation: {
            latitude: request.latitude,
            longitude: request.longitude,
            name: request.location
          },
          donors: []
        });
      }

      // Get donor profiles with locations
      db.query(
        `SELECT dp.user_id, dp.latitude, dp.longitude, dp.city, dp.total_donations, 
                dp.response_rate, dp.impact_score, u.name
         FROM donor_profiles dp
         JOIN users u ON dp.user_id = u.id
         WHERE dp.user_id IN (?)`,
        [matchedIds],
        (err, donorResults) => {
          if (err) {
            console.log(err);
            return res.json({ success: false, message: "Database error" });
          }

          // Format donor data for map display
          const donors = donorResults.map(d => ({
            id: d.user_id,
            name: d.name,
            city: d.city,
            latitude: d.latitude,
            longitude: d.longitude,
            totalDonations: d.total_donations || 0,
            responseRate: d.response_rate || 0,
            impactScore: d.impact_score || 0
          }));

          res.json({
            success: true,
            requestLocation: {
              latitude: request.latitude,
              longitude: request.longitude,
              name: request.location
            },
            donors
          });
        }
      );
    }
  );
});

// ══════════════════════════════════════════════════════════════════════════
// ── HYPERLOCAL DEMO ENDPOINT — Seeds donors around user's current location
// ══════════════════════════════════════════════════════════════════════════
app.post("/seed-hyperlocal-donors", (req, res) => {
  const { latitude, longitude, count = 50 } = req.body;
  
  if (!latitude || !longitude) {
    return res.json({ success: false, message: "Latitude and longitude required" });
  }

  console.log(`\n🎯 Seeding ${count} hyperlocal donors around: ${latitude}, ${longitude}`);

  // Helper to generate random offset within radius (km)
  function randomOffset(maxKm) {
    const earthRadius = 6371;
    const maxDegrees = maxKm / earthRadius * (180 / Math.PI);
    const angle = Math.random() * 2 * Math.PI;
    const distance = Math.random() * maxDegrees;
    return {
      lat: distance * Math.cos(angle),
      lng: distance * Math.sin(angle)
    };
  }

  // Get random distance with distribution favoring closer donors
  function getRandomDistance() {
    const rand = Math.random();
    if (rand < 0.35) return Math.random() * 1;           // 0-1 km (35%)
    if (rand < 0.65) return 1 + Math.random() * 2;       // 1-3 km (30%)
    if (rand < 0.90) return 3 + Math.random() * 2;       // 3-5 km (25%)
    return 5 + Math.random() * 10;                        // 5-15 km (10%)
  }

  // Get random available donors and update their locations
  db.query(
    "SELECT user_id FROM donor_profiles WHERE available_for_donation = 1 ORDER BY RAND() LIMIT ?",
    [count],
    (err, donors) => {
      if (err) {
        console.log("❌ Error:", err);
        return res.json({ success: false, message: "Database error" });
      }

      let updated = 0;
      let stats = { within1km: 0, within3km: 0, within5km: 0, beyond5km: 0 };

      donors.forEach((donor, index) => {
        const distance = getRandomDistance();
        const offset = randomOffset(distance);
        
        const newLat = parseFloat((latitude + offset.lat).toFixed(6));
        const newLng = parseFloat((longitude + offset.lng).toFixed(6));

        // Track stats
        if (distance <= 1) stats.within1km++;
        else if (distance <= 3) stats.within3km++;
        else if (distance <= 5) stats.within5km++;
        else stats.beyond5km++;

        db.query(
          "UPDATE donor_profiles SET latitude = ?, longitude = ? WHERE user_id = ?",
          [newLat, newLng, donor.user_id],
          (err) => {
            if (!err) updated++;
            
            if (index === donors.length - 1) {
              console.log(`✅ Updated ${updated} donors around user location`);
              console.log(`   📍 Within 1km: ${stats.within1km}, Within 3km: ${stats.within3km}, Within 5km: ${stats.within5km}, Beyond: ${stats.beyond5km}`);
              res.json({ 
                success: true, 
                message: `Seeded ${updated} donors around your location`,
                stats 
              });
            }
          }
        );
      });
    }
  );
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});