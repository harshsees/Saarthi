const mysql = require("mysql");
const bcrypt = require("bcrypt");

// Database connection
const db = mysql.createConnection({
  host: "127.0.0.1",
  user: "root",
  password: "123456",
  database: "saarthi",
  port: 3300
});

// Indian names data
const firstNames = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Ayaan", "Krishna", "Ishaan",
  "Shaurya", "Atharv", "Advait", "Rudra", "Dhruv", "Kabir", "Ansh", "Veer", "Yash", "Rohan",
  "Aryan", "Arnav", "Dev", "Lakshya", "Rishi", "Harsh", "Pranav", "Tanish", "Kartik", "Neil",
  "Aanya", "Aadhya", "Saanvi", "Diya", "Myra", "Ananya", "Isha", "Pari", "Navya", "Anika",
  "Kiara", "Avni", "Priya", "Riya", "Shreya", "Kavya", "Sara", "Nisha", "Pooja", "Meera",
  "Sneha", "Anjali", "Divya", "Neha", "Radhika", "Tanya", "Suhana", "Kritika", "Mansi", "Prachi",
  "Rahul", "Vikram", "Amit", "Suresh", "Ramesh", "Deepak", "Manoj", "Anil", "Vijay", "Sanjay",
  "Rajesh", "Prakash", "Ashok", "Dinesh", "Sunil", "Mukesh", "Rakesh", "Satish", "Naresh", "Mahesh",
  "Sunita", "Geeta", "Rekha", "Seema", "Kiran", "Suman", "Poonam", "Lata", "Usha", "Asha",
  "Mohit", "Nikhil", "Kunal", "Varun", "Akash", "Gaurav", "Mayank", "Abhishek", "Manish", "Sachin"
];

const lastNames = [
  "Sharma", "Verma", "Singh", "Kumar", "Patel", "Gupta", "Jain", "Shah", "Mehta", "Agarwal",
  "Reddy", "Rao", "Nair", "Menon", "Pillai", "Iyer", "Iyengar", "Krishnan", "Rajan", "Nambiar",
  "Das", "Roy", "Dutta", "Ghosh", "Sen", "Basu", "Chakraborty", "Banerjee", "Mukherjee", "Chatterjee",
  "Patil", "Desai", "Joshi", "Kulkarni", "Deshpande", "Karve", "Gokhale", "Sathe", "Apte", "Bhave",
  "Mishra", "Pandey", "Tiwari", "Dubey", "Tripathi", "Shukla", "Srivastava", "Saxena", "Rastogi", "Awasthi",
  "Chaudhary", "Thakur", "Yadav", "Maurya", "Chauhan", "Rathore", "Rajput", "Solanki", "Parmar", "Gohil",
  "Nayak", "Shetty", "Hegde", "Kamath", "Pai", "Bhat", "Acharya", "Shenoy", "Ballal", "Prabhu"
];

