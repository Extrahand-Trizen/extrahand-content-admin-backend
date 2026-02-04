# Use Node.js LTS version
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

<<<<<<< HEAD
# Install all dependencies (including dev dependencies for ts-node)
RUN npm ci || npm install
=======
# Install dependencies (use npm install if package-lock.json doesn't exist)
RUN npm ci --omit=dev || npm install --omit=dev
>>>>>>> d0e1910d043e8417182d99ee5f84968648b89f45

# Copy application files
COPY . .

# Expose the application port
EXPOSE 5001

# Set environment to production
ENV NODE_ENV=production

<<<<<<< HEAD
# Start the application using ts-node (runs TypeScript directly)
CMD ["npx", "ts-node", "src/server.ts"]
=======
# Start the application
CMD ["node", "server.js"]
>>>>>>> d0e1910d043e8417182d99ee5f84968648b89f45
