import * as ort from 'onnxruntime-web';

let ortSession: ort.InferenceSession | null = null;
let inputName  = '';
let outputName = '';

export async function loadAIModel(): Promise<boolean> {
  try {
    ort.env.wasm.numThreads = 1;
    (ort.env.wasm as any).simd = false;

    ortSession = await ort.InferenceSession.create('/dqn_delivery.onnx', {
      executionProviders: ['wasm'],
    });

    inputName  = ortSession.inputNames[0];
    outputName = ortSession.outputNames[0];
    console.log('✅ AI loaded | input:', inputName, '| output:', outputName);
    return true;
  } catch (e: any) {
    console.error('AI Model failed:', e.message, e);
    return false;
  }
}

export interface AIDecision {
  action: number;
  qValues: number[];
  actionLabel: string;
}

const ACTION_LABELS = ['⬆ UP', '⬇ DOWN', '⬅ LEFT', '➡ RIGHT'];

export async function getAIDecision(
  agentX: number, agentY: number,
  targetX: number, targetY: number,
  destX: number,   destY: number,
  picked: boolean,
  worldW: number,  worldH: number
): Promise<AIDecision> {
  const fallback: AIDecision = {
    action: Math.floor(Math.random() * 4),
    qValues: [0, 0, 0, 0],
    actionLabel: 'RANDOM',
  };

  if (!ortSession) return fallback;

  try {
    const state = new Float32Array([
      agentX / worldW, agentY / worldH,
      targetX / worldW, targetY / worldH,
      destX / worldW,   destY / worldH,
      picked ? 1 : 0,
    ]);
    const feeds: Record<string, ort.Tensor> = {};
    feeds[inputName] = new ort.Tensor('float32', state, [1, 7]);
    const output  = await ortSession.run(feeds);
    const qvals   = Array.from(output[outputName].data as Float32Array);
    const action  = qvals.indexOf(Math.max(...qvals));
    return {
      action,
      qValues: qvals,
      actionLabel: ACTION_LABELS[action],
    };
  } catch {
    return fallback;
  }
}