// Indian cities with approximate coordinates
const cities = [
  { name: "Mumbai", lat: 19.0760, lng: 72.8777 },
  { name: "Delhi", lat: 28.7041, lng: 77.1025 },
  { name: "Bangalore", lat: 12.9716, lng: 77.5946 },
  { name: "Hyderabad", lat: 17.3850, lng: 78.4867 },
  { name: "Chennai", lat: 13.0827, lng: 80.2707 },
  { name: "Kolkata", lat: 22.5726, lng: 88.3639 },
  { name: "Pune", lat: 18.5204, lng: 73.8567 },
  { name: "Ahmedabad", lat: 23.0225, lng: 72.5714 },
  { name: "Jaipur", lat: 26.9124, lng: 75.7873 },
  { name: "Lucknow", lat: 26.8467, lng: 80.9462 },
  { name: "Kanpur", lat: 26.4499, lng: 80.3319 },
  { name: "Nagpur", lat: 21.1458, lng: 79.0882 },
  { name: "Indore", lat: 22.7196, lng: 75.8577 },
  { name: "Thane", lat: 19.2183, lng: 72.9781 },
  { name: "Bhopal", lat: 23.2599, lng: 77.4126 },
  { name: "Visakhapatnam", lat: 17.6868, lng: 83.2185 },
  { name: "Patna", lat: 25.5941, lng: 85.1376 },
  { name: "Vadodara", lat: 22.3072, lng: 73.1812 },
  { name: "Ghaziabad", lat: 28.6692, lng: 77.4538 },
  { name: "Ludhiana", lat: 30.9010, lng: 75.8573 },
  { name: "Agra", lat: 27.1767, lng: 78.0081 },
  { name: "Nashik", lat: 20.0063, lng: 73.7807 },
  { name: "Faridabad", lat: 28.4089, lng: 77.3178 },
  { name: "Meerut", lat: 28.9845, lng: 77.7064 },
  { name: "Rajkot", lat: 22.3039, lng: 70.8022 },
  { name: "Varanasi", lat: 25.3176, lng: 82.9739 },
  { name: "Srinagar", lat: 34.0837, lng: 74.7973 },
  { name: "Aurangabad", lat: 19.8762, lng: 75.3433 },
  { name: "Dhanbad", lat: 23.7957, lng: 86.4304 },
  { name: "Amritsar", lat: 31.6340, lng: 74.8723 },
  { name: "Noida", lat: 28.5355, lng: 77.3910 },
  { name: "Ranchi", lat: 23.3441, lng: 85.3096 },
  { name: "Guwahati", lat: 26.1445, lng: 91.7362 },
  { name: "Chandigarh", lat: 30.7333, lng: 76.7794 },
  { name: "Coimbatore", lat: 11.0168, lng: 76.9558 },
  { name: "Mysore", lat: 12.2958, lng: 76.6394 },
  { name: "Kochi", lat: 9.9312, lng: 76.2673 },
  { name: "Trivandrum", lat: 8.5241, lng: 76.9366 },
  { name: "Bhubaneswar", lat: 20.2961, lng: 85.8245 },
  { name: "Dehradun", lat: 30.3165, lng: 78.0322 }
];

const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

// Helper functions
function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generatePhone() {
  const prefixes = ["98", "97", "96", "95", "94", "93", "91", "90", "89", "88", "87", "86", "85", "84", "83", "82", "81", "80", "79", "78", "77", "76", "75", "74", "73", "72", "70"];
  return getRandomElement(prefixes) + String(getRandomInt(10000000, 99999999));
}

function generateEmail(firstName, lastName, index) {
  const variations = [
    `${firstName.toLowerCase()}.${lastName.toLowerCase()}${index}`,
    `${firstName.toLowerCase()}${lastName.toLowerCase()}${index}`,
    `${firstName.toLowerCase()}_${lastName.toLowerCase()}${index}`,
    `${firstName.toLowerCase()}${getRandomInt(1, 999)}`,
    `${lastName.toLowerCase()}.${firstName.toLowerCase()}${index}`
  ];
  return `${getRandomElement(variations)}@gmail.com`;
}

function generateLastDonationDate() {
  // Random date between 3 months ago and 2 years ago
  const now = new Date();
  const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const twoYearsAgo = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
  
  const randomTime = twoYearsAgo.getTime() + Math.random() * (threeMonthsAgo.getTime() - twoYearsAgo.getTime());
  const date = new Date(randomTime);
  
  return date.toISOString().split('T')[0];
}

function addRandomOffset(lat, lng, kmRadius = 15) {
  // Add random offset within kmRadius kilometers
  const earthRadius = 6371;
  const maxDegrees = kmRadius / earthRadius * (180 / Math.PI);
  
  const latOffset = (Math.random() - 0.5) * 2 * maxDegrees;
  const lngOffset = (Math.random() - 0.5) * 2 * maxDegrees;
  
  return {
    lat: parseFloat((lat + latOffset).toFixed(6)),
    lng: parseFloat((lng + lngOffset).toFixed(6))
  };
}

