const REPLICATE_API_BASE = "https://api.replicate.com/v1";

// arielreplicate/robust_video_matting doesn't support the model-shorthand
// predictions endpoint (404s) — pin the version and use /v1/predictions.
const RVM_MODEL_VERSION = "73d2128a371922d5d1abf0712a1d974be0e4e2358cc1218e4e34714767232bac";

type ReplicatePrediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: string | null;
  error: string | null;
};

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

export async function createVideoMattePrediction(
  inputVideoUrl: string,
  outputType: "foreground-mask" | "alpha-mask"
): Promise<string> {
  const response = await fetch(`${REPLICATE_API_BASE}/predictions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      version: RVM_MODEL_VERSION,
      input: { input_video: inputVideoUrl, output_type: outputType },
    }),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.detail ?? `Replicate prediction failed to start (${outputType})`);
  }
  return result.id;
}

export async function getPrediction(predictionId: string): Promise<ReplicatePrediction> {
  const response = await fetch(`${REPLICATE_API_BASE}/predictions/${predictionId}`, {
    headers: authHeaders(),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.detail ?? `Could not fetch prediction ${predictionId}`);
  }
  return result;
}
