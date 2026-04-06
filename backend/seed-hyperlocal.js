/**
 * Hyperlocal Demo Data Seeder
 * 
 * This script updates donor locations to demonstrate the hyperlocal feature.
 * It clusters donors around the user's current location so they can see
 * nearby donors on the map.
 * 
 * Usage: node seed-hyperlocal.js <latitude> <longitude>
 * Example: node seed-hyperlocal.js 23.0225 72.5714
 */

const mysql = require("mysql");

const db = mysql.createConnection({
  host: "127.0.0.1",
  user: "root",
  password: "123456",
  database: "saarthi",
  port: 3300
});

// Get coordinates from command line or use default (Ahmedabad)
const userLat = parseFloat(process.argv[2]) || 23.0225;
const userLng = parseFloat(process.argv[3]) || 72.5714;

console.log(`\n🎯 Seeding hyperlocal donors around: ${userLat}, ${userLng}\n`);

/**
 * Generate random offset within a given radius (in km)
 */
function randomOffset(maxKm) {
  const earthRadius = 6371;
  const maxDegrees = maxKm / earthRadius * (180 / Math.PI);
  
  // Random angle and distance
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * maxDegrees;
  
  return {
    lat: distance * Math.cos(angle),
    lng: distance * Math.sin(angle)
  };
}

/**
 * Distribution of donors by distance:
 * - 30% within 1km (very close)
 * - 30% within 1-3km (close)
 * - 25% within 3-5km (nearby)
 * - 15% within 5-15km (far - won't be matched)
 */
function getRandomDistance() {
  const rand = Math.random();
  if (rand < 0.30) return Math.random() * 1;           // 0-1 km
  if (rand < 0.60) return 1 + Math.random() * 2;       // 1-3 km
  if (rand < 0.85) return 3 + Math.random() * 2;       // 3-5 km
  return 5 + Math.random() * 10;                        // 5-15 km
}

db.connect((err) => {
  if (err) {
    console.log("❌ MySQL Connection Failed:", err);
    process.exit(1);
  }
  console.log("✅ MySQL Connected\n");

  // Get all donors
  db.query("SELECT user_id, city FROM donor_profiles", (err, donors) => {
    if (err) {
      console.log("❌ Error fetching donors:", err);
      db.end();
      return;
    }

    console.log(`📊 Found ${donors.length} donors to update\n`);

    let updated = 0;
    let withinRadius = { '1km': 0, '3km': 0, '5km': 0, 'far': 0 };

    // Update each donor with a location relative to user
    donors.forEach((donor, index) => {
      const distance = getRandomDistance();
      const offset = randomOffset(distance);
      
      const newLat = parseFloat((userLat + offset.lat).toFixed(6));
      const newLng = parseFloat((userLng + offset.lng).toFixed(6));

      // Track distribution
      if (distance <= 1) withinRadius['1km']++;
      else if (distance <= 3) withinRadius['3km']++;
      else if (distance <= 5) withinRadius['5km']++;
      else withinRadius['far']++;

      db.query(
        "UPDATE donor_profiles SET latitude = ?, longitude = ? WHERE user_id = ?",
        [newLat, newLng, donor.user_id],
        (err) => {
          if (!err) updated++;
          
          // Log progress every 100 donors
          if ((index + 1) % 100 === 0) {
            console.log(`  ⏳ Updated ${index + 1}/${donors.length} donors...`);
          }

          // When all done
          if (index === donors.length - 1) {
            setTimeout(() => {
              console.log(`\n✅ Successfully updated ${updated} donors!\n`);
              console.log("📍 Distribution around your location:");
              console.log(`   🟢 Within 1km:  ${withinRadius['1km']} donors (very close)`);
              console.log(`   🟡 Within 3km:  ${withinRadius['3km']} donors (close)`);
              console.log(`   🟠 Within 5km:  ${withinRadius['5km']} donors (nearby)`);
              console.log(`   🔴 Beyond 5km:  ${withinRadius['far']} donors (won't be matched)\n`);
              console.log(`📊 Total matchable (within 5km): ${withinRadius['1km'] + withinRadius['3km'] + withinRadius['5km']} donors`);
              console.log(`\n🎯 Center location: https://www.google.com/maps?q=${userLat},${userLng}\n`);
              db.end();
            }, 500);
          }
        }
      );
    });
  });
});
