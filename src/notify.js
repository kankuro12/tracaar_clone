// Out-of-band alert delivery: email (SMTP) + generic SMS/webhook. Both optional —
// configured via env + per-customer fields. Delivery failure is logged, never fatal.
const nodemailer = require('nodemailer');

let transporter = null;
function mailer() {
  if (!transporter && process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: +process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

async function notifyAlert(alert, customer) {
  const { pool } = require('./db');
  if (!customer) {
    const r = await pool.query('SELECT alert_email, alert_webhook FROM customers WHERE id = $1', [alert.customer_id]);
    customer = r.rows[0] || {};
  }
  const text = `${alert.message} at (${(alert.lat ?? 0).toFixed(5)}, ${(alert.lon ?? 0).toFixed(5)}) — ${alert.created_at.toISOString()}`;

  if (customer.alert_email && mailer()) {
    try {
      await mailer().sendMail({
        from: process.env.SMTP_FROM || `fleet@${process.env.SMTP_HOST}`,
        to: customer.alert_email,
        subject: `Fleet alert: ${alert.message}`,
        text,
      });
    } catch (e) { console.error(`notify: email failed: ${e.message}`); }
  }

  if (customer.alert_webhook) {
    try {
      await fetch(customer.alert_webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: alert.type,
          message: alert.message,
          vehicleId: alert.vehicle_id,
          geofenceId: alert.geofence_id,
          lat: alert.lat,
          lon: alert.lon,
          at: alert.created_at,
        }),
      });
    } catch (e) { console.error(`notify: webhook failed: ${e.message}`); }
  }
}

module.exports = { notifyAlert };
