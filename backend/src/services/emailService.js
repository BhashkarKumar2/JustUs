import axios from 'axios';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

// Global daily email counter
let dailyEmailCount = 0;
let lastResetDate = new Date().toDateString();
const MAX_DAILY_EMAILS = 280; // Leave 20 email buffer below Brevo's 300 limit

// Reset counter if it's a new day
const resetDailyCounterIfNeeded = () => {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    dailyEmailCount = 0;
    lastResetDate = today;
    console.log('✓ Daily email counter reset');
  }
};

export const sendVerificationEmail = async (email, name, code) => {
  try {
    // Reset counter if new day
    resetDailyCounterIfNeeded();

    // Check if daily limit reached
    if (dailyEmailCount >= MAX_DAILY_EMAILS) {
      console.error(`❌ Daily Brevo limit reached! (${dailyEmailCount}/${MAX_DAILY_EMAILS})`);
      console.log(`[LIMIT REACHED] Verification code for ${email}: ${code}`);
      return false;
    }

    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      console.warn('BREVO_API_KEY is not defined. Email sending skipped.');
      // For development without API key, log the code
      console.log(`[DEV] Verification code for ${email}: ${code}`);
      return true; // Pretend it worked
    }

    const data = {
      sender: {
        name: 'JustUs App',
        email: process.env.SENDER_EMAIL || 'no-reply@justus.app'
      },
      to: [
        {
          email: email,
          name: name
        }
      ],
      subject: 'Verify your JustUs account',
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #4F46E5;">JustUs</h1>
          </div>
          <p>Hi ${name},</p>
          <p>Thanks for joining JustUs! To complete your registration, please verify your email address by entering the code below:</p>
          <div style="background-color: #f3f4f6; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #4F46E5; font-size: 32px; letter-spacing: 5px; margin: 0;">${code}</h2>
          </div>
          <p>This code will expire in 15 minutes.</p>
          <p>If you didn't create an account, you can safely ignore this email.</p>
          <div style="margin-top: 30px; font-size: 12px; color: #888; text-align: center;">
            &copy; ${new Date().getFullYear()} JustUs App. All rights reserved.
          </div>
        </div>
      `
    };

    await axios.post(BREVO_API_URL, data, {
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    dailyEmailCount++;
    console.log(`✓ Verification email sent to ${email} (${dailyEmailCount}/${MAX_DAILY_EMAILS} today)`);
    return true;
  } catch (error) {
    console.error('Error sending email:', error.response?.data || error.message);
    return false;
  }
};

export const sendPasswordResetEmail = async (email, name, code) => {
  try {
    resetDailyCounterIfNeeded();

    if (dailyEmailCount >= MAX_DAILY_EMAILS) {
      console.error(`❌ Daily Brevo limit reached! (${dailyEmailCount}/${MAX_DAILY_EMAILS})`);
      console.log(`[LIMIT REACHED] Reset code for ${email}: ${code}`);
      return false;
    }

    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      console.warn('BREVO_API_KEY is not defined. Email sending skipped.');
      console.log(`[DEV] Reset code for ${email}: ${code}`);
      return true;
    }

    const data = {
      sender: {
        name: 'JustUs App',
        email: process.env.SENDER_EMAIL || 'no-reply@justus.app'
      },
      to: [{ email, name }],
      subject: 'Reset your JustUs password',
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #4F46E5;">JustUs</h1>
          </div>
          <p>Hi ${name},</p>
          <p>You requested to reset your password. Use the code below to complete the process:</p>
          <div style="background-color: #f3f4f6; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #4F46E5; font-size: 32px; letter-spacing: 5px; margin: 0;">${code}</h2>
          </div>
          <p>This code will expire in 1 hour.</p>
          <p>If you didn't request a password reset, you can safely ignore this email.</p>
          <div style="margin-top: 30px; font-size: 12px; color: #888; text-align: center;">
            &copy; ${new Date().getFullYear()} JustUs App. All rights reserved.
          </div>
        </div>
      `
    };

    await axios.post(BREVO_API_URL, data, {
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    dailyEmailCount++;
    console.log(`✓ Password reset email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('Error sending reset email:', error.response?.data || error.message);
    return false;
  }
};
