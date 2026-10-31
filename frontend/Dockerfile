FROM node:22-alpine AS build

LABEL org.opencontainers.image.source="https://github.com/megatr0n28/jrcutz"
LABEL org.opencontainers.image.maintainer="johnathan.rodgers@gmail.com"

WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.28-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/barbershop/browser /usr/share/nginx/html
EXPOSE 80