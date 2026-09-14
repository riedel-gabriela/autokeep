#!/usr/bin/env bash
set -euo pipefail

stack_name="${1:-dev}"
if [[ ! "$stack_name" =~ ^[a-z][a-z0-9-]{1,20}$ ]]; then
  echo "Stack inválida: use letras minúsculas, números e hífens." >&2
  exit 2
fi

npm install
npm run test
npm run build

if ! pulumi -C infra stack select "$stack_name"; then
  pulumi -C infra stack init "$stack_name"
fi

pulumi -C infra up
