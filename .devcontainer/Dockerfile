# syntax=docker/dockerfile:1

ARG VARIANT="20"
FROM mcr.microsoft.com/vscode/devcontainers/javascript-node:0-${VARIANT}

# Install some generally useful tools
RUN apt-get update && apt-get -y install --no-install-recommends curl git sqlite3

# Install SAP CAP SDK globally
RUN npm install -g @sap/cds-dk
WORKDIR /usr/src/app


EXPOSE 4004
CMD [ "npm", "start" ]