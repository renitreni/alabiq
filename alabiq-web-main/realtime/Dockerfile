FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js ./
ENV NODE_ENV=production PORT=4100
EXPOSE 4100
USER node
CMD ["npm", "start"]
