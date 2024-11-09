require('./create_db_table')();
require('dotenv').config();
const nodemailer = require('nodemailer');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const NOTIFY_RATE_STEP = 0.01;
const REQUEST_DELAY = 10000; // milliseconds
const WORKING_HOUR_START = 5; // UTC
const WORKING_HOUR_END = 21;  // UTC

const db = new sqlite3.Database('database.sqlite', (err) => {
  if (err)
    throw new Error(`Error opening database: ${err.message}`)
});

startFetching();

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
  return new Promise((resolve, reject) => {
    const query = `
      SELECT MAX(rate) AS highest_rate
      FROM rates
      WHERE created_at >= date('now', 'start of day')
        AND created_at < date('now', '+1 day', 'start of day')
    `;

    db.get(query, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row ? row.highest_rate : null);
      }
    });
  });
}

async function insertRateIfNoRecordsToday(rate, pair, resource) {
  return new Promise((resolve, reject) => {
    const checkQuery = `
      SELECT 1 AS one
      FROM rates
      WHERE created_at >= date('now', 'start of day')
        AND created_at < date('now', '+1 day', 'start of day')
      LIMIT 1;
    `;

    db.get(checkQuery, async (err, row) => {
      if (err) {
        console.error("Error checking for today's records:", err);
        return reject(err);
      }

      if (row && row.one === 1) {
        // console.log('Records for today already exist. No insertion made.');
        return resolve();
      } else {
        try {
          await insertRate(rate, pair, resource);
          resolve();
        } catch (error) {
          console.error("Error inserting rate:", error);
          reject(error);
        }
      }
    });
  });
}

async function insertRate(rate, pair, resource) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      db.run(
        `INSERT INTO rates (rate, pair, resource, created_at) VALUES (?, ?, ?, datetime('now'))`,
        [rate, pair, resource],
        function (err) {
          if (err) {
            console.error("Error inserting rate:", err);
            db.run('ROLLBACK', () => reject(err));
          } else {
            console.log("New rate inserted:", rate);
            db.run('COMMIT', () => resolve());
          }
        }
      );
    });
  });
}

function truncateFloat(value, decimals) {
  const stringValue = value.toString();
  const [integerPart, decimalPart] = stringValue.split('.');

  return decimalPart && decimals > 0 ? `${integerPart}.${decimalPart.slice(0, decimals)}` : integerPart;
}

async function sendMail(rate) {
  const emailProvider = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
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
    to: process.env.EMAIL_RECIPIENT,
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
  db.close((err) => {
    if (err)
      throw new Error(`Error closing database: ${err.message}`);

    console.log('Database connection closed.');
  });
});
