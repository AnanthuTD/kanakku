#!/usr/bin/env python3
"""Verify one consented public VPA request. Store metrics, never Brave source content."""
from pathlib import Path
import hashlib,json,os,re,subprocess,time,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parent.parent
ADB='/opt/homebrew/share/android-commandlinetools/platform-tools/adb'
APP='com.kanakku.app.e2e'
ENV={**os.environ,'JAVA_HOME':'/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home','ANDROID_HOME':'/opt/homebrew/share/android-commandlinetools','MAESTRO_CLI_NO_ANALYTICS':'1'}
def call(*args):
 r=subprocess.run([ADB,'-s','emulator-5580',*args],capture_output=True,text=True,timeout=15,check=True)
 return r.stdout.strip()
def ui():
 assert APP+'/' in call('shell','dumpsys','window').split('mCurrentFocus=')[-1].splitlines()[0]
 call('shell','uiautomator','dump','--compressed','/sdcard/kanakku-vpa-transient.xml')
 try:return ET.fromstring(call('shell','cat','/sdcard/kanakku-vpa-transient.xml'))
 finally:call('shell','rm','-f','/sdcard/kanakku-vpa-transient.xml')
def preferences():
 tree=ET.fromstring(call('shell','cat',f'/data/user/0/{APP}/shared_prefs/kanakku-merchant-provider.xml'))
 return {n.attrib['name']:n.attrib.get('value','') for n in tree if n.tag in ['boolean','int']}
def usage():
 p=preferences();return {name:int(p.get(name,'0')) for name in ['dailyUsed','monthlyUsed']}
assert call('emu','avd','name').splitlines()[0]=='Kanakku_API_36'
settings=preferences();assert settings.get('enabled')=='true' and settings.get('automatic')=='false'
original=call('shell','settings','get','global','transition_animation_scale')
report={'package':APP,'syntheticPayment':True,'query':'akshayapatra@kotak','kind':'vpa','reference':'https://www.bhimupi.org.in/donation-digitized-with-bhim-upi.html','sourceContentPersisted':False,'savePerformed':False,'apkSha256':hashlib.sha256((ROOT/'artifacts/kanakku-e2e.apk').read_bytes()).hexdigest(),'usageBefore':usage()}
try:
 call('shell','settings','put','global','transition_animation_scale','0')
 call('shell','settings','put','secure','stylus_handwriting_enabled','0')
 r=subprocess.run([str(Path.home()/'.maestro/bin/maestro'),'--device','emulator-5580','test','--no-reinstall-driver','--test-output-dir','maestro-output/live-vpa-preparation','tests/android/merchant-lookup/prepare-vpa.yaml'],cwd=ROOT,env=ENV,capture_output=True,text=True,timeout=150)
 (ROOT/'artifacts/live-vpa-preparation.log').write_text(r.stdout+r.stderr)
 if r.returncode:raise RuntimeError('VPA query preparation failed')
 tree=ui();button=next(n for n in tree.iter('node') if n.attrib.get('content-desc')=='Search this UPI ID' and n.attrib.get('enabled')=='true')
 c=list(map(int,re.findall(r'\d+',button.attrib['bounds'])))
 call('shell','input','tap',str((c[0]+c[2])//2),str((c[1]+c[3])//2))
 deadline=time.monotonic()+45;header=False
 while time.monotonic()<deadline:
  tree=ui();texts=[n.attrib.get('text','') for n in tree.iter('node')];labels=[n.attrib.get('content-desc','') for n in tree.iter('node')]
  errors=[t for t in texts if any(x in t for x in ['Brave rejected','Enable web','temporarily unavailable','rate limit','timed out'])]
  if errors:report.update(status='failed',error=errors[0]);break
  header=header or 'Web results for akshayapatra@kotak' in texts
  links=sum(l.startswith('Open source:') for l in labels)
  exact=any(t=='Exact UPI ID mentioned' or t.startswith('An exact UPI ID appears') for t in texts)
  identity=any(re.search(r'akshaya\s*patra',t,re.I) for t in texts if not t.startswith('Web results for'))
  if exact and identity:
   report.update(status='passed',merchantMatchVerified=True,exactVpaEvidenceVisible=True,organizationEvidenceVisible=True,visibleSourceLinks=links)
   break
  if 'No useful public matches found. Add your own context.' in texts:
   report.update(status='no_public_match',merchantMatchVerified=False);break
  # Reach the evidence heading, then inspect its source cards; no source content is saved.
  if header:call('shell','input','swipe','540','1900','540','700','250')
  else:call('shell','input','swipe','540','650','540','2000','250')
 else:report.update(status='evidence_not_verified',merchantMatchVerified=False)
 report['resultsHeadingObserved']=header
 report['usageAfter']=usage()
except Exception as e:report.update(status='failed',error=type(e).__name__)
finally:
 call('shell','am','force-stop',APP)
 call('shell','settings','put','global','transition_animation_scale',original)
 report['settingsRestored']=call('shell','settings','get','global','transition_animation_scale')==original
 (ROOT/'artifacts/native-vpa-live-results.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps(report))
