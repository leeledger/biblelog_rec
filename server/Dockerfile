FROM node:18-alpine

WORKDIR /app

# 코드 전체를 먼저 복사한 후 npm install (단순화된 접근법)
COPY . .

# Install dependencies
RUN npm install

# Expose the port the server runs on
EXPOSE 3001

# The command to start the server
CMD ["node", "server.js"]
