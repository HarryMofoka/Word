/**
 * QVAC On-Device AI Quickstart & Benchmark Script for Word
 *
 * Usage (requires @qvac/sdk installed in a Node.js >=20 environment):
 *   node scripts/qvac-quickstart.mjs            # device compatibility & fit check only
 *   node scripts/qvac-quickstart.mjs --infer    # downloads/loads LLAMA_3_2_1B_INST_Q4_0 and benchmarks inference
 */
import {
  getSystemResources,
  assessModelFit,
  loadModel,
  completion,
  unloadModel,
  LLAMA_3_2_1B_INST_Q4_0,
  close,
} from '@qvac/sdk';

const runInference = process.argv.includes('--infer');

try {
  const resources = await getSystemResources();
  const fit = await assessModelFit({
    models: [{ modelSrc: LLAMA_3_2_1B_INST_Q4_0 }],
  });

  console.log('=== QVAC Device Compatibility ===');
  console.log(
    JSON.stringify(
      {
        cpu: resources?.capabilities?.cpu?.value?.name?.value ?? 'unknown',
        totalMemoryBytes: resources?.capabilities?.memory?.totalBytes?.value ?? null,
        gpus: (resources?.capabilities?.gpus?.value ?? []).map((g) => g?.name?.value ?? 'unknown'),
        modelFitVerdict: fit?.verdict ?? 'unknown',
        modelFitReasons: fit?.reasons ?? [],
      },
      null,
      2
    )
  );

  if (runInference) {
    const memBefore = process.memoryUsage();
    const tLoadStart = performance.now();
    const modelId = await loadModel({
      modelSrc: LLAMA_3_2_1B_INST_Q4_0,
    });
    const loadTimeMs = Math.round(performance.now() - tLoadStart);
    const memAfterLoad = process.memoryUsage();

    const tInferStart = performance.now();
    const result = completion({
      modelId,
      history: [
        {
          role: 'user',
          content:
            'Interpret this payment request in 1 short sentence and ask for approval: Send 20 USDT to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e on Sepolia for Laptop purchase.',
        },
      ],
      stream: true,
    });

    let tokens = 0;
    let output = '';
    for await (const token of result.tokenStream) {
      output += token;
      tokens += 1;
    }
    const inferenceMs = Math.round(performance.now() - tInferStart);
    await unloadModel({ modelId });

    console.log('=== QVAC Inference & Memory Benchmark ===');
    console.log(
      JSON.stringify(
        {
          model: 'LLAMA_3_2_1B_INST_Q4_0',
          loadTimeMs,
          inferenceMs,
          tokens,
          tokensPerSec: Number((tokens / Math.max(inferenceMs / 1000, 0.001)).toFixed(2)),
          rssBeforeMB: Number((memBefore.rss / 1024 / 1024).toFixed(2)),
          rssAfterLoadMB: Number((memAfterLoad.rss / 1024 / 1024).toFixed(2)),
          output,
        },
        null,
        2
      )
    );
  }
} finally {
  await close().catch(() => {});
}

