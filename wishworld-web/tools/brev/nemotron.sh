#!/usr/bin/env bash
# Serves the Nemotron layer on a Brev GPU instance (one L4, 24 GB): the wish planner and the safety check,
# each as its own vLLM server speaking the OpenAI chat API, behind one key.
#
#   bash nemotron.sh            # start both (first run downloads the models, a few minutes)
#   bash nemotron.sh stop
#
# Then in the Brev console: the instance -> "Share a Service" -> port 8000 (planner) and 8001 (safety), and put
# the links in Netlify's environment variables:
#   NEMOTRON_URL           https://<planner link>/v1
#   NEMOTRON_SAFETY_URL    https://<safety link>/v1      (optional: without it the planner's server is asked)
#   NEMOTRON_KEY           the same value as API_KEY below
#   NEMOTRON_PLAN_MODEL    the value of PLAN_MODEL below
#   NEMOTRON_SAFETY_MODEL  the value of SAFETY_MODEL below
#
# Both models in FP8 take about 19 GB, so they fit on one L4 together. Stop the instance in the Brev console
# when it is not needed: credits are only spent while it runs.
set -euo pipefail

PLAN_MODEL="${PLAN_MODEL:-nvidia/NVIDIA-Nemotron-Nano-9B-v2}"
SAFETY_MODEL="${SAFETY_MODEL:-nvidia/Llama-3.1-Nemotron-Safety-Guard-8B-v3}"
API_KEY="${API_KEY:?set API_KEY to a long random string first, e.g. export API_KEY=\$(openssl rand -hex 24)}"
LOGS="$HOME/nemotron-logs"
mkdir -p "$LOGS"

if [ "${1:-}" = "stop" ]; then
  pkill -f "vllm serve" || true
  echo "stopped"
  exit 0
fi

if ! command -v vllm >/dev/null 2>&1; then
  python3 -m pip install --upgrade pip
  python3 -m pip install "vllm>=0.10"
fi

serve() { # model port share-of-memory
  nohup vllm serve "$1" --port "$2" --api-key "$API_KEY" --quantization fp8 --max-model-len 4096 \
    --gpu-memory-utilization "$3" --trust-remote-code > "$LOGS/$2.log" 2>&1 &
}
serve "$PLAN_MODEL" 8000 0.5
sleep 60   # let the first one claim its memory before the second starts
serve "$SAFETY_MODEL" 8001 0.42

echo "waiting for both servers..."
for port in 8000 8001; do
  for _ in $(seq 1 120); do
    curl -sf -H "Authorization: Bearer $API_KEY" "http://localhost:$port/v1/models" >/dev/null && break
    sleep 5
  done
  curl -sf -H "Authorization: Bearer $API_KEY" "http://localhost:$port/v1/models" | head -c 300; echo
done
echo "ready. Logs in $LOGS"
