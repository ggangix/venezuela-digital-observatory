FROM node:20-alpine

# Install curl for health checks
RUN apk add --no-cache curl

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --production

# Copy monitor files
COPY check-status.js ./
COPY entrypoint.sh ./

# Copy import scripts
COPY import-to-mongo.js ./
COPY import-whois-to-mongo.js ./

RUN chmod +x entrypoint.sh

# Create directories
RUN mkdir -p /app/data /app/output

# Set paths for Docker environment
ENV DATA_FILE=/app/data/whois_gobve.json
ENV OUTPUT_FILE=/app/output/status.json

CMD ["./entrypoint.sh"]
