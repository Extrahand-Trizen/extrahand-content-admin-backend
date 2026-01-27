# Use Node.js LTS version
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev dependencies for ts-node)
RUN npm ci || npm install

# Copy application files
COPY . .

# Expose the application port
EXPOSE 5001

# Set environment to production
ENV NODE_ENV=production

# Start the application using ts-node (runs TypeScript directly)
CMD ["npx", "ts-node", "src/server.ts"]