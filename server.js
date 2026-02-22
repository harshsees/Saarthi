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

// Send OTP email transporter 
    await transporter.sendMail({
      from: '"Saarthi" <shah001harsh@gmail.com>',
      to: email,
      subject: "Verify Your Account",
      html: `<h2>Your OTP is ${otp}</h2>`
    });

    res.json({ success: true });
  });
});
transporter.verify(function (error, success) {
  if (error) {
    console.log("SMTP ERROR:", error);
  } else {
    console.log("SMTP Server is ready to send messages");
  }
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

    res.json({ success: true });
  });
});
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
