#import "KMCompositionModel.h"

#if __has_include(<llama/llama.h>) && __has_include(<llama/mtmd.h>) && __has_include(<llama/mtmd-helper.h>)
#define KM_HAS_MINICPM_RUNTIME 1
#include <llama/llama.h>
#include <llama/mtmd.h>
#include <llama/mtmd-helper.h>
#include <algorithm>
#include <memory>
#include <string>
#include <thread>
#include <vector>
#else
#define KM_HAS_MINICPM_RUNTIME 0
#endif

static NSString * const KMCompositionModelErrorDomain = @"br.dev.fabiosantos.komorebi.composition-model";

#define KMCompositionLog(format, ...) NSLog(@"[CompositionScan] Runtime " format, ##__VA_ARGS__)

static void KMSetError(NSError **error, NSInteger code, NSString *message) {
  if (error) {
    *error = [NSError errorWithDomain:KMCompositionModelErrorDomain
                                 code:code
                             userInfo:@{NSLocalizedDescriptionKey: message}];
  }
}

#if KM_HAS_MINICPM_RUNTIME
namespace {
struct ModelDeleter { void operator()(llama_model *value) const { if (value) llama_model_free(value); } };
struct ContextDeleter { void operator()(llama_context *value) const { if (value) llama_free(value); } };
struct SamplerDeleter { void operator()(llama_sampler *value) const { if (value) llama_sampler_free(value); } };
struct VisionDeleter { void operator()(mtmd_context *value) const { if (value) mtmd_free(value); } };

struct KMModelState {
  std::unique_ptr<llama_model, ModelDeleter> model;
  std::unique_ptr<llama_context, ContextDeleter> context;
  std::unique_ptr<llama_sampler, SamplerDeleter> sampler;
  std::unique_ptr<mtmd_context, VisionDeleter> vision;
  const llama_vocab *vocab = nullptr;
  llama_pos past = 0;
  int32_t batchSize = 1024;
};

static bool evalChunks(KMModelState *state, mtmd_input_chunks *chunks, bool logitsLast) {
  llama_pos next = state->past;
  const int result = mtmd_helper_eval_chunks(state->vision.get(), state->context.get(), chunks,
                                              state->past, 0, state->batchSize, logitsLast, &next);
  if (result != 0) return false;
  state->past = next;
  return true;
}

static bool prefillImage(KMModelState *state, const char *path) {
  mtmd_bitmap *raw = mtmd_helper_bitmap_init_from_file(state->vision.get(), path);
  if (!raw) return false;
  std::unique_ptr<mtmd_bitmap, void(*)(mtmd_bitmap *)> bitmap(raw, mtmd_bitmap_free);
  std::unique_ptr<mtmd_input_chunks, void(*)(mtmd_input_chunks *)>
    chunks(mtmd_input_chunks_init(), mtmd_input_chunks_free);
  if (!chunks) return false;
  mtmd_input_text input = { mtmd_default_marker(), true, true };
  const mtmd_bitmap *images[] = { bitmap.get() };
  if (mtmd_tokenize(state->vision.get(), chunks.get(), &input, images, 1) != 0) return false;
  return evalChunks(state, chunks.get(), false);
}

static bool prefillPrompt(KMModelState *state, const std::string &prompt) {
  const std::string formatted =
    "<|im_start|>user\n" + prompt +
    "<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n";
  std::unique_ptr<mtmd_input_chunks, void(*)(mtmd_input_chunks *)>
    chunks(mtmd_input_chunks_init(), mtmd_input_chunks_free);
  if (!chunks) return false;
  mtmd_input_text input = { formatted.c_str(), false, true };
  if (mtmd_tokenize(state->vision.get(), chunks.get(), &input, nullptr, 0) != 0) return false;
  return evalChunks(state, chunks.get(), true);
}

static std::string tokenPiece(const llama_vocab *vocab, llama_token token) {
  std::vector<char> buffer(256);
  int count = llama_token_to_piece(vocab, token, buffer.data(), (int32_t)buffer.size(), 0, true);
  if (count < 0) {
    buffer.resize((size_t)-count);
    count = llama_token_to_piece(vocab, token, buffer.data(), (int32_t)buffer.size(), 0, true);
  }
  return count > 0 ? std::string(buffer.data(), (size_t)count) : std::string();
}

static bool decodeToken(KMModelState *state, llama_token token) {
  llama_batch batch = llama_batch_init(1, 0, 1);
  batch.n_tokens = 1;
  batch.token[0] = token;
  batch.pos[0] = state->past++;
  batch.n_seq_id[0] = 1;
  batch.seq_id[0][0] = 0;
  batch.logits[0] = 1;
  const bool ok = llama_decode(state->context.get(), batch) == 0;
  llama_batch_free(batch);
  return ok;
}
} // namespace
#endif

@interface KMCompositionModel () {
  void *_state;
}
@end

@implementation KMCompositionModel

+ (BOOL)isRuntimeAvailable {
  return KM_HAS_MINICPM_RUNTIME == 1;
}

