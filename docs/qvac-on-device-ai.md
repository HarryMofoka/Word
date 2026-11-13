# Phase 8 — QVAC On-Device AI Payment Assistant

## 1. QVAC SDK Study (`@qvac/sdk@0.23.0`)
- **Package**: `@qvac/sdk` (`https://github.com/tetherto/qvac.git`)
- **Runtime architecture**: Powered by `bare-runtime` and `@qvac/llm-llamacpp` (GGUF / llama.cpp), plus `bare-cpu-info` and `bare-gpu-info` for hardware capability discovery.
- **Key SDK APIs used**:
  - `getSystemResources()` — probes CPU architecture, physical/logical cores, total RAM, and GPU drivers (Vulkan, OpenCL, Direct3D11/12, Metal, CUDA, WebGPU).
  - `assessModelFit({ models })` — fetches lightweight model metadata (without downloading weights) and returns an advisory fit verdict (`likely-fits`, `unlikely-fits`, or `unknown`) and memory budget.
  - `loadModel({ modelSrc, onProgress })` — loads a GGUF model into local memory.
  - `completion({ modelId, history, stream: true })` — runs local token-streamed inference.
  - `unloadModel({ modelId })` & `close()` — frees model memory and shuts down the Bare worker.
- **Browser vs. Native Boundary**: `@qvac/sdk` spawns native Bare addons and therefore runs in Node.js / desktop / mobile Bare workers rather than directly inside a browser Vite bundle. Word's `src/services/qvacAssistantService.ts` provides a browser-safe compatibility checker, local deterministic payment interpreter, and QVAC telemetry/runtime bridge.

## 2. Selected On-Device Models
| Model | QVAC Constant | Size (Q4_0) | Min RAM | Use Case |
| --- | --- | --- | --- | --- |
| Llama 3.2 1B Instruct | `LLAMA_3_2_1B_INST_Q4_0` | ~770 MB | 4 GB | Primary QVAC model for payment request interpretation & approval prompts |
| Qwen 2.5 0.5B Instruct | `QWEN_2_5_0_5B_INST_Q4_0` | ~400 MB | 2 GB | Memory-constrained devices (2–4 GB RAM) |
| Word Deterministic Parser | `LOCAL_DETERMINISTIC_PARSER` | 0 MB | 0.5 GB | Fallback when QVAC weights are unavailable or device is unsupported |

## 3. Measured Device Compatibility (`getSystemResources` + `assessModelFit`)
Measured on the development host using `node scripts/qvac-quickstart.mjs`:
- **CPU**: `Intel(R) Core(TM) i5-8350U CPU @ 1.70GHz` (4 physical / 8 logical cores)
- **System RAM**: `17,015,463,936` bytes (~15.85 GB)
- **GPU**: `Intel(R) UHD Graphics 620` (`vulkan: true`, `direct3d12: true`, `webgpu: false`, `cuda: false`)
- **`assessModelFit` (`LLAMA_3_2_1B_INST_Q4_0`)**:
  - `verdict`: `likely-fits`
  - `basis`: `system-memory`
  - `evidence`: `native-fit` (`native-probe-v2`)
  - `availableAfterReserveBytes`: `6,537,845,146` bytes (~6.09 GB)

## 4. Handling Unavailable Models & Unsupported Devices
- **Unavailable model weights** (`status: 'model_unavailable'`): Falls back to `word-local-deterministic-v1` so payment interpretation still runs locally with zero cloud LLM calls and displays a clear fallback notice.
- **Unsupported devices** (`status: 'unsupported_device'` when `< 2 GB` RAM, `qvacFitVerdict === 'unlikely-fits'`, or neither QVAC, WebGPU, nor WebAssembly is available): Disables local LLM weight loading cleanly without crashing and uses the zero-footprint deterministic local parser.

## 5. Data Boundary: What Stays On-Device vs. Leaves the Device
| Data | Stays On-Device | Leaves Device? | When / Where |
| --- | --- | --- | --- |
| Wallet recovery phrases & private keys | Yes (100%) | **Never** | Stripped by `sanitizeForOutboundSync` |
| Raw natural-language prompts & QVAC context | Yes (100%) | **Never** | Processed locally by QVAC / local parser |
| GGUF model weights & KV cache | Yes (100%) | **Never** | Loaded into local RAM/VRAM only |
| Hardware capability probes | Yes (100%) | **Never** | Used locally for compatibility checks |
| Payment request fields (amount, token, network, recipient, purpose) | Drafted locally | Only on explicit user action | Word Supabase Edge Functions when creating/paying a request |
| Risk assessment audit summary | Evaluated locally & server-side | Only on explicit assessment | Word Supabase `risk_assessments` table |
| Signed blockchain transaction | Signed locally | Only after explicit approval | Configured testnet RPC node |

