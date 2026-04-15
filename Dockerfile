FROM node:20-alpine

ENV TZ=Asia/Tokyo
RUN apk add --no-cache tzdata

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3010

CMD ["node", "scheduler.mjs"]
