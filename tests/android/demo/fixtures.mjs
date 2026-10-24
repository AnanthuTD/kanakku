// Fictional bank alerts for store screenshots and demo videos on the dedicated AVD only.
// Every merchant, person, amount, reference and card number here is made up.
const card = (d, rs, at, bank = "hdfc") => {
  if (bank === "axis")
    return { sender: "AX-AXISBK-S", daysAgo: d, body: `Spent INR ${rs} Axis Bank Card no. XX8046 ${"DD-MM-YY"} 19:42:10 IST ${at} Avl Limit: INR 182450.00 Not you? SMS BLOCK 8046 to 919951860002` };
  return { sender: "VM-HDFCBK-S", daysAgo: d, body: `Rs.${rs} spent on HDFC Bank Card xx4821 at ${at} on ${"DD-Mon"}. Ref ${String(612300000000 + d * 37 + Math.round(Number(rs)))}` };
};
const upi = (d, rs, to, ref) => ({ sender: "AD-KOTAKB-S", daysAgo: d, body: `Sent Rs.${rs} from Kotak Bank AC X3190 to ${to} on DD-MM-YY.UPI Ref ${ref}. Not you, https://kotak.com/KBANKT/Fraud` });
export const demoMessages = [
  // This month
  card(1, "348.00", "SWIGGY"), card(1, "189.00", "UBER INDIA"), card(2, "1,284.50", "BIGBASKET"),
  card(3, "649.00", "NETFLIX"), card(3, "412.00", "ZOMATO"), card(4, "2,499.00", "MYNTRA", "axis"),
  card(5, "260.00", "THIRD WAVE COFFEE"), card(6, "999.00", "AIRTEL"), card(7, "1,850.00", "APOLLO PHARMACY"),
  card(8, "540.00", "RAPIDO"), card(9, "3,199.00", "AMAZON", "axis"), card(10, "720.00", "SWIGGY"),
  card(11, "119.00", "SPOTIFY"), card(12, "2,340.00", "BIGBASKET"), card(13, "450.00", "BOOKMYSHOW"),
  upi(2, "1,200.00", "anand.p@okicici", "612345670101"), upi(6, "350.00", "sreeja.kitchen@oksbi", "612345670102"),
  upi(9, "15,000.00", "house.rent@okaxis", "612345670103"),
  { sender: "VM-HDFCBK-S", daysAgo: 4, body: "Refund of INR 499.00 credited to card xx4821 at MYNTRA on DD-Mon. Ref 612345670104" },
  { sender: "AD-SBIUPI-S", daysAgo: 14, body: "Dear SBI User, your A/c X5521-credited by Rs.62000 on DDMonYY transfer from TINKERBOX PAYROLL Ref No 612345670105 -SBI" },
  { sender: "AX-AXISBK-S", daysAgo: 12, body: "Your statement for Axis Bank Credit Card no. XX8046 is generated. Due on: DUE Total amt: INR Dr. 8,742.00 Min amt due: INR Dr. 440.00 Pay at axisbank.com" },
  // Last month
  card(33, "649.00", "NETFLIX"), card(34, "999.00", "AIRTEL"), card(41, "119.00", "SPOTIFY"),
  card(36, "1,920.00", "BIGBASKET"), card(38, "560.00", "SWIGGY"), card(45, "2,150.00", "DECATHLON", "axis"),
  upi(39, "15,000.00", "house.rent@okaxis", "612345670106"),
  // Two months ago
  card(63, "649.00", "NETFLIX"), card(64, "999.00", "AIRTEL"), card(71, "119.00", "SPOTIFY"),
  card(66, "2,080.00", "BIGBASKET"), upi(69, "15,000.00", "house.rent@okaxis", "612345670107"),
];
