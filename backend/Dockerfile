# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Run in production mode by default: enables secure cookies, disables verbose
# logging (see src/utils/logger.js) and localhost CORS fallbacks.
ENV NODE_ENV=production

# Set the working directory in the container
WORKDIR /app

# Copy package manifests first so dependency install is cached independently
# of application source changes.
COPY package*.json ./

# Deterministic, reproducible install from the lockfile (production deps only).
RUN npm ci --omit=dev

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 5000

# Define the command to run the app
CMD ["node", "src/server.js"]
