#!/usr/bin/env python3
"""Inject a pinned public test WAV into the dedicated emulator's microphone.

Uses the SDK's actual EmulatorController.injectAudio RPC. No app test endpoint,
host microphone, cloud service, transcript shortcut, or private audio is used.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import wave


ROOT = Path(__file__).resolve().parent.parent
SERIAL = "emulator-5580"
AVD = "Kanakku_API_36"
PACKAGE = "com.kanakku.app.e2e"
SDK = Path(os.environ.get("ANDROID_HOME", "/opt/homebrew/share/android-commandlinetools"))


class InjectionGuardError(RuntimeError):
    """A safe, explicitly written guard failure; never contains auth values."""


def adb(*args):
    result = subprocess.run(
        [str(SDK / "platform-tools/adb"), "-s", SERIAL, *args],
        capture_output=True, text=True, timeout=10, check=False,
    )
    if result.returncode:
        raise InjectionGuardError("Dedicated emulator ADB command failed")
    return result.stdout.strip()


def endpoint():
    if adb("emu", "avd", "name").splitlines()[0] != AVD:
        raise InjectionGuardError("Refusing a different AVD")
    directories = [
        Path.home() / "Library/Caches/TemporaryItems/avd/running",
        Path.home() / ".android/avd/running",
    ]
    if os.environ.get("XDG_RUNTIME_DIR"):
        directories.append(Path(os.environ["XDG_RUNTIME_DIR"]) / "avd/running")
    found = []
    for directory in directories:
        for file in directory.glob("pid_*.ini"):
            values = {}
            for line in file.read_text().splitlines():
                key, separator, value = line.partition("=")
                if separator:
                    values[key.strip()] = value.strip()
            if values.get("avd.name") == AVD and values.get("port.serial") == "5580":
                pid = int(file.stem.removeprefix("pid_"))
                try:
                    os.kill(pid, 0)
                except ProcessLookupError:
                    continue
                found.append(values)
    if len(found) != 1:
        raise InjectionGuardError("Expected one live dedicated emulator discovery descriptor")
    values = found[0]
    port = int(values.get("grpc.port", "0"))
    token = values.get("grpc.token", "")
    if not 1024 <= port <= 65535 or not token or "\n" in token or "\r" in token:
        raise InjectionGuardError("Authenticated local gRPC endpoint is unavailable")
    # Never print this descriptor or its token. The token is scoped to this emulator.
    return f"127.0.0.1:{port}", (("authorization", f"Bearer {token}"),)


def bindings():
    import grpc_tools
    directory = ROOT / "artifacts/grpc"
    directory.mkdir(parents=True, exist_ok=True)
    proto = SDK / "emulator/lib/emulator_controller.proto"
    if not proto.is_file():
        raise InjectionGuardError("SDK EmulatorController proto is missing")
    digest = hashlib.sha256(proto.read_bytes()).hexdigest()
    stamp = directory / "sdk-proto.sha256"
    if not stamp.exists() or stamp.read_text().strip() != digest:
        result = subprocess.run(
            [sys.executable, "-m", "grpc_tools.protoc", f"-I{proto.parent}",
             f"-I{Path(grpc_tools.__file__).parent / '_proto'}",
             f"--python_out={directory}", f"--grpc_python_out={directory}", str(proto)],
            capture_output=True, timeout=15, check=False,
        )
        if result.returncode:
            raise InjectionGuardError("SDK protobuf binding generation failed")
        stamp.write_text(digest + "\n")
    sys.path.insert(0, str(directory))
    import emulator_controller_pb2 as proto_module
    import emulator_controller_pb2_grpc as service_module
    return proto_module, service_module, digest


def fixture(path):
    resolved = Path(path).resolve(strict=True)
    audio_directory = (ROOT / "tests/voice/audio").resolve()
    if resolved.parent != audio_directory or resolved.suffix != ".wav":
        raise InjectionGuardError("Only pinned tests/voice/audio WAV fixtures are allowed")
    manifest = json.loads((ROOT / "tests/voice/manifest.json").read_text())
    matches = [item for item in manifest["fixtures"]
               if (ROOT / "tests/voice" / item["file"]).resolve() == resolved]
    if len(matches) != 1:
        raise InjectionGuardError("Fixture is not in the public test manifest")
    entry = matches[0]
    digest = hashlib.sha256(resolved.read_bytes()).hexdigest()
    if digest != entry["sha256"]:
        raise InjectionGuardError("Fixture hash differs from its frozen manifest")
    with wave.open(str(resolved), "rb") as wav:
        if (wav.getnchannels(), wav.getframerate(), wav.getsampwidth(), wav.getcomptype()) != (1, 16000, 2, "NONE"):
            raise InjectionGuardError("Fixture must be uncompressed mono 16 kHz PCM16")
        duration = wav.getnframes() / wav.getframerate()
        if not 0 < duration <= 15 or abs(duration - entry["durationSeconds"]) > 0.001:
            raise InjectionGuardError("Fixture duration is invalid")
    return resolved, entry, digest, duration


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("wav", nargs="?", help="Pinned public tests/voice/audio WAV")
    parser.add_argument("--check-only", action="store_true", help="Read-only endpoint and host-microphone check")
    args = parser.parse_args()
    if not args.check_only and not args.wav:
        parser.error("wav is required unless --check-only is used")
    selected = fixture(args.wav) if args.wav else None
    import grpc
    from google.protobuf.empty_pb2 import Empty
    address, metadata = endpoint()
    proto, service, proto_hash = bindings()
    with grpc.insecure_channel(address) as channel:
        grpc.channel_ready_future(channel).result(timeout=5)
        stub = service.EmulatorControllerStub(channel)
        state = stub.getMicrophoneState(Empty(), metadata=metadata, timeout=5)
        if state.realAudioEnabled:
            raise InjectionGuardError("Host microphone is enabled; refusing microphone injection")
        report = {
            "avd": AVD, "serial": SERIAL, "endpoint": address,
            "sdkProtoSha256": proto_hash, "hostMicrophoneEnabled": False,
            "status": "authenticated-read-only-check-passed",
        }
        if args.check_only:
            print(json.dumps(report))
            return
        focus = adb("shell", "dumpsys", "window")
        focused = [line for line in focus.splitlines() if "mCurrentFocus=" in line]
        if len(focused) != 1 or f"{PACKAGE}/" not in focused[0]:
            raise InjectionGuardError("Isolated Kanakku E2E app must be foreground before injection")
        path, entry, audio_hash, duration = selected
        format = proto.AudioFormat(
            format=proto.AudioFormat.AUD_FMT_S16, channels=proto.AudioFormat.Mono,
            samplingRate=16000, mode=proto.AudioFormat.MODE_UNSPECIFIED,
        )
        chunks = 0
        frames = 0
        started = time.monotonic()
        # The emulator drains injected audio only while the app is recording. The app
        # legitimately stops after trailing silence, so bound the stream to the clip.
        deadline = duration + 12
        report.update({
            "status": "microphone-injection-rpc-starting", "fixtureId": entry["id"],
            "fixtureSha256": audio_hash, "durationSeconds": duration,
            "deliveryMode": "MODE_UNSPECIFIED", "recognitionVerified": False,
        })
        print(json.dumps(report), flush=True)

        def packets():
            nonlocal chunks, frames
            with wave.open(str(path), "rb") as wav:
                while wav.tell() < wav.getnframes():
                    if time.monotonic() - started > deadline:
                        raise InjectionGuardError("Injection deadline exceeded")
                    # At most 100 ms; below the emulator's approximately 300 ms buffer.
                    audio = wav.readframes(1600)
                    chunks += 1
                    frames += len(audio) // 2
                    yield proto.AudioPacket(format=format, audio=audio)

        try:
            stub.injectAudio(packets(), metadata=metadata, timeout=deadline)
        except grpc.RpcError as error:
            if error.code() == grpc.StatusCode.DEADLINE_EXCEEDED:
                # A cut-off stream restores the previous gate asynchronously. Never leave
                # the host microphone enabled: wait briefly, then close it explicitly.
                closed_by_force = False
                for _ in range(25):
                    if not stub.getMicrophoneState(Empty(), metadata=metadata, timeout=5).realAudioEnabled:
                        break
                    time.sleep(0.2)
                else:
                    stub.setMicrophoneState(proto.MicrophoneState(realAudioEnabled=False),
                                            metadata=metadata, timeout=5)
                    closed_by_force = True
                if stub.getMicrophoneState(Empty(), metadata=metadata, timeout=5).realAudioEnabled:
                    raise InjectionGuardError("Host microphone gate was not restored after injection")
                report["hostMicrophoneGateClosedByForce"] = closed_by_force
                # Not a pass by itself: the harness still reads the app's own result.
                report.update({
                    "status": "microphone-injection-stalled-after-app-stopped-recording",
                    "submittedFrames": frames, "chunks": chunks,
                    "elapsedSeconds": round(time.monotonic() - started, 3),
                    "hostMicrophoneDisabledAfterInjection": True,
                    "recognitionVerified": False,
                })
                print(json.dumps(report), flush=True)
                sys.exit(3)
            print(json.dumps({
                "status": "microphone-injection-rpc-failed", "fixtureId": entry["id"],
                "reason": f"gRPC {error.code().name}", "submittedFrames": frames,
                "chunks": chunks, "elapsedSeconds": round(time.monotonic() - started, 3),
                "recognitionVerified": False,
            }), file=sys.stderr, flush=True)
            raise
        # The forwarding driver restores the previous disabled host-mic gate.
        restored = stub.getMicrophoneState(Empty(), metadata=metadata, timeout=5)
        if restored.realAudioEnabled:
            raise InjectionGuardError("Host microphone gate was not restored after injection")
        if frames != round(duration * 16000):
            raise InjectionGuardError("Injection did not submit all fixture frames")
        report.update({
            "status": "microphone-injection-rpc-completed", "fixtureId": entry["id"],
            "fixtureSha256": audio_hash, "sampleRate": 16000, "channels": 1,
            "sampleWidth": 2, "deliveryMode": "MODE_UNSPECIFIED",
            "durationSeconds": duration, "submittedFrames": frames, "chunks": chunks,
            "elapsedSeconds": round(time.monotonic() - started, 3),
            "hostMicrophoneDisabledAfterInjection": True,
            "recognitionVerified": False,
        })
        print(json.dumps(report))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # gRPC details/discovery values must never expose the authentication token.
        try:
            import grpc
            reason = (f"gRPC {error.code().name}" if isinstance(error, grpc.RpcError)
                      else str(error) if isinstance(error, InjectionGuardError)
                      else type(error).__name__)
        except ImportError:
            reason = type(error).__name__
        print(json.dumps({"status": "failed", "reason": reason}), file=sys.stderr)
        sys.exit(1)
