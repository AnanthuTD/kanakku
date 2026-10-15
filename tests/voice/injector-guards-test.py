#!/usr/bin/env python3
"""Read-only host checks for companion-only microphone injection guards."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
import tempfile
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("inject_emulator_audio", ROOT / "scripts/inject-emulator-audio.py")
injector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(injector)

PACKAGE = injector.PACKAGE
WINDOW = f"""WINDOW MANAGER WINDOWS
  Window #0 Window{{123 u0 {PACKAGE}}}:
    mAttrs={{ty=APPLICATION_OVERLAY}}
    isOnScreen=true
    isVisible=true
  mCurrentFocus=Window{{456 u0 com.android.launcher3/com.android.launcher3.Launcher}}
"""
SERVICE = f"""ACTIVITY MANAGER SERVICES
  * ServiceRecord{{abc u0 {PACKAGE}/expo.modules.kanakku.AvatarService}}:
    packageName={PACKAGE}
    isForeground=true foregroundId=42 types=0x40000080
"""
AUDIO = "Input thread 0x123 type 1 (RECORD):\n  Standby: no\n  Sample rate: 16000\n\n"


class CompanionGuards(unittest.TestCase):
    def test_exact_visible_native_overlay_and_microphone_service_allow_launcher_focus(self):
        injector.companion_context(WINDOW, SERVICE, AUDIO)

    def test_numeric_overlay_type_and_decimal_foreground_type_are_accepted(self):
        injector.companion_context(WINDOW.replace("APPLICATION_OVERLAY", "2038"),
                                   SERVICE.replace("types=0x40000080", "foregroundServiceType=1073741952"), AUDIO)

    def test_rejects_personal_package_and_suffix_lookalikes(self):
        for package in ["app.tinkerbox.kanakku", PACKAGE + ".other"]:
            with self.subTest(package=package), self.assertRaises(injector.InjectionGuardError):
                injector.companion_context(WINDOW.replace(PACKAGE, package), SERVICE.replace(PACKAGE, package), AUDIO)

    def test_rejects_hidden_or_nonoverlay_windows(self):
        for source in [WINDOW.replace("isOnScreen=true", "isOnScreen=false"),
                       WINDOW.replace("isVisible=true", "isVisible=false"),
                       WINDOW.replace("APPLICATION_OVERLAY", "BASE_APPLICATION")]:
            with self.subTest(source=source), self.assertRaises(injector.InjectionGuardError):
                injector.companion_context(source, SERVICE, AUDIO)

    def test_foreign_overlay_cannot_borrow_other_windows_package_or_service(self):
        foreign = WINDOW.replace(PACKAGE, "com.other.overlay") + f"\n mCurrentFocus={PACKAGE}/.MainActivity\n"
        with self.assertRaises(injector.InjectionGuardError):
            injector.companion_context(foreign, SERVICE, AUDIO)

    def test_rejects_nonmicrophone_or_background_or_different_service(self):
        for source in [SERVICE.replace("0x40000080", "0x40000000"),
                       SERVICE.replace("isForeground=true", "isForeground=false"),
                       SERVICE.replace("AvatarService", "OtherService"),
                       SERVICE.replace(PACKAGE, PACKAGE + ".other")]:
            with self.subTest(source=source), self.assertRaises(injector.InjectionGuardError):
                injector.companion_context(WINDOW, source, AUDIO)

    def test_rejects_no_recording_or_standby_input_even_if_fgs_type_is_set(self):
        for source in ["", "Output thread 123\nStandby: no\n", AUDIO.replace("Standby: no", "Standby: yes")]:
            with self.subTest(source=source), self.assertRaises(injector.InjectionGuardError):
                injector.companion_context(WINDOW, SERVICE, source)

    def test_foreign_service_cannot_borrow_component_from_history(self):
        foreign = SERVICE.replace("AvatarService", "OtherService") + f"\n history: {PACKAGE}/expo.modules.kanakku.AvatarService\n"
        with self.assertRaises(injector.InjectionGuardError):
            injector.companion_context(WINDOW, foreign, AUDIO)


class HostMicrophoneCleanup(unittest.TestCase):
    def setUp(self):
        self.stub = SimpleNamespace(getMicrophoneState=Mock(), setMicrophoneState=Mock())
        self.proto = SimpleNamespace(MicrophoneState=lambda **kwargs: SimpleNamespace(**kwargs))
        self.empty = lambda: None
        self.metadata = (("authorization", "synthetic-test-only"),)

    def cleanup(self):
        return injector.restore_host_microphone(self.stub, self.proto, self.empty, self.metadata)

    def test_already_disabled_gate_needs_no_mutation(self):
        self.stub.getMicrophoneState.return_value = SimpleNamespace(realAudioEnabled=False)
        self.assertFalse(self.cleanup())
        self.stub.setMicrophoneState.assert_not_called()

    def test_delayed_restore_is_observed_without_enabling_host_microphone(self):
        self.stub.getMicrophoneState.side_effect = [SimpleNamespace(realAudioEnabled=True), SimpleNamespace(realAudioEnabled=False)]
        with patch.object(injector.time, "sleep"):
            self.assertFalse(self.cleanup())
        self.stub.setMicrophoneState.assert_not_called()

    def test_stuck_gate_is_explicitly_disabled_and_verified(self):
        self.stub.getMicrophoneState.side_effect = [SimpleNamespace(realAudioEnabled=True)] * 25 + [SimpleNamespace(realAudioEnabled=False)]
        with patch.object(injector.time, "sleep"):
            self.assertTrue(self.cleanup())
        self.assertFalse(self.stub.setMicrophoneState.call_args.args[0].realAudioEnabled)

    def test_failed_state_read_still_attempts_disabled_gate(self):
        self.stub.getMicrophoneState.side_effect = [RuntimeError("not exposed"), SimpleNamespace(realAudioEnabled=False)]
        self.assertTrue(self.cleanup())
        self.stub.setMicrophoneState.assert_called_once()

    def test_cleanup_failure_reports_only_fixed_safe_message(self):
        self.stub.getMicrophoneState.side_effect = RuntimeError("private auth token")
        self.stub.setMicrophoneState.side_effect = RuntimeError("private auth token")
        with self.assertRaisesRegex(injector.InjectionGuardError, "^Unable to verify disabled host microphone after injection$"):
            self.cleanup()


class AuthenticatedDiscovery(unittest.TestCase):
    def discover(self, name="pid_123_info.ini", port="5580", duplicate=False, process=None):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            directory = root / "Library/Caches/TemporaryItems/avd/running"
            directory.mkdir(parents=True)
            values = f"avd.name={injector.AVD}\nport.serial={port}\ngrpc.port=8554\ngrpc.token=synthetic-not-a-real-key\n"
            (directory / name).write_text(values)
            if duplicate:
                (directory / "pid_123.ini").write_text(values)
            command = process or f"{injector.SDK}/emulator/qemu/darwin-aarch64/qemu-system-aarch64-headless -avd {injector.AVD} -port 5580 -grpc 8554 -grpc-use-token"
            with patch.object(injector.Path, "home", return_value=root), \
                    patch.object(injector, "adb", return_value=injector.AVD), \
                    patch.object(injector.os, "kill"), \
                    patch.object(injector.subprocess, "run", return_value=SimpleNamespace(stdout=command, returncode=0)), \
                    patch.dict(injector.os.environ, {"TMPDIR": str(root / "tmp"), "XDG_RUNTIME_DIR": str(root / "xdg")}):
                return injector.endpoint()

    def test_current_sdk_info_filename_and_authenticated_loopback_endpoint(self):
        address, metadata = self.discover()
        self.assertEqual(address, "127.0.0.1:8554")
        self.assertEqual(metadata[0][0], "authorization")
        self.assertTrue(metadata[0][1].startswith("Bearer "))

    def test_descriptor_serial_spelling_and_old_filename_remain_supported(self):
        self.assertEqual(self.discover(name="pid_123.ini", port=injector.SERIAL)[0], "127.0.0.1:8554")

    def test_duplicate_descriptors_for_same_process_and_endpoint_are_deduplicated(self):
        self.assertEqual(self.discover(duplicate=True)[0], "127.0.0.1:8554")

    def test_stale_pid_reuse_by_other_process_is_rejected(self):
        with self.assertRaisesRegex(injector.InjectionGuardError, "Authenticated dedicated emulator discovery is unavailable"):
            self.discover(process="/usr/bin/other-program -avd Kanakku_API_36 -port 5580")

    def test_mismatched_avd_process_is_rejected(self):
        with self.assertRaises(injector.InjectionGuardError):
            self.discover(process=f"{injector.SDK}/emulator/qemu/darwin-aarch64/qemu-system-aarch64-headless -avd Other_AVD -port 5580")


if __name__ == "__main__":
    unittest.main()
