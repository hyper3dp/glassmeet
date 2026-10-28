FROM node:22-slim

WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

USER node

CMD [ "node", "server.js" ]
