import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
  private transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  async sendBrandOtp(email: string, otp: string) {
     this.transporter.sendMail({
      from: 'no-reply@system.com',
      to: email,
      subject: 'Verify Your Brand Email (OTP)',
      text: `
Your OTP Code: ${otp}

This OTP will expire soon.

Please enter it to verify your brand registration.

If you did not request this, ignore this email.
      `,
    });
  }

  async sendTempPassword(email: string, tempPassword: string) {
     this.transporter.sendMail({
      from: 'no-reply@system.com',
      to: email,
      subject: 'Your Brand Account Password',
      text: `
Your brand account has been created successfully.

Login Credentials:
Email: ${email}
Password: ${tempPassword}

Please login and change your password immediately for security.

Do not share this password with anyone.
      `,
    });
  }
   async sendOtp(email: string, otp: string) {
     this.transporter.sendMail({
      from: 'no-reply@system.com',
      to: email,
      subject: 'Verify Your Brand Email (OTP)',
      text: `
Your OTP Code: ${otp}

This OTP will expire soon.

Please enter it to verify your account registration.

If you did not request this, ignore this email.
      `,
    });
  }
}
