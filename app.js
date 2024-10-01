require('dotenv').config();
const { Pool } = require('pg');
const nodemailer = require('nodemailer');

const NOTIFY_RATE_STEP = 0.01;
const REQUEST_DELAY = 10000; // milliseconds

const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
});

async function startFetching() {
  while (true) {
    try {
      var todayHighestRate;

      const currentRate = await getJsonRate();

      insertRateIfNoRecordsToday(currentRate, 'PLNUSD', process.env.API_NAME)
        .then(() => {})
        .catch(error => console.error('Error in insertRateIfNoRecordsToday:', error));

      await getHighestRateToday()
              .then(rate => { todayHighestRate = rate })
              .catch(error => console.error('Error in getHighestRateToday:', error));

      if (isCurrentRateHigh(currentRate, todayHighestRate)) {
        insertRate(currentRate, 'PLNUSD', process.env.API_NAME)
          .then(() => {
            sendMail(currentRate);
            console.log(`${todayHighestRate} -> ${currentRate}`);
          })
          .catch(error => console.error('Error in insertRate:', error));
      } else {
        console.log(`Exchange Rate: ${currentRate}, todayHighestRate ${todayHighestRate}`, );
      }

    } catch (error) {
      console.error('Error:', error);
    }

    await timeout(REQUEST_DELAY);
  }
}

startFetching();

async function getJsonRate() {
  try {
    const response = await fetch(process.env.API_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
        'Referer': process.env.API_REFERER || 'https://www.google.com/',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json = await response.json();
    return json.bestOffers.forex_now;
  } catch (error) {
    console.error('Error fetching data:', error);
    throw error; // Rethrow the error to be handled by the caller
  }
}

function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getHighestRateToday() {
  try {
    const result = await pool.query(`
      SELECT MAX(rate) AS highest_rate
      FROM rates
      WHERE created_at >= CURRENT_DATE
        AND created_at < CURRENT_DATE + INTERVAL '1 day'
    `);

    return result.rows[0].highest_rate; // Access the result
  } catch (error) {
    console.error('Error fetching highest rate for today:', error);
    throw error;
  }
}

async function insertRateIfNoRecordsToday(rate, pair, resource) {
  const client = await pool.connect();

  try {
    const checkResult = await client.query(`
      SELECT 1 AS one
      FROM rates
      WHERE created_at >= CURRENT_DATE
        AND created_at < CURRENT_DATE + INTERVAL '1 day';
    `);

    if (checkResult.rows[0] && checkResult.rows[0].one === 1) {
      // console.log('Records for today already exist. No insertion made.');
    } else {
      await insertRate(rate, pair, resource);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error inserting rate:', error);
  } finally {
    client.release();
  }
}

async function insertRate(rate, pair, resource) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      INSERT INTO rates (rate, pair, resource)
      VALUES ($1, $2, $3);
    `, [rate, pair, resource]);

    await client.query('COMMIT');

    console.log('New rate inserted:', rate);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error inserting rate:', error);
  } finally {
    client.release();
  }
}

function truncateFloat(value, decimals) {
  const stringValue = value.toString();
  const [integerPart, decimalPart] = stringValue.split('.');

  return decimalPart ? `${integerPart}.${decimalPart.slice(0, decimals)}` : integerPart;
}

async function sendMail(rate) {
  const emailProvider = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  const message = `New rate PLNUSD ${rate}: $1000 = ${rate * 1000} zloty`;

  const email = await emailProvider.sendMail({
    from: `"RoboRate" <${process.env.SMTP_USER}>`,
    to: process.env.SMTP_USER,
    subject: 'RoboRate update',
    text: message,
    html: message,
  });

  console.log("Message sent: %s", email.messageId);
}

function isCurrentRateHigh(currentRate, todayHighestRate) {
  if (!todayHighestRate) return false;

  return Math.round(truncateFloat(currentRate, 2) * 100) - Math.round(truncateFloat(todayHighestRate, 2) * 100) >= Math.round(NOTIFY_RATE_STEP * 100);
}

process.on('exit', async () => {
  await pool.end();
  console.log('Pool has ended');
});
