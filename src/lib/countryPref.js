export function getCountryPref() {
  try {
    return localStorage.getItem("cashbox_country") || null;
  } catch {
    return null;
  }
}

export function setCountryPref(country) {
  const currency = country === "IN" ? "INR" : "CAD";
  try {
    localStorage.setItem("cashbox_country", country);
    localStorage.setItem("cashbox_currency", currency);
  } catch {
    // ignore
  }
}

export function getCurrencyPref() {
  try {
    return localStorage.getItem("cashbox_currency") || "INR";
  } catch {
    return "INR";
  }
}