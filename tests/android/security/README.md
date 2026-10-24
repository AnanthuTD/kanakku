# Journal lock and recovery acceptance (dedicated AVD only)

Synthetic checks for how the journal opens (`lockMode`) and the recovery password. They change the
screen lock of the **dedicated `Kanakku_API_36` emulator** with `locksettings`, so never run them on a
phone. Verify the AVD name first; the synthetic PIN is `2580`.

```sh
A=$ANDROID_HOME/platform-tools/adb; S=emulator-5580; APP=app.tinkerbox.kanakku.e2e
[ "$($A -s $S emu avd name | head -1 | tr -d '\r')" = Kanakku_API_36 ] || exit 1
$A -s $S install -r artifacts/kanakku-e2e.apk && $A -s $S shell pm clear $APP
for p in READ_SMS RECEIVE_SMS POST_NOTIFICATIONS; do $A -s $S shell pm grant $APP android.permission.$p; done
m() { maestro --device $S test --no-reinstall-driver "$@"; }
m tests/android/security/1-connect-open.yaml            # choose "Open without asking"
$A -s $S emu sms send AD-AXISBK "Your statement for Axis Bank Credit Card no. XX8046 is generated. Due on: $(date -v+9d +%d-%m-%y) Total amt: INR Dr. 4321.50 Min amt due: INR Dr. 220.00 Pay at axisbank.com"
$A -s $S shell am force-stop $APP; m tests/android/security/2-open-no-prompt.yaml   # no prompt
$A -s $S shell am force-stop $APP; $A -s $S shell locksettings clear --old 2580
m tests/android/security/2-open-no-prompt.yaml          # open-mode key survives lock removal
$A -s $S shell locksettings set-pin 2580; $A -s $S shell am force-stop $APP
m tests/android/security/3-device-and-recovery.yaml     # switch to phone lock, set recovery password
$A -s $S shell am force-stop $APP; $A -s $S shell locksettings clear --old 2580; $A -s $S shell locksettings set-pin 2580
m tests/android/security/4-recover.yaml                 # key deleted: recovery form, journal intact
$A -s $S shell am force-stop $APP; m -e PIN=2580 tests/android/security/5-unlock-pin.yaml
```

Result on 24 Oct 2026 (beta.11 test build plus the lock work): all steps pass. Observed: changing
the PIN keeps the phone-lock key; removing the screen lock deletes it (no
`KeyPermanentlyInvalidatedException`), while the open-mode key survives.
