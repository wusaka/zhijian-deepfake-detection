"""Test: full 4-bit GPU inference with image"""
import torch
import os
os.environ['HF_HUB_OFFLINE'] = '1'

from llava.model.builder import load_deepfake_model

print("Loading model with 4-bit quantization...")
tokenizer, model, image_processor, context_len = load_deepfake_model(
    model_path='./checkpoints/llava-v1.5-7b-M2F2-Det',
    model_base=None,
    model_name='llava-v1.5-7b-M2F2-Det',
    load_4bit=True
)

print(f"GPU memory: {torch.cuda.memory_allocated()/1024**3:.2f} GB")
print(f"deepfake_encoder: {next(model.deepfake_encoder.parameters()).device}")
print(f"deepfake_projector: {next(model.deepfake_projector.parameters()).device}")

# Test with dummy image
from PIL import Image
import numpy as np
dummy_img = Image.fromarray(np.random.randint(0, 255, (336, 336, 3), dtype=np.uint8))

from llava.mm_utils import tokenizer_hybrid_token
from llava.constants import IMAGE_TOKEN_INDEX, DEEPFAKE_TOKEN_INDEX, DEFAULT_IMAGE_TOKEN

prompt = f"{DEFAULT_IMAGE_TOKEN}\nDetermine the authenticity of this image"
input_ids = tokenizer_hybrid_token(prompt, tokenizer, IMAGE_TOKEN_INDEX, DEEPFAKE_TOKEN_INDEX, return_tensors='pt').unsqueeze(0).to('cuda')

import time
print("Running 4-bit GPU inference...")
start = time.time()
try:
    with torch.inference_mode():
        output = model.generate(
            inputs=input_ids,
            images=[dummy_img],
            image_sizes=[dummy_img.size],
            deepfake_inputs=[dummy_img],
            do_sample=False,
            max_new_tokens=50,
            use_cache=True,
        )
    elapsed = time.time() - start
    result = tokenizer.decode(output[0], skip_special_tokens=True)
    print(f"SUCCESS! ({elapsed:.1f}s)")
    print(f"GPU memory after inference: {torch.cuda.memory_allocated()/1024**3:.2f} GB")
    print(f"Output: {result[:300]}")
except Exception as e:
    import traceback
    print(f"Error: {type(e).__name__}: {e}")
    traceback.print_exc()
