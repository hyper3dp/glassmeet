FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server.js ./server.js
ENV NODE_ENV=production
CMD ["npm", "start"]
