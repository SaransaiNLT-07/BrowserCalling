#!/usr/bin/env bash
# One-time setup for a fresh AWS EC2 Ubuntu 24.04 instance (t3.micro / t2.micro, free tier).
# Installs Docker + Compose, adds swap (1 GB RAM is not enough to build the frontend),
# caps Docker log size, and turns on automatic security updates.
#
# Usage (on the server):
#   curl -fsSL https://raw.githubusercontent.com/<you>/<repo>/main/sasi/deploy/aws-ec2-setup.sh -o setup.sh
#   sudo bash setup.sh
# or, after cloning the repo:
#   sudo bash sasi/deploy/aws-ec2-setup.sh
#
# Safe to run more than once.
set -euo pipefail

SWAP_SIZE_GB="${SWAP_SIZE_GB:-2}"
APP_USER="${SUDO_USER:-ubuntu}"

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo bash $0" >&2
  exit 1
fi

if ! grep -q 'Ubuntu' /etc/os-release; then
  echo "This script targets Ubuntu (24.04 recommended)." >&2
  exit 1
fi

step() { printf '\n==> %s\n' "$*"; }

step "Updating packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl git openssl unattended-upgrades

step "Installing Docker Engine and Compose plugin (official Docker apt repo)"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  codename="$(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${codename} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  echo "Docker already installed: $(docker --version)"
fi

step "Limiting Docker log size (prevents logs filling the disk)"
mkdir -p /etc/docker
if [[ ! -f /etc/docker/daemon.json ]]; then
  cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
JSON
fi
systemctl enable --now docker
systemctl restart docker

step "Letting user '${APP_USER}' run docker without sudo"
usermod -aG docker "${APP_USER}"

step "Adding ${SWAP_SIZE_GB} GB swap"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l "${SWAP_SIZE_GB}G" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
else
  echo "Swap already active."
fi

step "Enabling automatic security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades

step "Done"
docker --version
docker compose version
free -h
cat <<EOF

Next steps (log out and back in first so the docker group applies):
  exit
  ssh -i <key.pem> ubuntu@<server-ip>
  git clone https://github.com/<you>/<repo>.git
  cd <repo>/sasi
  bash deploy/init-env.sh <your-domain>
  nano backend/.env.production          # add the Cloudflare TURN key id + token
  docker compose -f docker-compose.prod.yml up -d --build
EOF
