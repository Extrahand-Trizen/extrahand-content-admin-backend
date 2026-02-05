# Use Node.js LTS version
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (use npm install if package-lock.json doesn't exist)
RUN npm ci --omit=dev || npm install --omit=dev

# Copy application files
COPY . .

# Expose the application port
EXPOSE 5001

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD ["node", "server.js"]
