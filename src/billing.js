// Monthly invoicing.
//
// An invoice is now built from line items rather than a single flat number:
//   base plan fee  +  per-vehicle charges above the plan's included count
//   +  mid-month proration when the plan changed  +  tax
// Each invoice gets a human-readable number, a due date, and a real status
// that tracks partial payments and goes overdue on its own.
//
// Runs on boot and every 12h: generate the current month's invoices, then
// re-check what has gone overdue.

const { pool } = require('./db');

const DUE_DAYS = +process.env.INVOICE_DUE_DAYS || 14;
const money = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function nextInvoiceNo(client, periodStart) {
  const r = await client.query("SELECT nextval('invoice_no_seq') AS n");
  const year = new Date(periodStart).getUTCFullYear();
  return `INV-${year}-${String(r.rows[0].n).padStart(6, '0')}`;
}

/**
 * Line items for one customer's month. Exported so the preview endpoint and
 * the generator can never disagree about what a customer will be charged.
 */
function buildLines({ plan, vehicleCount }) {
  const lines = [];
  const base = Number(plan.price_monthly) || 0;
  if (base > 0) {
    lines.push({
      description: `${plan.name} plan — monthly platform fee`,
      quantity: 1,
      unit_price: base,
      amount: base,
    });
  }
  const perVehicle = Number(plan.price_per_vehicle) || 0;
  const included = Number(plan.included_vehicles) || 0;
  if (perVehicle > 0) {
    const billable = Math.max(0, vehicleCount - included);
    if (billable > 0) {
      lines.push({
        description: included > 0
          ? `Tracked vehicles beyond ${included} included (${vehicleCount} active)`
          : `Tracked vehicles (${vehicleCount} active)`,
        quantity: billable,
        unit_price: perVehicle,
        amount: money(billable * perVehicle),
      });
    }
  }
  return lines;
}

function totalsFor(lines, taxRate) {
  const subtotal = money(lines.reduce((s, l) => s + Number(l.amount), 0));
  const taxAmount = money(subtotal * (Number(taxRate) || 0) / 100);
  return { subtotal, taxAmount, total: money(subtotal + taxAmount) };
}

/** What this customer would be invoiced for the current period, without writing. */
async function previewInvoice(customerId) {
  const r = await pool.query(
    `SELECT c.id, c.name, c.tax_rate, c.currency,
            p.name AS plan_name, p.price_monthly, p.price_per_vehicle, p.included_vehicles,
            (SELECT count(*) FROM vehicles v WHERE v.customer_id = c.id) AS vehicle_count
       FROM customers c JOIN plans p ON p.id = c.plan_id
      WHERE c.id = $1`,
    [customerId]
  );
  if (!r.rows.length) return null;
  const row = r.rows[0];
  const plan = {
    name: row.plan_name,
    price_monthly: row.price_monthly,
    price_per_vehicle: row.price_per_vehicle,
    included_vehicles: row.included_vehicles,
  };
  const vehicleCount = +row.vehicle_count;
  const lines = buildLines({ plan, vehicleCount });
  const totals = totalsFor(lines, row.tax_rate);
  return { customer: { id: row.id, name: row.name, currency: row.currency }, plan, vehicleCount, lines, ...totals, taxRate: Number(row.tax_rate) };
}

