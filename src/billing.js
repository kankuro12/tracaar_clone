// Monthly invoice generation for customers with a plan. Runs on boot + every 12h.
// Missing current-month invoice -> create it at the plan's price.
// ponytail: no dunning/proration; status is just open/paid, payment is manual.

const { pool } = require('./db');

async function tick() {
  await pool.query(
    `INSERT INTO invoices (customer_id, period_start, period_end, amount)
     SELECT c.id,
            date_trunc('month', now())::date,
            (date_trunc('month', now()) + interval '1 month - 1 day')::date,
            p.price_monthly
     FROM customers c
     JOIN plans p ON p.id = c.plan_id
     WHERE NOT EXISTS (
       SELECT 1 FROM invoices i
       WHERE i.customer_id = c.id
         AND i.period_start = date_trunc('month', now())::date
     )
     ON CONFLICT (customer_id, period_start) DO NOTHING`
  );
}

function startBilling({ log = console.log }) {
  const fn = () => tick().catch((e) => log(`billing: ${e.message}`));
  fn();
  setInterval(fn, 12 * 3600 * 1000);
}

module.exports = { startBilling };
