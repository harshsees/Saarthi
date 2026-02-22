require("dotenv").config();
console.log("EMAIL:", process.env.EMAIL_USER);
console.log("PASS:", process.env.EMAIL_PASS);
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;

// Store OTP temporarily in memory
let otpStore = {};

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


// Send OTP

  app.post("/send-otp", async (req, res) => {
  console.log("SEND OTP HIT");
  console.log("BODY:", req.body);
  const { email } = req.body;

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  otpStore[email] = {
    otp,
    expires: Date.now() + 5 * 60 * 1000  // 5 minutes
  };

  try {
    await transporter.sendMail({
      from: `"Saarthi" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your Saarthi OTP",
      html: `
        <h2>Welcome to Saarthi</h2>
        <p>Your OTP is:</p>
        <h1>${otp}</h1>
        <p>This OTP is valid for 5 minutes.</p>
      `
    });

    res.json({ success: true });

  } catch (error) {
    console.log("EMAIL ERROR:", error.message);
    res.json({ success: false });
  }
});

// Verify OTP
app.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;

  const record = otpStore[email];

  if (!record) {
    return res.json({ success: false, message: "No OTP found" });
  }

  if (Date.now() > record.expires) {
    delete otpStore[email];
    return res.json({ success: false, message: "OTP expired" });
  }

  if (record.otp === otp) {
    delete otpStore[email];
    return res.json({ success: true });
  }

  res.json({ success: false, message: "Invalid OTP" });
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
