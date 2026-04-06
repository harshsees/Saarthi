// Debug script - Check donor phone numbers in database
const mysql = require("mysql");
require("dotenv").config();

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "saarthi"
});

db.connect((err) => {
  if (err) {
    console.log("❌ Database connection failed:", err);
    process.exit(1);
  }
  
  console.log("✅ Connected to database\n");
  
  // Check donor ID 12
  db.query(
    `SELECT 
      users.id, 
      users.name, 
      users.email,
      donor_profiles.phone,
      donor_profiles.blood_group,
      donor_profiles.city
    FROM users 
    JOIN donor_profiles ON users.id = donor_profiles.user_id
    WHERE users.id = 12`,
    [],
    (err, result) => {
      if (err) {
        console.log("❌ Query error:", err);
        db.end();
        process.exit(1);
      }
      
      if (result.length === 0) {
        console.log("❌ No donor found with ID 12");
      } else {
        console.log("📋 Donor ID 12 Details:");
        console.log("─────────────────────────");
        console.log("Name:", result[0].name);
        console.log("Email:", result[0].email);
        console.log("Phone:", result[0].phone);
        console.log("Blood Group:", result[0].blood_group);
        console.log("City:", result[0].city);
        console.log("");
        
        if (!result[0].phone) {
          console.log("⚠️  WARNING: Phone number is NULL/empty!");
        } else {
          const cleaned = result[0].phone.replace(/\D/g, '');
          console.log("Cleaned phone (digits only):", cleaned);
          console.log("Phone length:", cleaned.length);
          
          if (cleaned.length !== 10) {
            console.log("⚠️  WARNING: Phone number should be 10 digits!");
          } else {
            console.log("✅ Phone number format is correct");
          }
        }
      }
      
      db.end();
    }
  );
});
