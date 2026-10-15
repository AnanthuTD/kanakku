#!/usr/bin/env python3
"""Exercise real recording + bundled Whisper using pinned public speech on the test AVD."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
SDK = Path(os.environ.get('ANDROID_HOME', '/opt/homebrew/share/android-commandlinetools'))
SERIAL = 'emulator-5580'
PHYSICAL = False
APP = 'app.tinkerbox.kanakku.e2e'
ENV = {**os.environ, 'ANDROID_HOME': str(SDK),
       'JAVA_HOME': '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
       'MAESTRO_CLI_NO_ANALYTICS': '1'}

def adb(*args, timeout=12):
    result = subprocess.run([str(SDK/'platform-tools/adb'), '-s', SERIAL, *args],
                            capture_output=True, text=True, timeout=timeout, env=ENV)
    if result.returncode:
        raise RuntimeError(f'Test-device ADB operation failed: {args[0]} {args[1] if len(args)>1 else ""}')
    return result.stdout.strip()

def guard():
    if PHYSICAL:
        # A real phone: never an emulator, and only the isolated test package is driven.
        if adb('shell','getprop','ro.kernel.qemu')=='1':
            raise RuntimeError('--physical expects a real phone')
        return
    if adb('emu','avd','name').splitlines()[0] != 'Kanakku_API_36':
        raise RuntimeError('Refusing a different AVD')

def focus_guard():
    if f'{APP}/' not in adb('shell','dumpsys','window').split('mCurrentFocus=')[-1].splitlines()[0]:
        raise RuntimeError('Isolated sample app must remain foreground')

def hierarchy():
    focus_guard()
    adb('shell','uiautomator','dump','--compressed','/sdcard/kanakku-voice-ui.xml')
    return ET.fromstring(adb('shell','cat','/sdcard/kanakku-voice-ui.xml'))

def by_label(tree, label):
    return next((n for n in tree.iter('node') if n.attrib.get('content-desc') == label), None)

def center(node):
    coords=list(map(int,re.findall(r'\d+',node.attrib['bounds'])))
    return str((coords[0]+coords[2])//2),str((coords[1]+coords[3])//2)

def prepare(folder):
    # Preserve any configured credential; disable automatic requests before audio tests.
    prefs_path=None if PHYSICAL else f'/data/user/0/{APP}/shared_prefs/kanakku-merchant-provider.xml'
    # Release builds cannot be read without root on a phone; lookup is off by default there.
    prefs='' if PHYSICAL else adb('shell',f'if [ -f {prefs_path} ]; then cat {prefs_path}; fi')
    if 'name="automatic" value="true"' in prefs:
        raise RuntimeError('Disable automatic merchant lookup before audio tests')
    result=subprocess.run([str(Path.home()/'.maestro/bin/maestro'),'--device',SERIAL,'test','--no-reinstall-driver',
        '--test-output-dir',str(folder),str(ROOT/'tests/android/voice/prepare.yaml')],
        cwd=ROOT,env=ENV,capture_output=True,text=True,timeout=150)
    (folder/'prepare.log').write_text(result.stdout+result.stderr)
    if result.returncode:
        raise RuntimeError('Voice preparation flow failed; see its retained log')
    # The reused Maestro driver keeps UiAutomation registered; stop it (not uninstall)
    # so uiautomator can read the review sheet.
    adb('shell','am','force-stop','dev.mobile.maestro.test')
    adb('shell','am','force-stop','dev.mobile.maestro')

def evaluate(entry, folder):
    folder.mkdir(parents=True,exist_ok=True)
    prepare(folder)
    tree=hierarchy()
    mic=by_label(tree,'Explain payment by voice')
    if mic is None: raise RuntimeError('Expected voice action missing')
    started=time.monotonic()
    adb('shell','input','tap',*center(mic))
    deadline=time.monotonic()+45
    ready=False
    while time.monotonic()<deadline:
        # Never open the injection stream before Android opens the microphone: the
        # emulator crashes in audio_forwarder_enable when no guest input is active.
        flinger=adb('shell','dumpsys','media.audio_flinger')
        inputs=flinger.split('Input thread')[1:]
        if any(re.search(r'Standby:\s*no', block.split('\n\n')[0]) for block in inputs):
            ready=True
            break
        time.sleep(.05)
    if not ready: raise RuntimeError('Actual microphone did not reach Listening')
    if PHYSICAL:
        # Real phone microphone: play the frozen public clip through the Mac speaker.
        wav=ROOT/'tests/voice'/entry['file']
        played=time.monotonic()
        subprocess.run(['afplay',str(wav)],check=True,timeout=entry['durationSeconds']+10)
        injection_report={'status':'played-through-host-speaker','fixtureId':entry['id'],
            'fixtureSha256':hashlib.sha256(wav.read_bytes()).hexdigest(),
            'durationSeconds':entry['durationSeconds'],'elapsedSeconds':round(time.monotonic()-played,3),
            'recognitionVerified':False}
    else:
        injection=subprocess.Popen([sys.executable,str(ROOT/'scripts/inject-emulator-audio.py'),
            str(ROOT/'tests/voice'/entry['file'])],cwd=ROOT,env=ENV,
            stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        stdout,stderr=injection.communicate(timeout=entry['durationSeconds']+45)
        (folder/'injection.log').write_text(stdout+stderr)
        # Exit 3: the app stopped recording before the clip finished draining.
        if injection.returncode not in (0,3):
            raise RuntimeError('Microphone injection failed; see retained safe log')
        injection_report=json.loads(stdout.strip().splitlines()[-1])
    deadline=time.monotonic()+90
    while time.monotonic()<deadline:
        tree=hierarchy()
        if by_label(tree,'Explain payment by voice') is not None: break
    else: raise RuntimeError('Transcription did not return to an editable state')
    text=''
    for attempt in range(5):
        note=by_label(tree,'Payment note')
        if note is not None:
            text=note.attrib.get('text','')
            break
        # Scroll the observed sheet viewport, rather than guessing an element position.
        scrolls=[n for n in tree.iter('node') if n.attrib.get('scrollable')=='true']
        if not scrolls: break
        target=max(scrolls,key=lambda n: len(n.findall('.//node')))
        a=list(map(int,re.findall(r'\d+',target.attrib['bounds'])))
        x=(a[0]+a[2])//2; height=a[3]-a[1]
        adb('shell','input','swipe',str(x),str(a[1]+int(height*.8)),str(x),str(a[1]+int(height*.3)),'250')
        tree=hierarchy()
    words=[n.attrib.get('text','') for n in tree.iter('node')]
    errors=[t for t in words if t.startswith(("Offline voice couldn't finish", "Couldn't understand", "Voice took too long", 'No clear speech', 'Microphone access'))]
    row={'id':entry['id'],'text':text,'task':'translate',
         'elapsedMs':round((time.monotonic()-started)*1000),
         'injection':injection_report,'audioSource':'phone-microphone-from-host-speaker' if PHYSICAL else 'actual-emulator-microphone'}
    if errors: row['error']=errors[0]
    if not text and entry['language']!='none' and not errors:row['error']='No editable transcript appeared'
    (folder/'final-ui.xml').write_text(ET.tostring(tree,encoding='unicode'))
    return row

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case',action='append',help='Pinned fixture ID (repeatable); otherwise all fixtures')
    parser.add_argument('--physical',metavar='SERIAL',help='Real phone ADB serial; clips play through the Mac speaker')
    args=parser.parse_args()
    global SERIAL,PHYSICAL
    if args.physical:SERIAL,PHYSICAL=args.physical,True
    manifest=json.loads((ROOT/'tests/voice/manifest.json').read_text())
    selected=[e for e in manifest['fixtures'] if not args.case or e['id'] in args.case]
    if not selected:parser.error('Unknown fixture')
    guard()
    # A restarted AVD may boot with its screen off behind the keyguard.
    adb('shell','input','keyevent','KEYCODE_WAKEUP')
    if PHYSICAL and 'isKeyguardShowing=true' in adb('shell','dumpsys','window'):
        raise RuntimeError('Unlock the phone before running voice checks')
    if not PHYSICAL and 'isKeyguardShowing=true' in adb('shell','dumpsys','window'):
        # Synthetic AVD PIN documented in tests/android/pipeline/README.md.
        adb('shell','input','swipe','540','1900','540','500','250')
        time.sleep(1.5)
        adb('shell','input','text','2580')
        adb('shell','input','keyevent','KEYCODE_ENTER')
        time.sleep(2)
        if 'isKeyguardShowing=true' in adb('shell','dumpsys','window'):
            raise RuntimeError('Synthetic AVD stayed locked')
    if not PHYSICAL and adb('shell','id','-u')!='0':raise RuntimeError('Root-capable synthetic AVD required')
    apk=ROOT/'artifacts/kanakku-e2e.apk'
    verified=subprocess.run(['node','scripts/verify-apk.mjs',str(apk),'--e2e'],cwd=ROOT,env=ENV,capture_output=True,text=True)
    if verified.returncode:raise RuntimeError('APK verification failed')
    digest=hashlib.sha256(apk.read_bytes()).hexdigest()
    installed=adb('shell','pm','path',APP).removeprefix('package:')
    if adb('shell','sha256sum',installed).split()[0]!=digest:raise RuntimeError('Installed APK differs from verified artifact')
    motion=adb('shell','settings','get','global','transition_animation_scale')
    permissions=adb('shell','dumpsys','package',APP)
    mic=re.search(r'android.permission.RECORD_AUDIO: granted=(true|false)',permissions)
    if mic is None: raise RuntimeError('Cannot preserve original microphone permission')
    original_mic='granted' if mic.group(1)=='true' else 'denied'
    report={'avd':None if PHYSICAL else 'Kanakku_API_36','device':adb('shell','getprop','ro.product.model') if PHYSICAL else None,'serial':'physical' if PHYSICAL else SERIAL,'package':APP,'apkSha256':digest,
        'model':json.loads((ROOT/'src/native/voiceModel.json').read_text())['id'],
        'modelSha256':json.loads((ROOT/'src/native/voiceModel.json').read_text())['sha256'],
        'settings':{'language':'auto','translate':True,'maxThreads':4,'transitionAnimationScale':'0'},
        'hostMicrophoneEnabled':False,'audioPath':'host speaker to phone microphone' if PHYSICAL else 'emulator injection','syntheticOrLicensedAudioOnly':True,'results':[],'status':'running'}
    stamp=time.strftime('%Y%m%d-%H%M%S')
    output=ROOT/f'artifacts/whisper-android-{stamp}.json'
    folder=ROOT/f'maestro-output/native-voice/{stamp}'
    # Numeric recorder/stage diagnostics only; the test package never logs audio or text.
    # Start from now instead of clearing the device log buffer.
    diagnostics=subprocess.Popen([str(SDK/'platform-tools/adb'),'-s',SERIAL,'logcat','-T','1','-v','time','-s','KanakkuVoiceTest:*','ReactNativeJS:W'],
        stdout=open(ROOT/f'artifacts/whisper-android-{stamp}-diagnostics.log','w'),stderr=subprocess.DEVNULL,env=ENV)
    try:
        if not PHYSICAL:adb('shell','settings','put','secure','stylus_handwriting_enabled','0')
        adb('shell','settings','put','global','transition_animation_scale','0')
        for entry in selected:
            print('Evaluating',entry['id'],flush=True)
            try:row=evaluate(entry,folder/entry['id'])
            except Exception as error:
                import traceback;traceback.print_exc()
                row={'id':entry['id'],'text':'','task':'translate','error':str(error)}
            row['modelSha256']=report['modelSha256']
            report['results'].append(row)
            output.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
            print(json.dumps({'id':row['id'],'text':row['text'],'error':row.get('error')},ensure_ascii=False),flush=True)
        report['status']='collected'
    finally:
        diagnostics.terminate()
        guard()
        adb('shell','am','force-stop',APP)
        adb('shell','settings','put','global','transition_animation_scale',motion)
        if original_mic=='denied':adb('shell','pm','revoke',APP,'android.permission.RECORD_AUDIO')
        report['settingsRestored']=adb('shell','settings','get','global','transition_animation_scale')==motion
        output.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
        print('Actual outputs:',output,flush=True)

if __name__=='__main__':
    import signal
    # Interrupted runs still restore device settings in main()'s finally block.
    signal.signal(signal.SIGTERM,lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    main()
