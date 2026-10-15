cmake_minimum_required(VERSION 3.22.1)
project(kanakku_whisper LANGUAGES C CXX)

# Offline speech recognition: vendored whisper.cpp (see whisper.cpp/VENDORED.txt), CPU only.
# Built for ARMv8.2 with fp16 and dot-product instructions; WhisperEngine.kt checks the CPU
# before loading this library, so older phones fall back to typing instead of crashing.
set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -march=armv8.2-a+fp16+dotprod")
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -march=armv8.2-a+fp16+dotprod")
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_LLAMAFILE OFF CACHE BOOL "" FORCE)
add_subdirectory(whisper.cpp)

add_library(kanakku_whisper SHARED kanakku_whisper.cpp)
target_link_libraries(kanakku_whisper PRIVATE whisper log)
target_link_options(kanakku_whisper PRIVATE "-Wl,-z,max-page-size=16384")
