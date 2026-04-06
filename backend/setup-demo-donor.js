/**
 * Setup Demo Donor - Makes Harsh Shah appear near Kushal for testing
 * 
 * Usage: node setup-demo-donor.js <kushal_lat> <kushal_lng>
 * 
 * This will:
 * 1. Find Harsh Shah's account
 * 2. Update his location to be ~1km from Kushal
 * 3. Ensure he has AB+ blood (or compatible) and is available
 */

const mysql = require('mysql');

const db = mysql.createConnection({
  host: '127.0.0.1',
  user: 'root',
  password: '123456',
  database: 'saarthi',
  port: 3300
});

// Get Kushal's location from command line or use default (Noida area)
const kushalLat = parseFloat(process.argv[2]) || 28.5355;
const kushalLng = parseFloat(process.argv[3]) || 77.3910;

// Generate a location ~0.5-1km from Kushal
function getNearbyLocation(lat, lng, radiusKm = 0.8) {
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * radiusKm;
  const deltaLat = (distance / 111) * Math.cos(angle);
  const deltaLng = (distance / (111 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle);
  return {
    lat: lat + deltaLat,
    lng: lng + deltaLng
  };
}

db.connect((err) => {
  if (err) {
    console.log('❌ MySQL Connection Failed:', err);
    process.exit(1);
  }
  console.log('✅ Connected to MySQL');
  
  // Step 1: Find all users
  db.query('SELECT u.id, u.name, u.email FROM users u', (err, users) => {
    if (err) {
      console.log('Error finding users:', err);
      db.end();
      return;
    }
    
    console.log('\n📋 All users in database:');
    users.forEach(u => console.log(`  - ID ${u.id}: ${u.name} (${u.email})`));
    
    // Find Harsh Shah
    const harsh = users.find(u => u.name.toLowerCase().includes('harsh'));
    
    if (!harsh) {
      console.log('\n❌ Harsh Shah not found! Available users:', users.map(u => u.name));
      db.end();
      return;
    }
    
    console.log(`\n✅ Found Harsh Shah: ID ${harsh.id}, Name: ${harsh.name}`);
    
    // Generate nearby location
    const harshLocation = getNearbyLocation(kushalLat, kushalLng, 0.8);
    console.log(`\n📍 Kushal's location: ${kushalLat}, ${kushalLng}`);
    console.log(`📍 Setting Harsh's location to: ${harshLocation.lat.toFixed(6)}, ${harshLocation.lng.toFixed(6)}`);
    
    // Step 2: Check if Harsh has a donor profile
    db.query('SELECT * FROM donor_profiles WHERE user_id = ?', [harsh.id], (err, profiles) => {
      if (err) {
        console.log('Error checking donor profile:', err);
        db.end();
        return;
      }
      
      if (profiles.length === 0) {
        // Create donor profile for Harsh
        console.log('\n⚠️ No donor profile found for Harsh. Creating one...');
        
        const insertQuery = `
          INSERT INTO donor_profiles (user_id, phone, blood_group, city, latitude, longitude, total_donations, available_for_donation, response_rate, impact_score)
          VALUES (?, '9876543210', 'AB+', 'Noida', ?, ?, 15, 1, 95, 200)
        `;
        
        db.query(insertQuery, [harsh.id, harshLocation.lat, harshLocation.lng], (err) => {
          if (err) {
            console.log('Error creating donor profile:', err);
          } else {
            console.log('✅ Created donor profile for Harsh Shah!');
            console.log('   - Blood Group: AB+');
            console.log('   - Location: Near Kushal');
            console.log('   - Available: Yes');
            console.log('   - Total Donations: 15');
            console.log('   - Response Rate: 95%');
          }
          db.end();
        });
      } else {
        // Update existing profile
        console.log('\n📝 Updating existing donor profile...');
        console.log('   Current blood group:', profiles[0].blood_group);
        
        const updateQuery = `
          UPDATE donor_profiles 
          SET latitude = ?, 
              longitude = ?, 
              blood_group = 'AB+',
              available_for_donation = 1,
              total_donations = GREATEST(total_donations, 15),
              response_rate = GREATEST(response_rate, 95),
              impact_score = GREATEST(impact_score, 200)
          WHERE user_id = ?
        `;
        
        db.query(updateQuery, [harshLocation.lat, harshLocation.lng, harsh.id], (err) => {
          if (err) {
            console.log('Error updating donor profile:', err);
          } else {
            console.log('✅ Updated Harsh Shah\'s donor profile!');
            console.log('   - Blood Group: AB+ (can donate to AB+)');
            console.log(`   - Location: ${harshLocation.lat.toFixed(6)}, ${harshLocation.lng.toFixed(6)}`);
            console.log('   - Available: Yes');
            console.log('   - Distance from Kushal: ~0.5-1km');
          }
          db.end();
        });
      }
    });
  });
});
