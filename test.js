require('dotenv').config();
const nodemailer = require('nodemailer');

checkEnvKey('SMTP_HOST');
checkEnvKey('SMTP_PORT');
checkEnvKey('SMTP_USER');
checkEnvKey('SMTP_PASSWORD');
checkEnvKey('EMAIL_RECIPIENT');

testScrape();

async function testScrape() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const url = `https://systemkantor.aliorbank.pl/chart/PLN-USD/?from=${today}&to=${today}&range=false`;

    const response = await fetch(url, {
      headers: {
        'Accept': '*/*',
        'Accept-Language': 'en,pl;q=0.9',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Origin': 'https://kantor.aliorbank.pl',
        'Pragma': 'no-cache',
        'Referer': 'https://kantor.aliorbank.pl/',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
      },
    });

    if (!response.ok) {
      return logError(`Request API URL status error: ${response.status}`);
    }

    const json = await response.json();
    const rates = json.diagram.rates;
    const rate = rates[rates.length - 1].buy;
    logSuccess(`API response rate (buy): ${rate}`);

    if (
      process.env.SMTP_HOST && process.env.SMTP_HOST.length > 0 &&
      process.env.SMTP_PORT && process.env.SMTP_PORT.length > 0 &&
      process.env.SMTP_USER && process.env.SMTP_USER.length > 0 &&
      process.env.SMTP_PASSWORD && process.env.SMTP_PASSWORD.length > 0 &&
      process.env.EMAIL_RECIPIENT && process.env.EMAIL_RECIPIENT.length > 0
    ) {
      testEmail(rate);
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
