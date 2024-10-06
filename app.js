require('dotenv').config();
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const path = require('path');

const NOTIFY_RATE_STEP = 0.01;
const REQUEST_DELAY = 10000; // milliseconds
const WORKING_HOUR_START = 7;
const WORKING_HOUR_END = 23;

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
      if (isWorkingHours()) {
        var todayHighestRate;

        const currentRate = await getJsonRate();

        insertRateIfNoRecordsToday(currentRate, 'PLNUSD', process.env.API_NAME)
          .then(() => {})
          .catch(error => console.error('Error in insertRateIfNoRecordsToday:', error));

        await getHighestRateToday()
                .then(rate => { todayHighestRate = rate })
                .catch(error => console.error('Error in getHighestRateToday:', error));

        if (isCurrentRateHigh(currentRate, todayHighestRate)) {
          sendMail(currentRate);
          console.log(`${todayHighestRate} -> ${currentRate}`);

          insertRate(currentRate, 'PLNUSD', process.env.API_NAME)
            .then(() => {})
            .catch(error => console.error('Error in insertRate:', error));
        } else {
          console.log(`Exchange Rate: ${currentRate}, todayHighestRate ${todayHighestRate}`, );
        }
      } else {
        console.log('Waiting for working time begin');
        await timeout(600000); // 10 minutes
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

  return decimalPart && decimals > 0 ? `${integerPart}.${decimalPart.slice(0, decimals)}` : integerPart;
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

  const messageText = `New rate: ${truncateFloat(rate, 4)} zł = $1`;

  const messageHtml = `
  <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style type="text/css">
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
        }
        .container {
          width: 100%;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .footer {
          text-align: center;
          color: gray;
          font-size: 12px;
          margin-top: 20px;
        }
        .logo {
          display: block;
          margin: 0 auto;
          width: 150px;
          height: 150px;
          border-radius: 100px;
        }
        h1 {
          text-align: center;
          color: #283a48;
        }
        h2 {
          text-align: center;
          color: #283a48;
        }
        h3 {
          text-align: center;
          color: #283a48;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${truncateFloat(rate, 4)} zł = $1</h2>
        <h2>${truncateFloat(rate * 100, 1)} zł = $100</h2>
        <h2>${truncateFloat(rate * 1000, 0)} zł = $1000</h2>
        <h3>Today the highest rate was updated</h3>
        <img src="cid:roborate_200x200" alt="RoboRate Logo" class="logo">
        <div class="footer">RoboRate</div>
      </div>
    </body>
  </html>
  `;

  const mailOptions = {
    from: `"RoboRate" <${process.env.SMTP_USER}>`,
    to: process.env.SMTP_USER,
    subject: 'RoboRate update',
    text: messageText,
    html: messageHtml,
    attachments: [
      {
          filename: 'roborate_200x200.webp',
          path: path.join(__dirname, 'roborate_200x200.webp'),
          cid: 'roborate_200x200',
      },
  ],
  };

  emailProvider.sendMail(mailOptions, (error, info) => {
    if (error) {
      return console.log(error);
    }

    console.log('Email sent: ' + info.response);
  });

  // console.log("Message sent: %s", email.messageId);
}

function isCurrentRateHigh(currentRate, todayHighestRate) {
  if (!todayHighestRate) return false;

  return Math.round(truncateFloat(currentRate, 2) * 100) - Math.round(truncateFloat(todayHighestRate, 2) * 100) >= Math.round(NOTIFY_RATE_STEP * 100);
}

function isWorkingHours() {
  const now = new Date();
  const hours = now.getHours();
  const dayOfWeek = now.getDay();

  return (
    hours >= WORKING_HOUR_START &&
      hours < WORKING_HOUR_END &&
      dayOfWeek !== 6 &&  // Saturday
      dayOfWeek !== 0     // Sunday
  )
}

process.on('exit', async () => {
  await pool.end();
  console.log('Pool has ended');
});
