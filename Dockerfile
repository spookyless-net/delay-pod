FROM node:22.5.1-alpine3.20

WORKDIR /app

COPY package*.json .
RUN npm ci

COPY . .

EXPOSE 8080

CMD ["npm", "start"]