async function seedData() {
  const TOTAL_USERS = 1800; // Generate 1800 entries
  const hashedPassword = await bcrypt.hash("Test@123", 10);
  
  console.log("🚀 Starting data seeding...");
  console.log(`📊 Generating ${TOTAL_USERS} users and donor profiles...`);
  
  let successCount = 0;
  let errorCount = 0;
  
  // Process in batches
  const BATCH_SIZE = 100;
  
  for (let batch = 0; batch < Math.ceil(TOTAL_USERS / BATCH_SIZE); batch++) {
    const batchStart = batch * BATCH_SIZE;
    const batchEnd = Math.min(batchStart + BATCH_SIZE, TOTAL_USERS);
    
    const promises = [];
    
    for (let i = batchStart; i < batchEnd; i++) {
      const firstName = getRandomElement(firstNames);
      const lastName = getRandomElement(lastNames);
      const name = `${firstName} ${lastName}`;
      const email = generateEmail(firstName, lastName, i);
      
      const city = getRandomElement(cities);
      const coords = addRandomOffset(city.lat, city.lng);
      
      const phone = generatePhone();
      const bloodGroup = getRandomElement(bloodGroups);
      const totalDonations = getRandomInt(0, 10);
      const lastDonationDate = totalDonations === 0 ? null : generateLastDonationDate();
      const availableForDonation = Math.random() > 0.3 ? 1 : 0; // 70% available
      
      // Response rate: higher donations = higher response rate (40-100%)
      const responseRate = Math.min(100, parseFloat((40 + (totalDonations * 5) + (Math.random() * 20)).toFixed(2)));
      
      // Impact score calculation:
      // - Past donations: 10 points each
      // - Accepted requests: Normal=5, Urgent=10, Critical=20
      const baseDonationPoints = totalDonations * 10;
      const simulatedNormalAccepts = getRandomInt(0, totalDonations);
      const simulatedUrgentAccepts = getRandomInt(0, Math.floor(totalDonations / 2));
      const simulatedCriticalAccepts = getRandomInt(0, Math.floor(totalDonations / 3));
      const acceptedPoints = (simulatedNormalAccepts * 5) + (simulatedUrgentAccepts * 10) + (simulatedCriticalAccepts * 20);
      const impactScore = baseDonationPoints + acceptedPoints;
      
      const promise = new Promise((resolve) => {
        // Insert user
        db.query(
          "INSERT INTO users (name, email, password, is_verified) VALUES (?, ?, ?, ?)",
          [name, email, hashedPassword, 1],
          (err, userResult) => {
            if (err) {
              errorCount++;
              resolve();
              return;
            }
            
            const userId = userResult.insertId;
            
            // Insert donor profile
            db.query(
              "INSERT INTO donor_profiles (user_id, phone, blood_group, city, last_donation_date, total_donations, available_for_donation, latitude, longitude, response_rate, impact_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              [userId, phone, bloodGroup, city.name, lastDonationDate, totalDonations, availableForDonation, coords.lat, coords.lng, responseRate, impactScore],
              (err) => {
                if (err) {
                  errorCount++;
                } else {
                  successCount++;
                }
                resolve();
              }
            );
          }
        );
      });
      
      promises.push(promise);
    }
    
    await Promise.all(promises);
    console.log(`✅ Batch ${batch + 1}/${Math.ceil(TOTAL_USERS / BATCH_SIZE)} completed (${batchEnd}/${TOTAL_USERS} users)`);
  }
  
  console.log("\n========================================");
  console.log("🎉 Data seeding completed!");
  console.log(`✅ Successfully created: ${successCount} users with donor profiles`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log("========================================");
  
  // Print some statistics
  db.query("SELECT blood_group, COUNT(*) as count FROM donor_profiles GROUP BY blood_group", (err, results) => {
    if (!err) {
      console.log("\n📊 Blood Group Distribution:");
      results.forEach(row => {
        console.log(`   ${row.blood_group}: ${row.count} donors`);
      });
    }
    
    db.query("SELECT city, COUNT(*) as count FROM donor_profiles GROUP BY city ORDER BY count DESC LIMIT 10", (err, results) => {
      if (!err) {
        console.log("\n📍 Top 10 Cities by Donor Count:");
        results.forEach(row => {
          console.log(`   ${row.city}: ${row.count} donors`);
        });
      }
      
      db.query("SELECT COUNT(*) as available FROM donor_profiles WHERE available_for_donation = 1", (err, results) => {
        if (!err) {
          console.log(`\n🩸 Available for donation: ${results[0].available} donors`);
        }
        
        db.end(() => {
          console.log("\n✅ Database connection closed.");
          process.exit(0);
        });
      });
    });
  });
}

// Connect and run
db.connect((err) => {
  if (err) {
    console.log("❌ MySQL Connection Failed:", err);
    process.exit(1);
  }
  console.log("✅ MySQL Connected");
  seedData();
});
