'use strict';

const nodemailer = require('nodemailer');
const { config } = require('./config');

let transport;

function getTransport() {
  const { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPassword } = config.email;
  if (!smtpHost || !config.email.from) throw new Error('SMTP_HOST and MAIL_FROM must be configured');
  if (!transport) {
    transport = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      ...(smtpUser ? { auth: { user: smtpUser, pass: smtpPassword } } : {}),
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });
  }
  return transport;
}

async function sendPasswordReset(email, url) {
  return getTransport().sendMail({
    from: config.email.from,
    to: email,
    subject: 'Reset your Alabiq password',
    text: `Use this one-time link to reset your password. It expires in one hour:\n\n${url}\n`,
    html: `<p>Use this one-time link to reset your password. It expires in one hour:</p><p><a href="${url}">Reset password</a></p>`,
  });
}

module.exports = { sendPasswordReset, getTransport };
