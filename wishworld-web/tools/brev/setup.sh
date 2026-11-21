#!/usr/bin/env bash
# Everything WishWorld runs on the team's Brev GPU (one L40S, 48 GB), started in the background:
#
#   port 8000   Nemotron planner   (vLLM, OpenAI chat API)           about 12 GB
#   port 8001   Nemotron safety    (vLLM, OpenAI chat API)           about 10 GB
#   port 7860   TRELLIS            (the Hugging Face Space's own container, private to this machine)  about 14 GB
#   port 8002   gen3d.py           (words or a photo -> .glb, uses TRELLIS and SDXL-Turbo)            about 8 GB
#
#   API_KEY=<long random> GEN3D_KEY=<long random> bash setup.sh      first run downloads the models (10 to 20 minutes)
#   bash setup.sh stop
#
# Then share ports 8000, 8001 and 8002 in the Brev console (instance -> Access -> HTTP ports) and put the links in
# Netlify: NEMOTRON_URL, NEMOTRON_SAFETY_URL (both ending in /v1), NEMOTRON_KEY = API_KEY,
# NEMOTRON_PLAN_MODEL, NEMOTRON_SAFETY_MODEL (the names below), BREV_3D_URL, BREV_3D_KEY = GEN3D_KEY.
set -euo pipefail
cd "$(dirname "$0")"
LOGS="$HOME/wishworld-logs"; mkdir -p "$LOGS"

if [ "${1:-}" = "stop" ]; then
  pkill -f "vllm serve" || true; pkill -f gen3d.py || true; docker rm -f trellis 2>/dev/null || true
  echo stopped; exit 0
fi

: "${API_KEY:?set API_KEY (Nemotron) first}"
: "${GEN3D_KEY:?set GEN3D_KEY (3D generator) first}"
PLAN_MODEL="${PLAN_MODEL:-nvidia/NVIDIA-Nemotron-Nano-9B-v2}"
SAFETY_MODEL="${SAFETY_MODEL:-nvidia/Llama-3.1-Nemotron-Safety-Guard-8B-v3}"

python3 -m pip install -q --upgrade pip
python3 -m pip install -q "vllm>=0.10" fastapi uvicorn diffusers transformers accelerate gradio_client

# TRELLIS first: it is the slowest to download, and it claims its memory before vLLM sizes itself.
if ! docker ps --format '{{.Names}}' | grep -q '^trellis$'; then
  docker run -d --name trellis --gpus all -p 127.0.0.1:7860:7860 -e GRADIO_SERVER_NAME=0.0.0.0 \
    registry.hf.space/trellis-community-trellis:latest python app.py > "$LOGS/trellis.id"
fi

serve() { # model port share-of-memory
  nohup vllm serve "$1" --port "$2" --api-key "$API_KEY" --quantization fp8 --max-model-len 4096 \
    --gpu-memory-utilization "$3" --trust-remote-code > "$LOGS/$2.log" 2>&1 &
}
serve "$PLAN_MODEL" 8000 0.25
sleep 90
serve "$SAFETY_MODEL" 8001 0.22

GEN3D_KEY="$GEN3D_KEY" nohup python3 gen3d.py > "$LOGS/gen3d.log" 2>&1 &

for port in 8000 8001; do
  for _ in $(seq 1 180); do curl -sf -H "Authorization: Bearer $API_KEY" "http://localhost:$port/v1/models" >/dev/null && break; sleep 5; done
  echo "port $port:"; curl -s -H "Authorization: Bearer $API_KEY" "http://localhost:$port/v1/models" | head -c 200; echo
done
for _ in $(seq 1 240); do curl -sf http://127.0.0.1:7860/ >/dev/null && break; sleep 5; done
echo "trellis: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:7860/)"
echo "gen3d: $(curl -s http://localhost:8002/health)"
echo "logs in $LOGS"
