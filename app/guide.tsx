import React from "react";
import { ScrollView, View, Pressable } from "react-native";
import { router } from "expo-router";
import { ArrowLeft, ArrowRight, Camera, Mail, Mic, MessageCircle, Repeat2, Users, ShieldCheck, Sparkles, CircleHelp } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../src/state/AppContext";
import { Button, Text, styles as ui } from "../src/components/ui";

const guides = [
  { title: "Bring in bank alerts", subtitle: "See supported SMS transactions and choose how much history to import.", icon: ShieldCheck, route: "/settings?section=bank", action: "Set up bank alerts" },
  { title: "Fill gaps with email alerts", subtitle: "If a card or bank sends useful alerts by email, connect Gmail to look for those messages. This is optional; Google asks you to approve access.", icon: Mail, route: "/settings?section=accounts", action: "Email settings" },
  { title: "Add a bill or receipt", subtitle: "Open a transaction and use its camera action. Check the extracted merchant, date, total and items before saving.", icon: Camera, route: "/settings?section=models", action: "How receipt capture works" },
  { title: "Use voice and category suggestions", subtitle: "Download optional language or suggestion packs only when you want them. Voice starts after you tap; you can edit the words before saving.", icon: Mic, route: "/settings?section=models", action: "Voice & suggestions" },
  { title: "Meet the floating helper", subtitle: "Turn it on in Reminders & helper. Android will ask for display permission; the avatar can be moved and dismissed. You can always use the in-app actions instead.", icon: Sparkles, route: "/settings?section=companion", action: "Helper settings" },
  { title: "Understand unclear payments", subtitle: "Open a payment to add a person, merchant or purpose. A saved correction can help with future matches; review the number of affected payments before saving a rule.", icon: MessageCircle, route: "/", action: "Review transactions" },
  { title: "Mark a self transfer", subtitle: "Open the payment and choose Self transfer when money moved between your own accounts. Transfers are kept out of spending totals.", icon: Repeat2, route: "/", action: "View transactions" },
  { title: "Track money lent", subtitle: "Mark a payment as Money lent to track who borrowed it, any due date and repayments separately from spending. You can remove the loan label later.", icon: Users, route: "/lending", action: "Open money lent" },
];

export default function GettingStarted() {
  const { colors, dark } = useApp();
  const insets = useSafeAreaInsets();
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <View style={[ui.between, { paddingHorizontal: 20, paddingTop: Math.max(insets.top, 18), paddingBottom: 14 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={{ width: 44, height: 44, justifyContent: "center" }}><ArrowLeft color={colors.text} size={22}/></Pressable>
      <Text bold style={{ fontSize: 17 }}>Getting started</Text><View style={{ width: 44 }}/>
    </View>
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 28, gap: 12 }}>
      <View style={{ padding: 20, borderRadius: 24, backgroundColor: colors.accent, marginBottom: 4 }}>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}><CircleHelp color={dark ? colors.text : colors.accentText} size={22}/><Text bold style={{ color: dark ? colors.text : colors.accentText, fontSize: 20 }}>Your journal, made simple</Text></View>
        <Text style={{ color: dark ? colors.text : colors.accentText, marginTop: 8, opacity: 0.92 }}>Start with bank alerts. Add the other helpers only when they are useful to you. You can skip any step and come back here later.</Text>
        <Button secondary onPress={() => router.push("/settings?section=bank")} style={{ alignSelf: "flex-start", marginTop: 14, minHeight: 44 }}>Set up bank alerts</Button>
      </View>
      {guides.map(({ title, subtitle, icon: Icon, route, action }) => <View key={title} style={{ borderRadius: 18, padding: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }}>
        <View style={{ flexDirection: "row", gap: 12 }}><View style={{ width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft }}><Icon size={19} color={colors.accent}/></View><View style={{ flex: 1 }}><Text bold style={{ fontSize: 15 }}>{title}</Text><Text muted style={{ marginTop: 4 }}>{subtitle}</Text></View></View>
        <Pressable accessibilityRole="button" onPress={() => route === "/" ? router.back() : router.push(route as never)} style={{ flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start", minHeight: 44, marginLeft: 52 }}><Text bold style={{ color: colors.accent }}>{action}</Text><ArrowRight color={colors.accent} size={15}/></Pressable>
      </View>)}
      <Text muted style={{ textAlign: "center", marginTop: 8 }}>Kanakku helps organize alerts it can access. Some banks or cards may not send every purchase alert, so your journal may not include every transaction.</Text>
    </ScrollView>
  </View>;
}
