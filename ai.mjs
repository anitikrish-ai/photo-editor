/* Lazy AI module — background segmentation with RMBG-1.4 via Transformers.js (runs fully in the browser).
   Loaded only when an AI tool is used. Model files are downloaded once from Hugging Face, then cached by the browser. */
const TJS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';
const MODEL = 'briaai/RMBG-1.4';
let cached = null;

async function load(progress) {
  if (cached) return cached;
  const T = await import(TJS);
  T.env.allowLocalModels = false;
  const opts = { config: { model_type: 'custom' }, dtype: 'fp32', progress_callback: progress };
  let model;
  try { model = await T.AutoModel.from_pretrained(MODEL, { ...opts, device: navigator.gpu ? 'webgpu' : 'wasm' }); }
  catch (e) { if (!navigator.gpu) throw e; model = await T.AutoModel.from_pretrained(MODEL, { ...opts, device: 'wasm' }); }
  const processor = await T.AutoProcessor.from_pretrained(MODEL, {
    config: { do_normalize: true, do_pad: false, do_rescale: true, do_resize: true, image_mean: [0.5, 0.5, 0.5], feature_extractor_type: 'ImageFeatureExtractor', image_std: [1, 1, 1], resample: 2, rescale_factor: 0.00392156862745098, size: { width: 1024, height: 1024 } }
  });
  return (cached = { T, model, processor });
}

/** @param {HTMLCanvasElement} canvas @returns {Promise<{w:number,h:number,data:Uint8Array}>} alpha mask, one byte per pixel */
export async function segment(canvas, progress) {
  const { T, model, processor } = await load(progress);
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  const image = await T.RawImage.fromBlob(blob);
  const { pixel_values } = await processor(image);
  const { output } = await model({ input: pixel_values });
  const mask = await T.RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(image.width, image.height);
  return { w: image.width, h: image.height, data: mask.data };
}