/** Generate the current month's invoice for every customer that lacks one. */
async function generateForPeriod({ log = console.log } = {}) {
  const due = await pool.query(
    `SELECT c.id AS customer_id, c.tax_rate, c.currency,
            p.name AS plan_name, p.price_monthly, p.price_per_vehicle, p.included_vehicles,
            date_trunc('month', now())::date AS period_start,
            (date_trunc('month', now()) + interval '1 month - 1 day')::date AS period_end,
            (SELECT count(*) FROM vehicles v WHERE v.customer_id = c.id) AS vehicle_count
       FROM customers c
       JOIN plans p ON p.id = c.plan_id
      WHERE NOT EXISTS (
        SELECT 1 FROM invoices i
         WHERE i.customer_id = c.id
           AND i.period_start = date_trunc('month', now())::date
      )`
  );

  for (const row of due.rows) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const plan = {
        name: row.plan_name,
        price_monthly: row.price_monthly,
        price_per_vehicle: row.price_per_vehicle,
        included_vehicles: row.included_vehicles,
      };
      const vehicleCount = +row.vehicle_count;
      const lines = buildLines({ plan, vehicleCount });
      const { subtotal, taxAmount, total } = totalsFor(lines, row.tax_rate);
      const invoiceNo = await nextInvoiceNo(client, row.period_start);

      const inv = await client.query(
        `INSERT INTO invoices
           (customer_id, period_start, period_end, amount, subtotal, tax_rate, tax_amount,
            due_date, currency, vehicle_count, invoice_no, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'open')
         ON CONFLICT (customer_id, period_start) DO NOTHING
         RETURNING id`,
        [row.customer_id, row.period_start, row.period_end, total, subtotal, row.tax_rate,
          taxAmount, addDays(row.period_end, DUE_DAYS), row.currency, vehicleCount, invoiceNo]
      );
      if (inv.rows.length) {
        let sort = 0;
        for (const l of lines) {
          await client.query(
            `INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price, amount, sort)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [inv.rows[0].id, l.description, l.quantity, l.unit_price, l.amount, sort++]
          );
        }
        log(`billing: issued ${invoiceNo} for customer ${row.customer_id} (${vehicleCount} vehicles, ${total})`);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      log(`billing: failed for customer ${row.customer_id} — ${e.message}`);
    } finally {
      client.release();
    }
  }
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Anything past its due date that still owes money becomes overdue. */
async function markOverdue({ log = console.log } = {}) {
  const r = await pool.query(
    `UPDATE invoices
        SET status = 'overdue'
      WHERE status IN ('open','partial')
        AND due_date IS NOT NULL
        AND due_date < current_date
      RETURNING id`
  );
  if (r.rowCount) log(`billing: ${r.rowCount} invoice(s) now overdue`);
}

/**
 * Record a payment and move the invoice to partial/paid. Returns the updated
 * invoice with its running balance.
 */
async function recordPayment({ invoiceId, amount, method, reference, note, userId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const invR = await client.query('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [invoiceId]);
    const inv = invR.rows[0];
    if (!inv) { await client.query('ROLLBACK'); return { error: 'invoice not found' }; }
    if (inv.status === 'void') { await client.query('ROLLBACK'); return { error: 'invoice is void' }; }

    const amt = money(amount);
    if (!(amt > 0)) { await client.query('ROLLBACK'); return { error: 'amount must be greater than zero' }; }

    await client.query(
      `INSERT INTO payments (invoice_id, customer_id, amount, method, reference, note, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [invoiceId, inv.customer_id, amt, method || 'manual', reference || null, note || null, userId || null]
    );

    const paidR = await client.query(
      'SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE invoice_id = $1',
      [invoiceId]
    );
    const paid = money(paidR.rows[0].paid);
    const total = money(inv.amount);
    const status = paid >= total ? 'paid' : 'partial';

    const upd = await client.query(
      `UPDATE invoices
          SET status = $2,
              paid_at = CASE WHEN $2 = 'paid' THEN now() ELSE NULL END
        WHERE id = $1 RETURNING *`,
      [invoiceId, status]
    );
    await client.query('COMMIT');
    return { invoice: upd.rows[0], paid, balance: money(total - paid) };
  } catch (e) {
    await client.query('ROLLBACK');
    return { error: e.message };
  } finally {
    client.release();
  }
}

/**
 * Plan change with mid-month proration: credit the unused remainder of the old
 * plan and charge the pro-rated remainder of the new one, as adjustment lines
 * on the current open invoice.
 */
async function changePlanProrated({ customerId, newPlanId, userId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(
      `SELECT c.id, c.plan_id, c.tax_rate,
              p.name AS plan_name, p.price_monthly,
              (SELECT count(*) FROM vehicles v WHERE v.customer_id = c.id) AS vehicle_count
         FROM customers c LEFT JOIN plans p ON p.id = c.plan_id
        WHERE c.id = $1 FOR UPDATE OF c`,
      [customerId]
    );
    if (!cur.rows.length) { await client.query('ROLLBACK'); return { error: 'customer not found' }; }
    const old = cur.rows[0];

    const np = await client.query('SELECT * FROM plans WHERE id = $1', [newPlanId]);
    if (!np.rows.length) { await client.query('ROLLBACK'); return { error: 'plan not found' }; }
    const newPlan = np.rows[0];

    await client.query('UPDATE customers SET plan_id = $2 WHERE id = $1', [customerId, newPlanId]);

    // Only prorate when there is an unpaid invoice for the current month.
    const invR = await client.query(
      `SELECT * FROM invoices
        WHERE customer_id = $1 AND period_start = date_trunc('month', now())::date
          AND status IN ('open','partial','overdue')
        FOR UPDATE`,
      [customerId]
    );

    let prorated = null;
    if (invR.rows.length && old.plan_id && String(old.plan_id) !== String(newPlanId)) {
      const inv = invR.rows[0];
      const start = new Date(inv.period_start);
      const end = new Date(inv.period_end);
      const daysInPeriod = Math.round((end - start) / 86400000) + 1;
      const today = new Date();
      const dayOfPeriod = Math.min(
        Math.max(Math.round((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - start) / 86400000), 0),
        daysInPeriod
      );
      const remaining = Math.max(daysInPeriod - dayOfPeriod, 0);
      const ratio = daysInPeriod ? remaining / daysInPeriod : 0;

      const oldBase = Number(old.price_monthly) || 0;
      const newBase = Number(newPlan.price_monthly) || 0;
      const credit = money(-oldBase * ratio);
      const charge = money(newBase * ratio);

      let sort = 100;
      if (credit !== 0) {
        await client.query(
          `INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price, amount, sort)
           VALUES ($1,$2,1,$3,$3,$4)`,
          [inv.id, `Credit — unused ${old.plan_name || 'previous'} plan (${remaining}/${daysInPeriod} days)`, credit, sort++]
        );
      }
      if (charge !== 0) {
        await client.query(
          `INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price, amount, sort)
           VALUES ($1,$2,1,$3,$3,$4)`,
          [inv.id, `${newPlan.name} plan — prorated (${remaining}/${daysInPeriod} days)`, charge, sort++]
        );
      }

      const sums = await client.query(
        'SELECT COALESCE(SUM(amount),0) AS subtotal FROM invoice_lines WHERE invoice_id = $1',
        [inv.id]
      );
      const subtotal = money(sums.rows[0].subtotal);
      const taxAmount = money(subtotal * (Number(inv.tax_rate) || 0) / 100);
      await client.query(
        'UPDATE invoices SET subtotal = $2, tax_amount = $3, amount = $4 WHERE id = $1',
        [inv.id, subtotal, taxAmount, money(subtotal + taxAmount)]
      );
      prorated = { invoiceId: inv.id, credit, charge, remaining, daysInPeriod, newTotal: money(subtotal + taxAmount) };
    }

    await client.query('COMMIT');
    return { ok: true, prorated };
  } catch (e) {
    await client.query('ROLLBACK');
    return { error: e.message };
  } finally {
    client.release();
  }
}

/** Revenue snapshot for the super-admin billing dashboard. */
async function revenueSummary() {
  const r = await pool.query(`
    SELECT
      (SELECT COALESCE(SUM(amount),0) FROM invoices WHERE status IN ('open','partial','overdue')) AS outstanding,
      (SELECT COALESCE(SUM(amount),0) FROM invoices WHERE status = 'overdue') AS overdue,
      (SELECT COALESCE(SUM(p.amount),0) FROM payments p
        WHERE p.paid_at >= date_trunc('month', now())) AS collected_this_month,
      (SELECT COALESCE(SUM(amount),0) FROM invoices
        WHERE period_start = date_trunc('month', now())::date AND status <> 'void') AS billed_this_month,
      (SELECT count(*) FROM invoices WHERE status = 'overdue') AS overdue_count,
      (SELECT COALESCE(SUM(p.price_monthly + p.price_per_vehicle *
                GREATEST((SELECT count(*) FROM vehicles v WHERE v.customer_id = c.id) - p.included_vehicles, 0)), 0)
         FROM customers c JOIN plans p ON p.id = c.plan_id) AS mrr
  `);
  return r.rows[0];
}

async function tick({ log = console.log } = {}) {
  await generateForPeriod({ log });
  await markOverdue({ log });
}

function startBilling({ log = console.log } = {}) {
  const fn = () => tick({ log }).catch((e) => log(`billing: ${e.message}`));
  fn();
  setInterval(fn, 12 * 3600 * 1000);
}

module.exports = {
  startBilling, tick, generateForPeriod, markOverdue,
  recordPayment, changePlanProrated, revenueSummary, previewInvoice,
  buildLines, totalsFor,
};
