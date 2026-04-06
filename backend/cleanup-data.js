const mysql = require("mysql");

const db = mysql.createConnection({
  host: "127.0.0.1",
  user: "root",
  password: "123456",
  database: "saarthi",
  port: 3300
});

// IDs to KEEP (your original data)
const KEEP_IDS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

db.connect((err) => {
  if (err) {
    console.log("❌ MySQL Connection Failed:", err);
    process.exit(1);
  }
  console.log("✅ MySQL Connected");
  
  // First check current counts
  db.query("SELECT COUNT(*) as count FROM users", (err, result) => {
    console.log(`📊 Current users count: ${result[0].count}`);
    
    db.query("SELECT COUNT(*) as count FROM donor_profiles", (err, result) => {
      console.log(`📊 Current donor_profiles count: ${result[0].count}`);
      
      console.log(`\n🔒 Keeping IDs: ${KEEP_IDS.join(', ')}`);
      
      console.log("🗑️  Deleting seeded data from donor_profiles (keeping IDs 2-21)...");
      db.query("DELETE FROM donor_profiles WHERE user_id NOT IN (?)", [KEEP_IDS], (err, result) => {
        if (err) {
          console.log("❌ Error deleting donor_profiles:", err);
          process.exit(1);
        }
        console.log(`✅ donor_profiles: deleted ${result.affectedRows} rows`);
        
        console.log("🗑️  Deleting seeded data from users (keeping IDs 2-21)...");
        db.query("DELETE FROM users WHERE id NOT IN (?)", [KEEP_IDS], (err, result) => {
          if (err) {
            console.log("❌ Error deleting users:", err);
            process.exit(1);
          }
          console.log(`✅ users: deleted ${result.affectedRows} rows`);
          
          // Set auto-increment to start after existing data
          db.query("ALTER TABLE users AUTO_INCREMENT = 22", (err) => {
            console.log("✅ Auto-increment set to 22");
            
            // Verify
            db.query("SELECT COUNT(*) as count FROM users", (err, result) => {
              console.log(`\n📊 Final users count: ${result[0].count}`);
              
              db.query("SELECT COUNT(*) as count FROM donor_profiles", (err, result) => {
                console.log(`📊 Final donor_profiles count: ${result[0].count}`);
                console.log("\n🎉 Cleanup complete! Your data (IDs 2-21) is preserved.");
                console.log("👉 Now run: node seed-data.js");
                
                db.end();
                process.exit(0);
              });
            });
          });
        });
      });
    });
  });
});
