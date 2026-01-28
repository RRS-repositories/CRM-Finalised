
// Email Service - communicates with local backend (server.js) to send real emails via SMTP
import { API_ENDPOINTS } from '../src/config';

const BACKEND_URL = API_ENDPOINTS.base;

// Helper to generate the HTML wrapper
const getHtmlTemplate = (title: string, content: string) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
    .header { background-color: #0D1B2A; padding: 30px 20px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 0.5px; font-weight: 600; }
    .header p { color: #F18F01; margin: 8px 0 0; font-size: 13px; text-transform: uppercase; letter-spacing: 2px; font-weight: 500; }
    .content { padding: 40px 30px; color: #334155; line-height: 1.6; }
    .footer { background-color: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
    .button { display: inline-block; background-color: #0D1B2A; color: #ffffff !important; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 20px; }
    .code-box { background-color: #f1f5f9; border: 2px dashed #cbd5e1; padding: 20px; text-align: center; font-size: 32px; font-family: monospace; font-weight: bold; color: #0D1B2A; letter-spacing: 8px; margin: 20px 0; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Rowan Rose Solicitors</h1>
      <p>Secure Client Portal</p>
    </div>
    <div class="content">
      <h2 style="color: #0D1B2A; margin-top: 0;">${title}</h2>
      ${content}
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Rowan Rose Solicitors. All rights reserved.</p>
      <p>This is an automated message. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>
`;

export const emailService = {
  /**
   * Sends a verification email (HTML).
   */
  sendVerificationEmail: async (toEmail: string, code: string) => {
    const subject = "Verify Your Sign-In – Rowan Rose Solicitors";

    const htmlContent = `
      <p>Dear Valued Client,</p>
      <p>Thank you for signing in to Rowan Rose Solicitors. We are committed to providing clear, reliable, and client-focused legal support.</p>
      <p>To complete your sign-in and ensure your account security, please use the verification code below:</p>
      
      <div class="code-box">${code}</div>
      
      <p>Please enter this code on the verification screen. This code is valid for <strong>5 minutes</strong>.</p>
      <p>If you did not attempt to sign in, please ignore this email or contact us immediately.</p>
      <p>Warm regards,<br/><strong>Rowan Rose Solicitors</strong></p>
    `;

    const fullHtml = getHtmlTemplate("Verification Required", htmlContent);

    try {
      console.log(`Sending Verification Email to ${toEmail}...`);

      const response = await fetch(`${BACKEND_URL}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toEmail,
          subject: subject,
          html: fullHtml,
          text: `Your Verification Code is: ${code}` // Fallback
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Server Error: ${response.status}`);
      }

      console.log('✅ Verification email sent.');
      return true;

    } catch (error) {
      console.error("❌ Failed to send verification email:", error);
      // Email server connection failed - user should ensure server.js is running
      return false;
    }
  },

  /**
   * Sends a password reset email (HTML).
   */
  sendPasswordResetEmail: async (toEmail: string, resetLink: string) => {
    const subject = "Password Reset Request - Rowan Rose Solicitors";

    const htmlContent = `
      <p>Dear Valued Client,</p>
      <p>We received a request to reset the password for your account.</p>
      <p>Please click the URL below to set a new secure password:</p>
      
      <p style="background-color: #f1f5f9; padding: 15px; border-radius: 8px; word-break: break-all; font-size: 13px; color: #334155;">
        <a href="${resetLink}" style="color: #0D1B2A; text-decoration: underline;">${resetLink}</a>
      </p>
      
      <p style="margin-top: 20px;">This link is time-limited. If you did not request this, please ignore this email.</p>
      <p>Warm regards,<br/><strong>Rowan Rose Solicitors</strong></p>
    `;

    const fullHtml = getHtmlTemplate("Reset Password", htmlContent);

    try {
      console.log(`Sending Reset Email to ${toEmail}...`);

      const response = await fetch(`${BACKEND_URL}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toEmail,
          subject: subject,
          html: fullHtml, // Send HTML
          text: `Please click here to reset your password: ${resetLink}` // Fallback
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Server Error: ${response.status}`);
      }

      console.log('✅ Password reset email sent.');
      return true;

    } catch (error) {
      console.error("❌ Failed to send reset email:", error);
      // Email server connection failed - user should ensure server.js is running
      return false;
    }
  }
};
