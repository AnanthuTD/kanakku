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
import re
import shlex
import subprocess
import sys
import time
import wave


ROOT = Path(__file__).resolve().parent.parent
SERIAL = "emulator-5580"
AVD = "Kanakku_API_36"
PACKAGE = "app.tinkerbox.kanakku.e2e"
SDK = Path(os.environ.get("ANDROID_HOME", "/opt/homebrew/share/android-commandlinetools"))


class InjectionGuardError(RuntimeError):
    """A safe, explicitly written guard failure; never contains auth values."""


def companion_context(window_dump, service_dump, audio_dump):
    """Fail closed on another package, a hidden overlay or an idle microphone service."""
    package = re.escape(PACKAGE)
    owner = re.compile(rf"(?<![\w.]){package}(?![\w.])")
    windows = re.split(r"(?m)^\s*Window #\d+\s+Window\{", window_dump)[1:]
    visible = any((owner.search(block.splitlines()[0])
                   or re.search(rf"\bpackageName={package}(?![\w.])", block))
                  and re.search(r"\b(?:ty|type)=(?:2038|APPLICATION_OVERLAY)\b", block)
                  and re.search(r"\bisOnScreen\s*=\s*true\b", block)
                  and re.search(r"\bisVisible\s*=\s*true\b", block)
                  for block in windows)
    if not visible:
        raise InjectionGuardError("Exact isolated Kanakku companion overlay must be visible")
    services = re.split(r"(?m)^\s*\*\s+ServiceRecord\{", service_dump)[1:]
    component = re.compile(rf"(?<![\w.]){package}/expo\.modules\.kanakku\.AvatarService(?=[\s}}])")
    microphone = False
    for block in services:
        # Restrict matching to the service header, never a component mentioned in its history.
        if not component.search(block.splitlines()[0]):
            continue
        mask = re.search(r"\b(?:types|foregroundServiceType)\s*=\s*(0x[\da-fA-F]+|\d+)\b", block)
        if (re.search(r"\bisForeground\s*=\s*true\b", block)
                and mask and int(mask[1], 16 if mask[1].startswith("0x") else 10) & 128):
            microphone = True
    if not microphone:
        raise InjectionGuardError("Isolated AvatarService must have active microphone foreground type")
    inputs = audio_dump.split("Input thread")[1:]
    if not any(re.search(r"\bStandby:\s*no\b", block.split("\n\n")[0]) for block in inputs):
        raise InjectionGuardError("Actual emulator microphone input is not recording")


def guard_companion(timeout=4):
    deadline = time.monotonic() + timeout
    while True:
        try:
            companion_context(adb("shell", "dumpsys", "window"),
                              adb("shell", "dumpsys", "activity", "services", PACKAGE),
                              adb("shell", "dumpsys", "media.audio_flinger"))
            return
        except InjectionGuardError as error:
            if str(error) != "Actual emulator microphone input is not recording" or time.monotonic() >= deadline:
                raise
            # A microphone FGS can be active just before AudioRecord actually opens.
            time.sleep(0.05)


def restore_host_microphone(stub, proto, empty, metadata):
    """Restore the disabled host gate after every RPC outcome, including non-deadline errors."""
    closed_by_force = False
    deadline = time.monotonic() + 5
    for _ in range(25):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        try:
            if not stub.getMicrophoneState(empty(), metadata=metadata, timeout=min(1, remaining)).realAudioEnabled:
                return closed_by_force
        except Exception:
            # A failed read must still attempt the explicit disabled gate below.
            break
        time.sleep(0.2)
    try:
        stub.setMicrophoneState(proto.MicrophoneState(realAudioEnabled=False), metadata=metadata, timeout=5)
        closed_by_force = True
        if stub.getMicrophoneState(empty(), metadata=metadata, timeout=5).realAudioEnabled:
            raise InjectionGuardError("Host microphone gate was not restored after injection")
    except Exception as error:
        if isinstance(error, InjectionGuardError):
            raise
        raise InjectionGuardError("Unable to verify disabled host microphone after injection") from None
    return closed_by_force


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
        Path(os.environ.get("TMPDIR", "/tmp")) / "avd/running",
    ]
    if os.environ.get("XDG_RUNTIME_DIR"):
        directories.append(Path(os.environ["XDG_RUNTIME_DIR"]) / "avd/running")
    found = {}
    seen = set()
    for directory in directories:
        for file in directory.glob("pid_*.ini"):
            if file.resolve() in seen:
                continue
            seen.add(file.resolve())
            values = {}
            for line in file.read_text().splitlines():
                key, separator, value = line.partition("=")
                if separator:
                    values[key.strip()] = value.strip()
            if values.get("avd.name") == AVD and values.get("port.serial") in {"5580", SERIAL}:
                pid_match = re.fullmatch(r"pid_(\d+)(?:_info)?\.ini", file.name)
                if not pid_match:
                    continue
                pid = int(pid_match[1])
                try:
                    os.kill(pid, 0)
                except ProcessLookupError:
                    continue
                # Reject descriptors whose PID has been reused by a different process.
                command = subprocess.run(["ps", "-p", str(pid), "-o", "command="], capture_output=True,
                                         text=True, timeout=5, check=False)
                args = shlex.split(command.stdout)
                if not args or not args[0].startswith(str(SDK / "emulator/qemu") + "/"):
                    continue
                if "-avd" not in args or args[args.index("-avd") + 1:args.index("-avd") + 2] != [AVD]:
                    continue
                if "-port" not in args or args[args.index("-port") + 1:args.index("-port") + 2] != ["5580"]:
                    continue
                identity = (pid, values.get("grpc.port"), values.get("grpc.token"))
                found[identity] = values
    if len(found) != 1:
        raise InjectionGuardError("Authenticated dedicated emulator discovery is unavailable; restart this AVD with --grpc")
    values = next(iter(found.values()))
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
    parser.add_argument("--companion", action="store_true", help="Require the exact visible native companion and active microphone FGS instead of app foreground")
    parser.add_argument("--wait-for-companion", action="store_true", help="Arm the authenticated injector before the user taps the companion microphone")
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
            if args.companion:
                guard_companion()
                report.update({"recordingContext": "native-floating-companion", "overlayVerified": True,
                               "microphoneForegroundServiceVerified": True, "activeRecordingVerified": True})
            print(json.dumps(report))
            return
        if args.companion:
            report.update({"recordingContext": "native-floating-companion", "overlayVerified": True,
                           "microphoneForegroundServiceVerified": True, "activeRecordingVerified": True})
            if args.wait_for_companion:
                # Prepare gRPC before the tap so the short adaptive voice recorder cannot
                # time out while the Python runtime and authenticated channel are starting.
                print(json.dumps({**report, "status": "microphone-injection-armed"}), flush=True)
            guard_companion(timeout=30 if args.wait_for_companion else 4)
        else:
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
            try:
                stub.injectAudio(packets(), metadata=metadata, timeout=deadline)
            finally:
                report["hostMicrophoneGateClosedByForce"] = restore_host_microphone(stub, proto, Empty, metadata)
        except grpc.RpcError as error:
            if error.code() == grpc.StatusCode.DEADLINE_EXCEEDED:
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
                "hostMicrophoneDisabledAfterInjection": True,
                "hostMicrophoneGateClosedByForce": report["hostMicrophoneGateClosedByForce"],
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
