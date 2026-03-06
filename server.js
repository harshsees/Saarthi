// 1️⃣ Imports
require("dotenv").config();
console.log("EMAIL:", process.env.EMAIL_USER);
console.log("PASS:", process.env.EMAIL_PASS);
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const db = require("./db");

// 2️⃣ Create App
const app = express();
// 3️⃣ Middleware
app.use(express.json());
app.use(cors());


const PORT = 5000;


// Configure Gmail transporter
const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});







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

    console.log("SENDING FROM:", process.env.EMAIL_USER);
    
// Send OTP email transporter 
    try {
    await transporter.sendMail({
      from: '"Saarthi" <shah001harsh@gmail.com>',
      to: email,
      subject: "Verify Your Account",
      html: `<h2>Your OTP is ${otp}</h2>`
    });
    console.log("OTP EMAIL SENT TO:", email);
    res.json({ success: true });

    } catch (error) {
  console.log("EMAIL SEND ERROR:", error);
  res.json({ success: false, message: "Email sending failed" });
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
app.post("/complete-profile", (req,res)=>{

const {
userId,
phone,
bloodGroup,
city,
lastDonation,
totalDonations,
availability
} = req.body;

const available = availability === "true" ? 1 : 0;

db.query(

"INSERT INTO donor_profiles (user_id, phone, blood_group, city, last_donation_date, total_donations, available_for_donation) VALUES (?, ?, ?, ?, ?, ?, ?)",

[
userId,
phone,
bloodGroup,
city,
lastDonation,
totalDonations,
available
],

(err)=>{

if(err){

console.log(err);
return res.json({success:false});

}

res.json({success:true});

}

);

});
app.get("/get-profile/:userId", (req, res) => {

  const userId = req.params.userId;

  db.query(
    "SELECT users.name, users.email, donor_profiles.phone, donor_profiles.blood_group, donor_profiles.city, donor_profiles.last_donation_date, donor_profiles.total_donations, donor_profiles.available_for_donation FROM users JOIN donor_profiles ON users.id = donor_profiles.user_id WHERE users.id = ?",
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

// New endpoint to get profile by user ID
app.get("/get-profile/:userId", (req,res)=>{

const userId = req.params.userId;

db.query(
`SELECT users.name,
donor_profiles.phone,
donor_profiles.city,
donor_profiles.blood_group,
donor_profiles.last_donation_date,
donor_profiles.total_donations
FROM users
JOIN donor_profiles
ON users.id = donor_profiles.user_id
WHERE users.id = ?`,
[userId],
(err,result)=>{

if(err){
console.log(err);
return res.json({success:false});
}

res.json({
success:true,
profile: result[0]
});

});

});
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

