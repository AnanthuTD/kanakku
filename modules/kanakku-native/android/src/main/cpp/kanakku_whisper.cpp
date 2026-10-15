// JNI bridge to whisper.cpp. Audio arrives as 16 kHz mono PCM held in native memory;
// only the recognised text and language leave this file. Nothing is logged or saved.
#include <jni.h>
#include <atomic>
#include <string>
#include <vector>
#include "whisper.h"

namespace {
std::atomic<bool> g_abort{false};

bool aborted(void *) { return g_abort.load(); }
bool encoderMayBegin(whisper_context *, whisper_state *, void *) { return !g_abort.load(); }

std::string utf8(JNIEnv *env, jstring value) {
    if (!value) return {};
    const char *chars = env->GetStringUTFChars(value, nullptr);
    std::string out(chars ? chars : "");
    if (chars) env->ReleaseStringUTFChars(value, chars);
    return out;
}
}  // namespace

extern "C" JNIEXPORT void JNICALL
Java_expo_modules_kanakku_WhisperEngine_nativeAbort(JNIEnv *, jobject) {
    g_abort.store(true);
}

extern "C" JNIEXPORT void JNICALL
Java_expo_modules_kanakku_WhisperEngine_nativeReset(JNIEnv *, jobject) {
    g_abort.store(false);
}

extern "C" JNIEXPORT jobjectArray JNICALL
Java_expo_modules_kanakku_WhisperEngine_nativeTranscribe(
    JNIEnv *env, jobject, jstring jModel, jshortArray jPcm, jint threads,
    jstring jLanguage, jboolean translate, jstring jPrompt) {
    const std::string model = utf8(env, jModel);
    const std::string language = utf8(env, jLanguage);
    const std::string prompt = utf8(env, jPrompt);

    whisper_context_params contextParams = whisper_context_default_params();
    contextParams.use_gpu = false;
    contextParams.flash_attn = false;
    whisper_context *context = whisper_init_from_file_with_params(model.c_str(), contextParams);
    if (!context) {
        env->ThrowNew(env->FindClass("java/lang/IllegalStateException"),
                      "The offline voice model could not be loaded.");
        return nullptr;
    }

    const jsize count = env->GetArrayLength(jPcm);
    std::vector<float> audio(static_cast<size_t>(count));
    {
        jshort *samples = env->GetShortArrayElements(jPcm, nullptr);
        for (jsize i = 0; i < count; i++) audio[i] = static_cast<float>(samples[i]) / 32768.0f;
        env->ReleaseShortArrayElements(jPcm, samples, JNI_ABORT);
    }

    // Matches the settings validated against reference whisper.cpp on the phone:
    // greedy decoding, no temperature fallback, no timestamps, no carried context.
    whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.n_threads = threads > 0 ? threads : 4;
    params.translate = translate == JNI_TRUE;
    params.language = language.empty() ? "en" : language.c_str();
    params.initial_prompt = prompt.empty() ? nullptr : prompt.c_str();
    params.no_context = true;
    params.no_timestamps = true;
    params.single_segment = false;
    params.temperature = 0.0f;
    params.temperature_inc = 0.0f;
    params.greedy.best_of = 1;
    params.print_progress = false;
    params.print_realtime = false;
    params.print_special = false;
    params.print_timestamps = false;
    params.abort_callback = aborted;
    params.encoder_begin_callback = encoderMayBegin;

    const int result = whisper_full(context, params, audio.data(), static_cast<int>(audio.size()));
    std::fill(audio.begin(), audio.end(), 0.0f);

    std::string text;
    if (result == 0) {
        const int segments = whisper_full_n_segments(context);
        for (int i = 0; i < segments; i++) text += whisper_full_get_segment_text(context, i);
    }
    const char *detected = whisper_lang_str(whisper_full_lang_id(context));
    const std::string lang = detected ? detected : "";
    whisper_free(context);

    jobjectArray out = env->NewObjectArray(3, env->FindClass("java/lang/String"), nullptr);
    env->SetObjectArrayElement(out, 0, env->NewStringUTF(text.c_str()));
    env->SetObjectArrayElement(out, 1, env->NewStringUTF(lang.c_str()));
    env->SetObjectArrayElement(
        out, 2, env->NewStringUTF(g_abort.load() || result != 0 ? "aborted" : "ok"));
    return out;
}
