FROM node:18-alpine

RUN apk add --no-cache sqlite

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install

# Copy source code
COPY . .

CMD ["node", "app.js"]
