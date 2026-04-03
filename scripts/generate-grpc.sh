#!/usr/bin/env bash
set -euo pipefail

PROTO_DIR=./proto
PY_OUT=./apps/agents/shared/grpc_client

mkdir -p "${PY_OUT}"

python -m grpc_tools.protoc \
  -I"${PROTO_DIR}" \
  --python_out="${PY_OUT}" \
  --grpc_python_out="${PY_OUT}" \
  "${PROTO_DIR}/contacts.proto" \
  "${PROTO_DIR}/intelligence.proto" \
  "${PROTO_DIR}/campaigns.proto"

touch "${PY_OUT}/__init__.py"

echo "Python gRPC stubs generated successfully."
