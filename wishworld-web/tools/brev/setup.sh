#!/usr/bin/env bash
# Everything WishWorld runs on the team's Brev GPU (one L40S, 48 GB), started in the background:
#
#   port 8000   Nemotron planner   nvidia/NVIDIA-Nemotron-Nano-9B-v2 (vLLM, OpenAI chat API)            about 23 GB
#   port 8001   Nemotron safety    nvidia/Llama-3.1-Nemotron-Safety-Guard-8B-v3 (vLLM, OpenAI chat API)  about 19 GB
#   WITH_3D=1 adds port 8002, gen3d.py (words or a photo -> .glb with TRELLIS). Not on by default: the public
#   TRELLIS Space container only runs on Hugging Face's own ZeroGPU machines, so TRELLIS needs a native install.
#
#   bash setup.sh          keys from brev-keys.env beside this script (API_KEY, GEN3D_KEY); first run downloads the models
#   bash setup.sh stop
#
# Then share ports 8000, 8001 and 8002 in the Brev console (instance -> Access -> HTTP ports) and put the links in
# Netlify: NEMOTRON_URL, NEMOTRON_SAFETY_URL (both ending in /v1), NEMOTRON_KEY = API_KEY,
# NEMOTRON_PLAN_MODEL, NEMOTRON_SAFETY_MODEL (the names below), BREV_3D_URL, BREV_3D_KEY = GEN3D_KEY.
set -euo pipefail
cd "$(dirname "$0")"
LOGS="$HOME/wishworld-logs"; mkdir -p "$LOGS"

if [ "${1:-}" = "stop" ]; then
  pkill -f "vllm serve" || true; pkill -f gen3d.py || true
  echo stopped; exit 0
fi

# Keys: from the environment, or from brev-keys.env beside this script (uploaded by hand, never committed).
if [ -f brev-keys.env ]; then set -a; . ./brev-keys.env; set +a; fi
: "${API_KEY:?set API_KEY (Nemotron) first}"
: "${GEN3D_KEY:?set GEN3D_KEY (3D generator) first}"
PLAN_MODEL="${PLAN_MODEL:-nvidia/NVIDIA-Nemotron-Nano-9B-v2}"
SAFETY_MODEL="${SAFETY_MODEL:-nvidia/Llama-3.1-Nemotron-Safety-Guard-8B-v3}"

# A virtual environment of its own (Ubuntu does not allow system-wide pip installs).
VENV="$HOME/ww-venv"
[ -x "$VENV/bin/python" ] || python3 -m venv "$VENV"
"$VENV/bin/pip" install -q --upgrade pip
# vLLM 0.11 runs on PyTorch built for CUDA 12.8; newer vLLM needs a CUDA 13 driver, which Brev's VMs do not have yet.
"$VENV/bin/pip" install -q "vllm==0.11.0" "transformers>=4.56,<5" ninja
# vLLM compiles a few kernels at start-up: ninja from the venv, nvcc from the machine's CUDA toolkit.
CUDA_HOME="${CUDA_HOME:-$(ls -d /usr/local/cuda-12* 2>/dev/null | tail -1)}"; export CUDA_HOME
export PATH="$VENV/bin:$CUDA_HOME/bin:$PATH"
[ "${WITH_3D:-0}" = "1" ] && "$VENV/bin/pip" install -q fastapi uvicorn diffusers accelerate gradio_client

serve() { # model port share-of-memory extra-args...
  local model="$1" port="$2" share="$3"; shift 3
  nohup "$VENV/bin/vllm" serve "$model" --port "$port" --api-key "$API_KEY" --max-model-len 4096 \
    --gpu-memory-utilization "$share" --trust-remote-code --enforce-eager "$@" > "$LOGS/$port.log" 2>&1 &
}
# Nemotron Nano 2 is a hybrid Mamba model: its card asks for a float32 Mamba cache. --enforce-eager (no CUDA graphs)
# avoids a start-up memory check that fails on this model with vLLM 0.11; warm requests still take about a second.
serve "$PLAN_MODEL" 8000 0.5 --mamba_ssm_cache_dtype float32
for _ in $(seq 1 120); do curl -sf -H "Authorization: Bearer $API_KEY" http://localhost:8000/v1/models >/dev/null && break; sleep 5; done
serve "$SAFETY_MODEL" 8001 0.42

if [ "${WITH_3D:-0}" = "1" ]; then
  GEN3D_KEY="$GEN3D_KEY" nohup "$VENV/bin/python" gen3d.py > "$LOGS/gen3d.log" 2>&1 &
fi

for port in 8000 8001; do
  for _ in $(seq 1 180); do curl -sf -H "Authorization: Bearer $API_KEY" "http://localhost:$port/v1/models" >/dev/null && break; sleep 5; done
  echo "port $port:"; curl -s -H "Authorization: Bearer $API_KEY" "http://localhost:$port/v1/models" | head -c 200; echo
done
echo "logs in $LOGS"
