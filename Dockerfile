FROM node:22-bookworm AS build
WORKDIR /app

ARG VITE_BASE_URL
ENV VITE_BASE_URL=$VITE_BASE_URL

ADD package*.json ./

RUN npm config delete proxy || true
RUN npm config delete https-proxy || true
RUN npm config set registry https://registry.npmjs.org/
RUN npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 60000

# `npm ci` — lock faylдан AYNAN o'sha versiyalarni o'rnatadi (audit D-01).
# Eski `npm install --force` lock faylni mensimasdan har buildда boshqa
# (yangiroq, sinalmagan) versiyalarni tortib kelishi mumkin edi.
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.30-alpine
COPY --from=build /app/dist /usr/share/nginx/html
ADD default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
