require('dotenv').config();
const nodemailer = require('nodemailer');

checkEnvKey('API_URL');
checkEnvKey('SMTP_HOST');
checkEnvKey('SMTP_PORT');
checkEnvKey('SMTP_USER');
checkEnvKey('SMTP_PASSWORD');
checkEnvKey('EMAIL_RECIPIENT');

if (process.env.API_URL && process.env.API_URL.length > 0) {
  testScrape();
}

async function testScrape() {
  try {
    const response = await fetch(process.env.API_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
        'Referer': 'https://www.google.com/',
      },
    });

    if (!response.ok) {
      return logError(`Request API URL status error: ${response.status}`);
    }

    const json = await response.json();
    logSuccess(`API URL response: ${JSON.stringify(json)}`);

    if (
      process.env.SMTP_HOST && process.env.SMTP_HOST.length > 0 &&
      process.env.SMTP_HOST && process.env.SMTP_PORT.length > 0 &&
      process.env.SMTP_HOST && process.env.SMTP_USER.length > 0 &&
      process.env.SMTP_HOST && process.env.SMTP_PASSWORD.length > 0 &&
      process.env.SMTP_HOST && process.env.EMAIL_RECIPIENT.length > 0
    ) {
      testEmail(json.bestOffers.forex_now);
    }
  } catch (error) {
    return logError(`Request API URL error: ${error}`);
  }
}

async function testEmail(message) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  const text = `This is a test email sent from Node.js. Scrapped result: ${message}`

  let mailOptions = {
    from: `"Raspberry Pi" <${process.env.SMTP_USER}>`,
    to: process.env.EMAIL_RECIPIENT,
    subject: 'Test email',
    text,
    html: `<b>${text}</b>`
  };

  try {
    let info = await transporter.sendMail(mailOptions);
    logSuccess(`Test email sent: ${info.response}`)
  } catch (error) {
    logError(`Error sending email: ${error}`);
  }
}

function logSuccess(message) {
  const green = '\x1b[32m';
  const greenCheck = '\u2714';
  const reset = '\x1b[0m';
  console.log(`${green}${greenCheck}${reset} ${message}`);
}

function logError(message) {
  const red = '\x1b[31m';
  const redCross = '\u2718';
  const reset = '\x1b[0m';
  console.log(`${red}${redCross}${reset} ${message}`);
}

function logWarning(message) {
  const orange = '\x1b[38;5;214m';
  const exclamationMark = '!';
  const reset = '\x1b[0m';
  console.log(`${orange}${exclamationMark}${reset} ${message}`);
}

function checkEnvKey(key) {
  if (process.env[key] && process.env[key].length > 0)
    logSuccess(`${key} presents`);
  else
    logError(`No env variable ${key} in ".env"`);
}
