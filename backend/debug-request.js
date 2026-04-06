/**
 * Debug script to check why donors aren't showing on the map
 * Usage: node debug-request.js <request_id>
 */

const mysql = require('mysql');

const db = mysql.createConnection({
  host: '127.0.0.1',
  user: 'root',
  password: '123456',
  database: 'saarthi',
  port: 3300
});

const requestId = process.argv[2];

if (!requestId) {
  console.log('Usage: node debug-request.js <request_id>');
  console.log('\nFetching all recent requests...');
}

db.connect((err) => {
  if (err) {
    console.log('❌ MySQL Connection Failed:', err);
    process.exit(1);
  }
  
  console.log('✅ Connected to MySQL\n');
  
  if (!requestId) {
    // Show all requests
    db.query('SELECT id, requester_name, blood_group, status, latitude, longitude, matched_donors, created_at FROM blood_requests ORDER BY created_at DESC LIMIT 10', (err, requests) => {
      if (err) {
        console.log('Error:', err);
        db.end();
        return;
      }
      
      console.log('📋 Recent Blood Requests:');
      console.log('═'.repeat(80));
      requests.forEach(r => {
        const matchedIds = JSON.parse(r.matched_donors || '[]');
        console.log(`\nID: ${r.id}`);
        console.log(`  Requester: ${r.requester_name}`);
        console.log(`  Blood Group: ${r.blood_group}`);
        console.log(`  Status: ${r.status}`);
        console.log(`  Location: ${r.latitude}, ${r.longitude} ${!r.latitude ? '⚠️ NO COORDINATES!' : '✅'}`);
        console.log(`  Matched Donors: ${matchedIds.length > 0 ? matchedIds.join(', ') : '⚠️ NONE!'}`);
        console.log(`  Created: ${r.created_at}`);
      });
      
      console.log('\n\nRun with request ID for details: node debug-request.js <id>');
      db.end();
    });
  } else {
    // Detailed request analysis
    db.query('SELECT * FROM blood_requests WHERE id = ?', [requestId], (err, requests) => {
      if (err || requests.length === 0) {
        console.log('❌ Request not found');
        db.end();
        return;
      }
      
      const req = requests[0];
      const matchedIds = JSON.parse(req.matched_donors || '[]');
      
      console.log('📋 Request Details:');
      console.log('═'.repeat(60));
      console.log(`ID: ${req.id}`);
      console.log(`Requester: ${req.requester_name}`);
      console.log(`Blood Group: ${req.blood_group}`);
      console.log(`Status: ${req.status}`);
      console.log(`Request Location: ${req.latitude}, ${req.longitude}`);
      
      if (!req.latitude || !req.longitude) {
        console.log('\n⚠️ REQUEST HAS NO COORDINATES!');
        console.log('   The post-request page might not have captured your location.');
        console.log('   Make sure you allow location permission when posting.');
      }
      
      console.log(`\nMatched Donor IDs: ${matchedIds.length > 0 ? matchedIds.join(', ') : 'NONE'}`);
      
      if (matchedIds.length === 0) {
        console.log('\n⚠️ NO MATCHED DONORS!');
        console.log('   The ML model might not have found any compatible donors.');
        db.end();
        return;
      }
      
      // Get donor details
      db.query(
        `SELECT dp.user_id, dp.latitude, dp.longitude, dp.city, dp.blood_group, 
                dp.total_donations, dp.available_for_donation, u.name
         FROM donor_profiles dp
         JOIN users u ON dp.user_id = u.id
         WHERE dp.user_id IN (?)`,
        [matchedIds],
        (err, donors) => {
          if (err) {
            console.log('Error fetching donors:', err);
            db.end();
            return;
          }
          
          console.log('\n\n🩸 Matched Donor Details:');
          console.log('═'.repeat(60));
          
          donors.forEach(d => {
            const hasCoords = d.latitude && d.longitude;
            console.log(`\nDonor ID ${d.user_id}: ${d.name}`);
            console.log(`  Blood Group: ${d.blood_group}`);
            console.log(`  City: ${d.city}`);
            console.log(`  Location: ${d.latitude}, ${d.longitude} ${hasCoords ? '✅' : '⚠️ NO COORDINATES!'}`);
            console.log(`  Available: ${d.available_for_donation ? 'Yes ✅' : 'No ❌'}`);
            console.log(`  Total Donations: ${d.total_donations}`);
            
            if (hasCoords && req.latitude && req.longitude) {
              // Calculate distance
              const R = 6371;
              const dLat = (d.latitude - req.latitude) * Math.PI / 180;
              const dLon = (d.longitude - req.longitude) * Math.PI / 180;
              const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                        Math.cos(req.latitude * Math.PI / 180) * Math.cos(d.latitude * Math.PI / 180) *
                        Math.sin(dLon/2) * Math.sin(dLon/2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              const distance = R * c;
              console.log(`  Distance from request: ${distance.toFixed(2)} km`);
            }
          });
          
          // Check for missing donors
          const foundIds = donors.map(d => d.user_id);
          const missingIds = matchedIds.filter(id => !foundIds.includes(id));
          
          if (missingIds.length > 0) {
            console.log('\n\n⚠️ Missing donors (no profile found):', missingIds.join(', '));
          }
          
          // Summary
          const donorsWithCoords = donors.filter(d => d.latitude && d.longitude);
          console.log('\n\n📊 Summary:');
          console.log('═'.repeat(60));
          console.log(`Total matched donors: ${matchedIds.length}`);
          console.log(`Donors with profiles: ${donors.length}`);
          console.log(`Donors with coordinates: ${donorsWithCoords.length}`);
          
          if (donorsWithCoords.length === 0) {
            console.log('\n⚠️ NO DONORS HAVE COORDINATES!');
            console.log('   This is why the map shows no donors.');
            console.log('   Run seed-hyperlocal-donors from dashboard or update donor_profiles manually.');
          }
          
          db.end();
        }
      );
    });
  }
});