- (nullable instancetype)initWithModelPath:(NSString *)modelPath
                                mmprojPath:(NSString *)mmprojPath
                                     error:(NSError **)error {
  self = [super init];
  if (!self) return nil;
#if KM_HAS_MINICPM_RUNTIME
  llama_backend_init();
  KMCompositionLog(@"llama backend initialized");
  std::unique_ptr<KMModelState> state(new KMModelState());

  llama_model_params modelParams = llama_model_default_params();
  modelParams.use_mmap = true;
  modelParams.use_mlock = false;
  modelParams.n_gpu_layers = 999;
  state->model.reset(llama_model_load_from_file(modelPath.fileSystemRepresentation, modelParams));
  if (!state->model) {
    KMSetError(error, 1, @"Não foi possível carregar o modelo MiniCPM-V.");
    return nil;
  }
  KMCompositionLog(@"language model loaded");

  llama_context_params contextParams = llama_context_default_params();
  contextParams.n_ctx = 2048;
  contextParams.n_batch = 1024;
  contextParams.n_ubatch = 256;
  const unsigned int cores = std::thread::hardware_concurrency();
  contextParams.n_threads = (int32_t)std::max(2u, std::min(4u, cores));
  contextParams.n_threads_batch = contextParams.n_threads;
  contextParams.flash_attn_type = LLAMA_FLASH_ATTN_TYPE_AUTO;
  state->context.reset(llama_init_from_model(state->model.get(), contextParams));
  if (!state->context) {
    KMSetError(error, 2, @"Memória insuficiente para iniciar o MiniCPM-V.");
    return nil;
  }
  KMCompositionLog(@"language context created n_ctx=%u n_batch=%u", contextParams.n_ctx, contextParams.n_batch);
  state->batchSize = (int32_t)llama_n_batch(state->context.get());
  state->vocab = llama_model_get_vocab(state->model.get());

  llama_sampler_chain_params samplerParams = llama_sampler_chain_default_params();
  state->sampler.reset(llama_sampler_chain_init(samplerParams));
  llama_sampler_chain_add(state->sampler.get(), llama_sampler_init_greedy());

  mtmd_context_params visionParams = mtmd_context_params_default();
  visionParams.use_gpu = true;
  visionParams.print_timings = false;
  visionParams.n_threads = contextParams.n_threads;
  visionParams.warmup = false;
  visionParams.image_max_tokens = -1;
  visionParams.image_max_slice_nums = 1;
  state->vision.reset(mtmd_init_from_file(mmprojPath.fileSystemRepresentation,
                                           state->model.get(), visionParams));
  if (!state->vision) {
    KMSetError(error, 3, @"O projetor visual do MiniCPM-V é inválido.");
    return nil;
  }
  KMCompositionLog(@"vision projector loaded");
  _state = state.release();
  return self;
#else
  KMSetError(error, 4, @"O runtime MiniCPM-V não foi incluído neste build.");
  return nil;
#endif
}

- (void)dealloc {
#if KM_HAS_MINICPM_RUNTIME
  delete static_cast<KMModelState *>(_state);
#endif
}

- (nullable NSString *)analyzeImageAtPath:(NSString *)imagePath
                                    prompt:(NSString *)prompt
                                     error:(NSError **)error {
#if KM_HAS_MINICPM_RUNTIME
  KMModelState *state = static_cast<KMModelState *>(_state);
  if (!state) {
    KMSetError(error, 5, @"MiniCPM-V não inicializado.");
    return nil;
  }
  llama_memory_seq_rm(llama_get_memory(state->context.get()), 0, 0, -1);
  state->past = 0;
  llama_sampler_reset(state->sampler.get());

  KMCompositionLog(@"image prefill started");
  if (!prefillImage(state, imagePath.fileSystemRepresentation)) {
    KMSetError(error, 6, @"Falha ao preparar a imagem para o MiniCPM-V.");
    return nil;
  }
  KMCompositionLog(@"image prefill completed position=%d", state->past);
  const char *utf8 = prompt.UTF8String;
  KMCompositionLog(@"prompt prefill started");
  if (!utf8 || !prefillPrompt(state, utf8)) {
    KMSetError(error, 7, @"Falha ao enviar a instrução ao MiniCPM-V.");
    return nil;
  }
  KMCompositionLog(@"prompt prefill completed position=%d", state->past);

  std::string output;
  output.reserve(512);
  for (int index = 0; index < 160; index++) {
    const llama_token token = llama_sampler_sample(state->sampler.get(), state->context.get(), -1);
    llama_sampler_accept(state->sampler.get(), token);
    if (llama_vocab_is_eog(state->vocab, token)) break;
    output += tokenPiece(state->vocab, token);
    if (!decodeToken(state, token)) {
      KMSetError(error, 8, @"A geração da análise foi interrompida.");
      return nil;
    }
    if ((index + 1) % 40 == 0) {
      KMCompositionLog(@"generated tokens=%d", index + 1);
    }
  }
  KMCompositionLog(@"generation completed bytes=%lu", (unsigned long)output.size());
  NSString *result = [[NSString alloc] initWithBytes:output.data()
                                               length:output.size()
                                             encoding:NSUTF8StringEncoding];
  if (!result.length) {
    KMSetError(error, 9, @"O MiniCPM-V não retornou uma análise.");
    return nil;
  }
  return result;
#else
  KMSetError(error, 4, @"O runtime MiniCPM-V não foi incluído neste build.");
  return nil;
#endif
}

@end
