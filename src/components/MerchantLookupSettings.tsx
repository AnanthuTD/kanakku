import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Switch,
  TextInput,
  Linking,
  Pressable,
  AppState,
} from "react-native";
import { native } from "../native/bridge";
import {
  MerchantLookupPreferences,
  MerchantLookupResult,
  disabledMerchantLookup,
} from "../domain/merchantLookup";
import { merchantLookup } from "../services/merchantLookup";
import { Text, Button, SectionTitle } from "./ui";
import { useApp } from "../state/AppContext";
export function MerchantLookupEvidence({
  result,
}: {
  result: MerchantLookupResult;
}) {
  const { colors, setError } = useApp();
  return (
    <View testID="merchant-lookup-evidence" style={{ gap: 8 }}>
      <Text bold>Web results for {result.query}</Text>
      <Text muted style={{ fontSize: 11 }}>
        Brave Search · possible matches, not a verified payment recipient.
        Confirm the merchant yourself.
      </Text>
      {result.kind === "vpa" && (
        <Text muted style={{ fontSize: 12 }}>
          {result.sources.some((source) => source.mentionsVpa)
            ? "An exact UPI ID appears in the displayed source text. This is public evidence, not proof of ownership. Check the source before naming the merchant."
            : "No source explicitly mentions this exact UPI ID. Related results cannot identify the merchant; leave it unknown or add your own context."}
        </Text>
      )}
      {result.sources.length === 0 && (
        <Text muted>No useful public matches found. Add your own context.</Text>
      )}
      {result.sources.map((source) => (
        <Pressable
          key={source.url}
          accessibilityRole="link"
          accessibilityLabel={`Open source: ${source.title}`}
          onPress={() =>
            Linking.openURL(source.url).catch(() =>
              setError("Could not open this source."),
            )
          }
          style={{
            minHeight: 48,
            padding: 12,
            borderRadius: 12,
            backgroundColor: colors.accentSoft,
            gap: 3,
          }}
        >
          <Text bold>{source.title}</Text>
          {result.kind === "vpa" && (
            <Text style={{ fontSize: 11 }}>
              {source.mentionsVpa
                ? "Exact UPI ID mentioned"
                : "Related result · no exact UPI ID evidence"}
            </Text>
          )}
          <Text muted style={{ fontSize: 11 }}>
            {new URL(source.url).hostname}
          </Text>
          {!!source.description && (
            <Text style={{ fontSize: 12 }}>{source.description}</Text>
          )}
          {result.kind === "vpa" &&
            source.extraSnippets?.map((snippet, index) => (
              <Text key={index} style={{ fontSize: 12 }}>
                {snippet}
              </Text>
            ))}
        </Pressable>
      ))}
    </View>
  );
}
export function MerchantLookupSettings({
  onPreferencesChanged,
}: {
  onPreferencesChanged?: () => void | Promise<void>;
}) {
  const { colors, setError, setNotice } = useApp();
  const [prefs, setPrefs] = useState<MerchantLookupPreferences>(
    disabledMerchantLookup,
  );
  const [key, setKey] = useState("");
  const [query, setQuery] = useState("");
  const [approved, setApproved] = useState(false);
  const [result, setResult] = useState<MerchantLookupResult | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const requestVersion = useRef(0);
  const ownsSearch = useRef(false);
  useEffect(() => {
    let live = true;
    mounted.current = true;
    const listener = AppState.addEventListener("change", (status) => {
      if (status !== "active") {
        requestVersion.current++;
        ownsSearch.current = false;
        setResult(null);
        setKey("");
        setBusy(false);
        void merchantLookup.clear().catch(() => {});
      }
    });
    native
      ?.merchantLookupSettings()
      .then((value) => {
        if (live) setPrefs(value);
      })
      .catch(() => {});
    return () => {
      live = false;
      mounted.current = false;
      requestVersion.current++;
      listener.remove();
      if (ownsSearch.current) void merchantLookup.clear().catch(() => {});
    };
  }, []);
  const save = async () => {
    if (!native) return;
    setBusy(true);
    try {
      await merchantLookup.clear();
      setResult(null);
      setPrefs(
        await native.configureMerchantLookup(
          prefs.enabled,
          prefs.automatic,
          key,
        ),
      );
      setKey("");
      await onPreferencesChanged?.();
      setNotice(
        "Merchant lookup preferences saved. No payment details were sent.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the provider.");
    } finally {
      setBusy(false);
    }
  };
  const search = async () => {
    if (!approved) {
      setError("Confirm that the query is a public business name first.");
      return;
    }
    setBusy(true);
    setResult(null);
    ownsSearch.current = true;
    const version = ++requestVersion.current;
    try {
      const evidence = await merchantLookup.lookup(query, true);
      if (!mounted.current || version !== requestVersion.current) return;
      setResult(evidence);
      if (native) {
        const settings = await native.merchantLookupSettings();
        if (mounted.current && version === requestVersion.current)
          setPrefs(settings);
      }
    } catch (e) {
      if (mounted.current && version === requestVersion.current)
        setError(
          e instanceof Error ? e.message : "Could not look up this business.",
        );
    } finally {
      if (mounted.current && version === requestVersion.current) {
        ownsSearch.current = false;
        setBusy(false);
      }
    }
  };
  const field = {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    color: colors.text,
    fontFamily: "DMSans",
    minHeight: 48,
    padding: 14,
    fontSize: 14,
  } as const;
  return (
    <View style={{ gap: 14, marginBottom: 28 }}>
      <SectionTitle title="Optional web merchant lookup" />
      <Text muted style={{ fontSize: 12, lineHeight: 19 }}>
        Your journal works offline. If you opt in, Brave receives a public
        business name. You can separately approve sending an exact UPI ID from
        payment review. No SMS, amount, bank, account or note is sent. Other
        payment IDs are never sent. Results stay on screen briefly and never
        change a payment automatically.
      </Text>
      {!native ? (
        <Text muted>
          Provider setup is available in the Android app. This preview makes no
          search requests.
        </Text>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Text bold style={{ flex: 1 }}>
              Enable Brave lookup
            </Text>
            <Switch
              accessibilityLabel="Enable Brave merchant lookup"
              value={prefs.enabled}
              onValueChange={(enabled) => setPrefs({ ...prefs, enabled })}
              trackColor={{ true: colors.accent, false: colors.line }}
            />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View style={{ flex: 1 }}>
              <Text bold>Automatically look up public brands</Text>
              <Text muted style={{ fontSize: 11 }}>
                Only recognized public brand labels. Unknown names need your
                confirmation. UPI IDs are never searched automatically.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Automatic public brand lookup"
              value={prefs.automatic}
              disabled={!prefs.enabled}
              onValueChange={(automatic) => setPrefs({ ...prefs, automatic })}
              trackColor={{ true: colors.accent, false: colors.line }}
            />
          </View>
          <TextInput
            accessibilityLabel="Brave Search API key"
            value={key}
            onChangeText={setKey}
            placeholder={
              prefs.hasKey
                ? "Key saved · enter to replace"
                : "Your Brave Search API key"
            }
            placeholderTextColor={colors.muted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            style={field}
          />
          <Text muted style={{ fontSize: 11 }}>
            The key is encrypted with Android Keystore. Kanakku cannot guarantee
            your provider bill: set a spending limit in Brave's dashboard too.
          </Text>
          <Button disabled={busy} onPress={save}>
            {busy ? "Working…" : "Save merchant lookup preferences"}
          </Button>
          {prefs.hasKey && (
            <Button
              secondary
              disabled={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  await merchantLookup.clear();
                  setResult(null);
                  setKey("");
                  if (native) setPrefs(await native.removeMerchantLookup());
                  await onPreferencesChanged?.();
                  setNotice("Provider key removed and web lookup disabled.");
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Could not remove the provider.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Remove provider key
            </Button>
          )}
          <Text muted style={{ fontSize: 11 }}>
            Local safety caps: {prefs.dailyUsed}/{prefs.dailyLimit} attempts
            today · {prefs.monthlyUsed}/{prefs.monthlyLimit} this month. Failed
            requests also count.
          </Text>
          {prefs.enabled && prefs.hasKey && (
            <>
              <Text bold>Search a public business</Text>
              <TextInput
                accessibilityLabel="Public business search query"
                value={query}
                onChangeText={(value) => {
                  setQuery(value);
                  setApproved(false);
                  setResult(null);
                }}
                placeholder="For example, Netflix"
                placeholderTextColor={colors.muted}
                maxLength={64}
                style={field}
              />
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 14 }}
              >
                <Text style={{ flex: 1, fontSize: 12 }}>
                  I checked this is a public business name, without personal or
                  payment details.
                </Text>
                <Switch
                  accessibilityLabel="Confirm public business query"
                  value={approved}
                  onValueChange={setApproved}
                  trackColor={{ true: colors.accent, false: colors.line }}
                />
              </View>
              <Button
                secondary
                disabled={busy || !approved || !query.trim()}
                onPress={search}
              >
                Search this business
              </Button>
            </>
          )}
        </>
      )}
      {result && <MerchantLookupEvidence result={result} />}
      <Text muted style={{ fontSize: 11, lineHeight: 18 }}>
        Brave currently offers $5 in monthly credits at $5 per 1,000 search
        requests; limits and terms may change. Gemini's free model quota is
        separate from web search and its grounding terms restrict persistent
        enrichment. A small offline language model cannot search the web by
        itself.
      </Text>
      <Button
        secondary
        onPress={() =>
          Linking.openURL("https://brave.com/search/api/").catch(() =>
            setError("Could not open provider pricing."),
          )
        }
      >
        View Brave API pricing
      </Button>
    </View>
  );
}
