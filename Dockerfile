FROM node:18-slim

RUN apt-get update && apt-get install -y python3 python3-pip python3-dev gcc --no-install-recommends \
    && pip3 install pdf2docx pdfplumber openpyxl pdfminer.six --break-system-packages \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install
COPY server.js ./
EXPOSE 3000
CMD ["node", "server.js"]
