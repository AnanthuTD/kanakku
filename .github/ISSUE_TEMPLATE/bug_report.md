---
name: Bug report
about: Something behaves wrongly
labels: bug
---

**What happened**

**What you expected**

**Steps to reproduce**

**App version** (Settings → footer) and **Android version / phone**

**Diagnostics log (optional, helps a lot).** Kanakku never uploads anything; the log stays on your phone. It contains stages, counts and timings only — no message text, amounts, names or photos. To attach it, run on a computer with ADB:

```
adb shell cat /sdcard/Android/data/app.tinkerbox.kanakku/files/diagnostics/kanakku-diagnostics.jsonl
```

**Please do not paste real SMS, account numbers or bill photos.** Describe the shape of the message instead (bank, kind of alert, which fields were wrong).
